#!/usr/bin/env bun
/**
 * Validation-library comparison benchmark — Pyreon `s` vs Zod 4 / Valibot 1 /
 * ArkType 2. REAL installed deps (devDeps of @pyreon/validate), real parse
 * measurements. No fabricated numbers.
 *
 * Methodology (brought up to the repo's fundamentals-bench standard):
 *  - NODE_ENV=production before any import.
 *  - Equivalent schema semantics across all four libs (only features ALL
 *    four support — string/number/object/array + min/max/email/int — since
 *    Pyreon `s` v1 is a deliberate subset).
 *  - Idiomatic parse per lib: pyreon `.parse`, zod `.safeParse`,
 *    valibot `safeParse(schema, input)`, arktype `schema(input)`.
 *  - CORRECTNESS GATE before timing: every lib must agree on the verdict
 *    (valid input parses OK, invalid input fails) for every scenario —
 *    a bench of disagreeing schemas measures different work.
 *  - PER-CELL PROCESS ISOLATION: every (scenario × path × lib) cell runs in
 *    FRESH `bun` child processes, so one lib's V8 IC/JIT pollution can never
 *    skew another's numbers (the fundamentals benches established this as
 *    load-bearing).
 *  - Warmup (each lib JITs / compiles its closure on first parse — arktype
 *    especially) until stable, then timed batches.
 *  - SAMPLES POOLED ACROSS PROCS (=3) INDEPENDENT PROCESSES per cell: a
 *    within-process CI understates run-to-run variance (measured: a near-tie
 *    row flipped winner between two single-process runs); pooling across
 *    processes makes the CI cover process-level jitter, so unstable rows
 *    correctly surface as ties instead of coin-flip verdicts.
 *  - Median of the pooled samples + a seeded BOOTSTRAP 95% CI over them;
 *    rows where a competitor's CI overlaps the winner's are marked 🤝 tied
 *    (a bare multiplier like 1.1× may be inside noise).
 *  - Both VALID and INVALID input paths (error-path cost differs a lot).
 *    Error-INFORMATION parity was verified separately: on a multi-fail
 *    object Pyreon reports the same issue count with paths + messages as
 *    Zod — the error-path speed is not "reporting less".
 *
 * HONEST LIMIT (author-judge): this benchmark is written and judged by the
 * Pyreon authors — same structural caveat as the DOM suite. Only an
 * independent third-party benchmark fully resolves it. Every scenario,
 * input, and competitor call form is in this one file for review.
 *
 * Run: bun bench/validation.ts            (orchestrator — spawns cells)
 *      bun bench/validation.ts --cell K   (internal worker mode)
 */
process.env.NODE_ENV = 'production'

import { z } from 'zod'
import * as v from 'valibot'
import { type } from 'arktype'
import { s } from '../src/v1'

// ─── timing core (worker) ──────────────────────────────────────────────
const now = () => Number(process.hrtime.bigint())

function measureSamples(fn: () => void, { warmup = 5_000, iters = 50_000, runs = 12 } = {}): number[] {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    const t1 = now()
    samples.push((t1 - t0) / iters) // ns/op
  }
  return samples
}

// ─── seeded bootstrap CI95 (orchestrator) ──────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function median(xs: number[]): number {
  const c = [...xs].sort((a, b) => a - b)
  return c[Math.floor(c.length / 2)]!
}

function bootstrapCI95(samples: number[], resamples = 1000): { lo: number; hi: number } {
  const rnd = mulberry32(0xbe9c4)
  const meds: number[] = []
  for (let r = 0; r < resamples; r++) {
    const pick: number[] = []
    for (let i = 0; i < samples.length; i++) pick.push(samples[Math.floor(rnd() * samples.length)]!)
    meds.push(median(pick))
  }
  meds.sort((a, b) => a - b)
  return { lo: meds[Math.floor(resamples * 0.025)]!, hi: meds[Math.floor(resamples * 0.975)]! }
}

// ─── scenarios ─────────────────────────────────────────────────────────
type Lib = 'pyreon' | 'zod' | 'valibot' | 'arktype'
const LIBS: Lib[] = ['pyreon', 'zod', 'valibot', 'arktype']

interface Scenario {
  name: string
  /** per-lib runner for a given input */
  run: Record<Lib, (input: unknown) => unknown>
  /** per-lib verdict extractor (true = input considered valid) */
  ok: Record<Lib, (input: unknown) => boolean>
  valid: unknown
  invalid?: unknown
}

