/**
 * @pyreon/validation wrapper tax — adapter/bridge overhead over the RAW library.
 *
 * Run: `bun run bench:validation` (sets NODE_ENV=production).
 *
 * WHAT IT MEASURES: @pyreon/validation is a CONTRACT package — it doesn't
 * validate anything itself; it adapts zod/valibot/arktype (and any Standard
 * Schema) into the shapes Pyreon consumers eat (`parse` → ParseResult,
 * `validator` → per-key error record). The honest perf question is therefore
 * NOT "is it faster than zod" (it IS zod underneath) but "what does the
 * wrapper COST on top of the raw library call":
 *
 *   - `raw`     — the library's own parse (`safeParse` / `v.safeParse` / callable type)
 *   - `adapter` — `zodSchema(schema).parse(value)` (the typed Tier-A.1 adapter)
 *   - `bridge`  — `extractParseFn(rawSchema)(value)` (the Standard-Schema Tier-A.2 path)
 *   - `validator sync` — `standardSchemaToValidator(raw)(values)` per-key record
 *     build, which since the sync fast-path returns WITHOUT a Promise for sync
 *     schemas (the keystroke path in @pyreon/form).
 *
 * OBJECTIVITY CONTRACT (mirrors hotkeys-bench.ts / store-bench.ts):
 *  - NODE_ENV=production; real published zod / valibot / arktype builds.
 *  - CORRECTNESS GATE before timing: every path accepts the valid input and
 *    rejects the invalid one with the SAME verdict as the raw library.
 *  - PER-OP PROCESS ISOLATION (fresh `bun` child per op), VARIED INPUTS
 *    (rotating 8 distinct objects), a `sink` against DCE.
 *  - HARNESS RUNG (disclosed): duration-loop + median over windows — relative
 *    order of magnitude; sub-2x gaps are ties. ns is machine-dependent — the
 *    DELTA (wrapper − raw) is the portable signal.
 */
process.env.NODE_ENV = 'production'

import { z } from 'zod'
import * as v from 'valibot'
import { type } from 'arktype'
import { zodSchema } from '../src/zod'
import { valibotSchema } from '../src/valibot'
import { arktypeSchema } from '../src/arktype'
import { extractParseFn, standardSchemaToValidator } from '../src/schema'

// ─── schemas (same logical shape per library) ────────────────────────────────

const zodS = z.object({
  name: z.string().min(1),
  age: z.number().int().nonnegative(),
  email: z.string().email(),
  tags: z.array(z.string()),
})
const valibotS = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  age: v.pipe(v.number(), v.integer(), v.minValue(0)),
  email: v.pipe(v.string(), v.email()),
  tags: v.array(v.string()),
})
const arktypeS = type({
  name: 'string > 0',
  age: 'number.integer >= 0',
  email: 'string.email',
  tags: 'string[]',
})

// 8 rotating valid inputs + 8 invalid (bad email + negative age)
const VALID = Array.from({ length: 8 }, (_, i) => ({
  name: `user${i}`,
  age: 20 + i,
  email: `user${i}@example.com`,
  tags: ['a', `t${i}`],
}))
const INVALID = Array.from({ length: 8 }, (_, i) => ({
  name: `user${i}`,
  age: -1,
  email: 'not-an-email',
  tags: ['a'],
}))

// ─── paths under test ────────────────────────────────────────────────────────

type Fn = (value: unknown) => unknown
interface Lib {
  raw: Fn
  adapter: Fn
  bridge: Fn
  /** verdict probe for the correctness gate: true = accepted */
  verdict: { raw: (r: unknown) => boolean; adapter: (r: unknown) => boolean; bridge: (r: unknown) => boolean }
}

const LIBS: Record<string, Lib> = {
  zod: {
    raw: (x) => zodS.safeParse(x),
    adapter: (() => {
      const a = zodSchema(zodS)
      return (x: unknown) => a.parse!(x)
    })(),
    bridge: (() => {
      const p = extractParseFn(zodS)
      return (x: unknown) => p(x)
    })(),
    verdict: {
      raw: (r) => (r as { success: boolean }).success,
      adapter: (r) => (r as { ok: boolean }).ok,
      bridge: (r) => (r as { ok: boolean }).ok,
    },
  },
  valibot: {
    raw: (x) => v.safeParse(valibotS, x),
    adapter: (() => {
      const a = valibotSchema(valibotS, v.safeParse)
      return (x: unknown) => a.parse!(x)
    })(),
    bridge: (() => {
      const p = extractParseFn(valibotS)
      return (x: unknown) => p(x)
    })(),
    verdict: {
      raw: (r) => (r as { success: boolean }).success,
      adapter: (r) => (r as { ok: boolean }).ok,
      bridge: (r) => (r as { ok: boolean }).ok,
    },
  },
  arktype: {
    raw: (x) => arktypeS(x),
    adapter: (() => {
      const a = arktypeSchema(arktypeS as never)
      return (x: unknown) => a.parse!(x)
    })(),
    bridge: (() => {
      const p = extractParseFn(arktypeS)
      return (x: unknown) => p(x)
    })(),
    verdict: {
      raw: (r) => !(r instanceof type.errors),
      adapter: (r) => (r as { ok: boolean }).ok,
      bridge: (r) => (r as { ok: boolean }).ok,
    },
  },
}