function scenarios(): Scenario[] {
  const out: Scenario[] = []
  const add = (
    name: string,
    P: { parse(i: unknown): { ok: boolean } },
    Z: { safeParse(i: unknown): { success: boolean } },
    V: unknown,
    A: (i: unknown) => unknown,
    valid: unknown,
    invalid?: unknown,
  ) => {
    out.push({
      name,
      run: {
        pyreon: (i) => P.parse(i),
        zod: (i) => Z.safeParse(i),
        valibot: (i) => v.safeParse(V as never, i),
        arktype: (i) => A(i),
      },
      ok: {
        pyreon: (i) => P.parse(i).ok,
        zod: (i) => Z.safeParse(i).success,
        valibot: (i) => v.safeParse(V as never, i).success,
        arktype: (i) => !(A(i) instanceof type.errors),
      },
      valid,
      invalid,
    })
  }

  // Scenario 1 — single string + email
  add(
    'string.email',
    s.string().email(),
    z.string().email(),
    v.pipe(v.string(), v.email()),
    type('string.email'),
    'user@example.com',
    'not-an-email',
  )

  // Scenario 2 — number with int + range
  add(
    'number.int.range',
    s.number().int().min(0).max(150),
    z.number().int().min(0).max(150),
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
    type('0 <= number.integer <= 150'),
    42,
    999,
  )

  // Scenario 3 — realistic nested user object
  add(
    'object.user',
    s.object({
      name: s.string().min(2),
      age: s.number().int().min(0).max(150),
      email: s.string().email(),
      tags: s.array(s.string()),
    }),
    z.object({
      name: z.string().min(2),
      age: z.number().int().min(0).max(150),
      email: z.string().email(),
      tags: z.array(z.string()),
    }),
    v.object({
      name: v.pipe(v.string(), v.minLength(2)),
      age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
      email: v.pipe(v.string(), v.email()),
      tags: v.array(v.string()),
    }),
    type({
      name: 'string >= 2',
      age: '0 <= number.integer <= 150',
      email: 'string.email',
      tags: 'string[]',
    }),
    { name: 'Ada', age: 36, email: 'ada@example.com', tags: ['a', 'b', 'c'] },
    { name: 'A', age: 999, email: 'nope', tags: ['a', 42] },
  )

  // Scenario 4 — array of 20 user objects (bulk)
  add(
    'array.20-objects',
    s.array(s.object({ name: s.string().min(2), age: s.number().int().min(0).max(150) })),
    z.array(z.object({ name: z.string().min(2), age: z.number().int().min(0).max(150) })),
    v.array(
      v.object({
        name: v.pipe(v.string(), v.minLength(2)),
        age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
      }),
    ),
    type({ name: 'string >= 2', age: '0 <= number.integer <= 150' }).array(),
    Array.from({ length: 20 }, (_, i) => ({ name: `User${i}`, age: 20 + (i % 50) })),
  )

  // Scenario 5 — deeply nested object (object → object → object)
  add(
    'object.deep-nested',
    s.object({
      id: s.number().int(),
      user: s.object({
        name: s.string().min(2),
        address: s.object({ city: s.string().min(1), zip: s.string().length(5) }),
      }),
    }),
    z.object({
      id: z.number().int(),
      user: z.object({
        name: z.string().min(2),
        address: z.object({ city: z.string().min(1), zip: z.string().length(5) }),
      }),
    }),
    v.object({
      id: v.pipe(v.number(), v.integer()),
      user: v.object({
        name: v.pipe(v.string(), v.minLength(2)),
        address: v.object({
          city: v.pipe(v.string(), v.minLength(1)),
          zip: v.pipe(v.string(), v.length(5)),
        }),
      }),
    }),
    type({
      id: 'number.integer',
      user: { name: 'string >= 2', address: { city: 'string >= 1', zip: 'string == 5' } },
    }),
    { id: 1, user: { name: 'Ada', address: { city: 'Paris', zip: '75001' } } },
    { id: 1.5, user: { name: 'A', address: { city: '', zip: '7' } } },
  )

  // Scenario 6 — object with an array-of-objects field (API list payload)
  add(
    'object.array-of-objects',
    s.object({
      page: s.number().int().min(0),
      items: s.array(
        s.object({ id: s.number().int(), title: s.string().min(1), done: s.boolean() }),
      ),
    }),
    z.object({
      page: z.number().int().min(0),
      items: z.array(
        z.object({ id: z.number().int(), title: z.string().min(1), done: z.boolean() }),
      ),
    }),
    v.object({
      page: v.pipe(v.number(), v.integer(), v.minValue(0)),
      items: v.array(
        v.object({
          id: v.pipe(v.number(), v.integer()),
          title: v.pipe(v.string(), v.minLength(1)),
          done: v.boolean(),
        }),
      ),
    }),
    type({
      page: 'number.integer >= 0',
      items: type({ id: 'number.integer', title: 'string >= 1', done: 'boolean' }).array(),
    }),
    {
      page: 1,
      items: Array.from({ length: 20 }, (_, i) => ({ id: i, title: `Item ${i}`, done: i % 2 === 0 })),
    },
  )

  return out
}

// ─── worker mode: run ONE (scenario|path|lib) cell in this process ─────
const cellArg = process.argv.indexOf('--cell')
if (cellArg !== -1) {
  const key = process.argv[cellArg + 1]!
  const [scName, path, lib] = key.split('|') as [string, 'valid' | 'invalid', Lib]
  const sc = scenarios().find((x) => x.name === scName)
  if (!sc) throw new Error(`unknown scenario ${scName}`)
  const input = path === 'valid' ? sc.valid : sc.invalid
  const run = sc.run[lib]
  const samples = measureSamples(() => void run(input))
  process.stdout.write(JSON.stringify({ samples }))
  process.exit(0)
}