// standardSchemaToValidator sync fast-path (zod): per-key record build
const zodValidator = standardSchemaToValidator(zodS)

// ─── measurement ─────────────────────────────────────────────────────────────

const now = () => Number(process.hrtime.bigint())
function measure(fn: (i: number) => void, { warmup = 2_000, iters = 10_000, runs = 11 } = {}): number {
  for (let i = 0; i < warmup; i++) fn(i)
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn(i)
    samples.push((now() - t0) / iters)
  }
  samples.sort((a, b) => a - b)
  return samples[samples.length >> 1] as number
}

let sink = 0
const use = (r: unknown) => {
  sink ^= (r as object) === undefined ? 1 : 2
}

const OPS: string[] = []
for (const lib of Object.keys(LIBS)) {
  OPS.push(`${lib} valid`, `${lib} invalid`)
}
OPS.push('validator sync (zod)')

function buildOp(op: string): Record<string, (i: number) => void> {
  if (op === 'validator sync (zod)') {
    return {
      raw: (i) => use(zodS['~standard'].validate(VALID[i % 8])),
      bridge: (i) => use(zodValidator(VALID[i % 8] as never)),
    }
  }
  const [libName, kind] = op.split(' ') as [string, 'valid' | 'invalid']
  const lib = LIBS[libName]!
  const inputs = kind === 'valid' ? VALID : INVALID
  return {
    raw: (i) => use(lib.raw(inputs[i % 8])),
    adapter: (i) => use(lib.adapter(inputs[i % 8])),
    bridge: (i) => use(lib.bridge(inputs[i % 8])),
  }
}

// ─── child mode ──────────────────────────────────────────────────────────────
const childOp = process.argv[2]
if (childOp) {
  const paths = buildOp(childOp)
  const out: Record<string, number> = {}
  for (const [name, fn] of Object.entries(paths)) out[name] = measure(fn)
  process.stdout.write(JSON.stringify(out))
  process.exit(0)
}

// ─── correctness gate ────────────────────────────────────────────────────────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[correctness] ${msg}`)
}
for (const [name, lib] of Object.entries(LIBS)) {
  assert(lib.verdict.raw(lib.raw(VALID[0])), `${name}: raw rejected a valid input`)
  assert(!lib.verdict.raw(lib.raw(INVALID[0])), `${name}: raw accepted an invalid input`)
  assert(lib.verdict.adapter(lib.adapter(VALID[0])), `${name}: adapter rejected a valid input`)
  assert(!lib.verdict.adapter(lib.adapter(INVALID[0])), `${name}: adapter accepted an invalid input`)
  assert(lib.verdict.bridge(lib.bridge(VALID[0])), `${name}: bridge rejected a valid input`)
  assert(!lib.verdict.bridge(lib.bridge(INVALID[0])), `${name}: bridge accepted an invalid input`)
}
{
  const ok = zodValidator(VALID[0] as never)
  const bad = zodValidator(INVALID[0] as never)
  assert(!(ok instanceof Promise) && !(bad instanceof Promise), 'validator: sync fast-path returned a Promise')
  assert(Object.keys(ok as object).length === 0, 'validator: valid input produced errors')
  assert(Object.keys(bad as object).length > 0, 'validator: invalid input produced no errors')
}
console.log('✓ correctness gate passed — every path agrees with the raw library\n')

declare const Bun: {
  spawnSync: (cmd: string[], opts: { env: Record<string, string | undefined> }) => {
    stdout: Uint8Array
    stderr: Uint8Array
    exitCode: number
  }
}

console.log(
  `=== @pyreon/validation wrapper tax (${process.platform}/${process.arch}, NODE_ENV=production, per-op isolated, median ns/op) ===\n`,
)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(`${pad('op', 22)} ${padL('raw', 9)} ${padL('adapter', 9)} ${padL('bridge', 9)}   wrapper tax (bridge − raw)`)
console.log('─'.repeat(92))
for (const op of OPS) {
  const proc = Bun.spawnSync(['bun', import.meta.path, op], {
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (proc.exitCode !== 0) {
    process.stderr.write(new TextDecoder().decode(proc.stderr))
    throw new Error(`child failed for op "${op}"`)
  }
  const r = JSON.parse(new TextDecoder().decode(proc.stdout)) as Record<string, number>
  const raw = r.raw ?? 0
  const bridge = r.bridge ?? 0
  console.log(
    `${pad(op, 22)} ${padL(raw.toFixed(0), 9)} ${padL(r.adapter !== undefined ? r.adapter.toFixed(0) : '—', 9)} ${padL(bridge.toFixed(0), 9)}   ${(bridge - raw).toFixed(0)} ns`,
  )
}
console.log(
  `\n(median 11×10k, per-op fresh process. The DELTA is the signal: the adapter/bridge cost on top of the raw library call. ns machine-dependent.)`,
)
if (sink === -1) console.log('')