// ─── orchestrator ──────────────────────────────────────────────────────
declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; exitCode: number }
}

// Correctness gate: every lib must agree on every scenario's verdicts.
{
  for (const sc of scenarios()) {
    for (const lib of LIBS) {
      if (!sc.ok[lib](sc.valid)) {
        throw new Error(`[correctness] ${sc.name}: ${lib} rejects the VALID input`)
      }
      if (sc.invalid !== undefined && sc.ok[lib](sc.invalid)) {
        throw new Error(`[correctness] ${sc.name}: ${lib} accepts the INVALID input`)
      }
    }
  }
  console.log('✓ correctness gate passed — all four libraries agree on every scenario\n')
}

interface CellResult {
  median: number
  lo: number
  hi: number
}
interface Row {
  scenario: string
  path: 'valid' | 'invalid'
  cells: Record<Lib, CellResult>
}

/** independent processes pooled per cell — the CI must cover process-level jitter */
const PROCS = 3

const rows: Row[] = []
for (const sc of scenarios()) {
  const paths: Array<'valid' | 'invalid'> = sc.invalid !== undefined ? ['valid', 'invalid'] : ['valid']
  for (const path of paths) {
    const cells = {} as Record<Lib, CellResult>
    for (const lib of LIBS) {
      const key = `${sc.name}|${path}|${lib}`
      const pooled: number[] = []
      for (let p = 0; p < PROCS; p++) {
        const proc = Bun.spawnSync(['bun', import.meta.path, '--cell', key], {
          env: { ...process.env, NODE_ENV: 'production' },
        })
        if (proc.exitCode !== 0) throw new Error(`cell worker failed: ${key}`)
        const { samples } = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
        pooled.push(...samples)
      }
      const { lo, hi } = bootstrapCI95(pooled)
      cells[lib] = { median: median(pooled), lo, hi }
    }
    rows.push({ scenario: sc.name, path, cells })
    console.error(`  measured ${sc.name} × ${path}`)
  }
}

// ─── output ───────────────────────────────────────────────────────────
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}µs` : `${n.toFixed(0)}ns`)
const opsPerSec = (ns: number) => Math.round(1e9 / ns).toLocaleString('en-US')

console.log(`\nValidation benchmark — Pyreon s / Zod 4 / Valibot / ArkType`)
console.log(`Node ${process.version}, ${process.platform} ${process.arch}, NODE_ENV=${process.env.NODE_ENV}`)
console.log(`Per-cell isolation, ${PROCS} processes pooled per cell · median ns/op ±95% bootstrap CI · 🤝 = CI overlaps the winner (tied within noise)`)
console.log('AUTHOR-JUDGE CAVEAT: written + judged by the Pyreon authors — see the file header.\n')

const head = ['scenario', 'path', 'pyreon', 'zod', 'valibot', 'arktype', 'verdict']
console.log(head.map((h) => h.padEnd(h === 'scenario' ? 24 : 16)).join(''))
console.log('─'.repeat(120))
const jsonRows: unknown[] = []
for (const r of rows) {
  const meds = Object.fromEntries(LIBS.map((l) => [l, r.cells[l].median])) as Record<Lib, number>
  const min = Math.min(...Object.values(meds))
  const winner = LIBS.find((l) => meds[l] === min)!
  const w = r.cells[winner]
  // tie set: any lib whose CI95 overlaps the winner's CI95
  const tied = LIBS.filter((l) => r.cells[l].lo <= w.hi && r.cells[l].hi >= w.lo)
  const verdict = tied.length > 1 ? `🤝 ${tied.join('=')}` : winner
  const cell = (l: Lib) => {
    const c = r.cells[l]
    const mult = (c.median / min).toFixed(1)
    return `${fmt(c.median)}±${fmt(Math.max(c.hi - c.median, c.median - c.lo))}(${mult}x)`
  }
  console.log(
    r.scenario.padEnd(24) +
      r.path.padEnd(16) +
      cell('pyreon').padEnd(16) +
      cell('zod').padEnd(16) +
      cell('valibot').padEnd(16) +
      cell('arktype').padEnd(16) +
      verdict,
  )
  jsonRows.push({
    scenario: r.scenario,
    path: r.path,
    winner,
    tied: tied.length > 1 ? tied : undefined,
    cells: Object.fromEntries(
      LIBS.map((l) => [
        l,
        { ...r.cells[l], opsPerSec: opsPerSec(r.cells[l].median) },
      ]),
    ),
  })
}
console.log(
  '\n' +
    JSON.stringify(
      {
        meta: {
          node: process.version,
          platform: `${process.platform}/${process.arch}`,
          zod: 4,
          isolation: `per-cell, ${PROCS} processes pooled`,
          ci: 'bootstrap-95 (seeded)',
        },
        rows: jsonRows,
      },
      null,
      0,
    ),
)
