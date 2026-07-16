/**
 * @pyreon/url-state vs nuqs — objective head-to-head on the pure parse/serialize core.
 *
 * Run: `bun run bench:nuqs` (sets NODE_ENV=production).
 *
 * Objectivity contract (mirrors the fundamentals competitor benches):
 *  - NODE_ENV=production (shell-set) before either library loads.
 *  - Idiomatic per library — Pyreon `inferSerializer(default)` → `{ serialize,
 *    deserialize }` (the pair the hook builds once per param); nuqs's explicit
 *    per-type parsers (`parseAsInteger` / `parseAsFloat` / `parseAsBoolean` /
 *    `parseAsString` / `parseAsArrayOf(parseAsString)`), imported React-FREE
 *    from `nuqs/server`.
 *  - CORRECTNESS GATE asserts both produce the SAME value for every op.
 *  - PER-(OP × IMPL) PROCESS ISOLATION (each cell in a fresh `bun` child, K=3
 *    children pooled) — no cross-impl JIT/GC pollution, and the pooled CI
 *    covers process-level jitter.
 *  - VARIED, ROTATED inputs per iteration (defeats JSC loop-invariant hoisting on
 *    a constant input, which fakes single-digit ns).
 *  - Median of the POOLED samples + bootstrap 95% CI; `🤝` marks a row whose
 *    competitor CI overlaps Pyreon's (tied within noise). A `sink` defeats DCE.
 *
 *  FAIR-FRAMING / DISCLOSURE:
 *   - The COMPARABLE surface is the pure, framework-free parse (URL string →
 *     typed value) and serialize (typed value → URL string) both libraries run.
 *     nuqs is React-first; its parsers are exposed for server-side use via
 *     `nuqs/server` — that is the fair, DOM-free comparison surface.
 *   - PARSER-CLASS MATCHING: Pyreon's number serializer is a FLOAT parser
 *     (`+raw`, full ToNumber — a number default can be fractional). nuqs makes
 *     the user choose `parseAsInteger` (a cheaper integer-prefix `parseInt`
 *     scan) or `parseAsFloat` (`parseFloat`). Both peers are measured:
 *     `parse number` uses parseAsInteger (the USE-CASE peer for `?page=1` —
 *     disclosed as a cheaper op class, not adapter overhead), and
 *     `parse number (float peer)` uses parseAsFloat (the SEMANTICS-matched
 *     peer). Same for round-trip.
 *   - url-state INFERS the serializer from the default value's type (one call at
 *     hook creation); nuqs picks a parser object explicitly. The measured op is
 *     the coercion both perform on the same input.
 *   - url-state's DOM-sync layer (history writes, popstate, cross-hook sync,
 *     `batchUrlUpdates`) has NO nuqs pure-function analogue without a React
 *     render tree + adapter, so it is OUT of scope here (covered by url-state's
 *     happy-dom + real-Chromium e2e tests instead). This bench is CPU-objective
 *     on the coercion core, not a full-stack URL-state race.
 *   - AUTHOR-JUDGE: written + judged by the framework author. The ratio is the
 *     portable signal; ns are machine-dependent.
 */
process.env.NODE_ENV = 'production'

import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
} from 'nuqs/server'
import { inferSerializer } from '../src/serializers'

// ─── Pyreon serializer pairs (inferred from a representative default) ─────────
const pyrNum = inferSerializer(0)
const pyrBool = inferSerializer(false)
const pyrStr = inferSerializer('')
const pyrArr = inferSerializer([] as string[], 'comma')

// ─── nuqs parsers (React-free) ────────────────────────────────────────────────
const nqInt = parseAsInteger
const nqFloat = parseAsFloat
const nqBool = parseAsBoolean
const nqStr = parseAsString
const nqArr = parseAsArrayOf(parseAsString)

// ─── varied input pools (rotated per iteration) ───────────────────────────────
const NUM_STRINGS = ['1', '42', '999', '7', '12345', '0', '88', '3', '1000000', '256']
const NUM_VALUES = [1, 42, 999, 7, 12345, 0, 88, 3, 1000000, 256]
const BOOL_STRINGS = ['true', 'false', 'true', 'false', 'true']
const STR_VALUES = ['hello', 'world', 'search-term', 'pyreon', 'a longer query']
const ARR_STRINGS = ['a,b', 'x,y,z', 'one', 'a,b,c,d,e', 'tag1,tag2,tag3']
const ARR_VALUES: string[][] = [
  ['a', 'b'],
  ['x', 'y', 'z'],
  ['one'],
  ['a', 'b', 'c', 'd', 'e'],
  ['tag1', 'tag2', 'tag3'],
]

const now = () => Number(process.hrtime.bigint())

/** All per-run samples (ns/op) — the child emits these; the parent pools. */
function measureSamples(
  fn: (i: number) => void,
  { warmup = 5_000, iters = 50_000, runs = 15 } = {},
): number[] {
  for (let i = 0; i < warmup; i++) fn(i)
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn(i)
    samples.push((now() - t0) / iters)
  }
  return samples
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1] as number
}

function bootstrapCI(samples: number[], resamples = 2_000): [number, number] {
  const meds: number[] = []
  const n = samples.length
  for (let r = 0; r < resamples; r++) {
    const re: number[] = []
    for (let i = 0; i < n; i++) re.push(samples[(Math.random() * n) | 0] as number)
    meds.push(median(re))
  }
  meds.sort((a, b) => a - b)
  return [meds[(resamples * 0.025) | 0] as number, meds[(resamples * 0.975) | 0] as number]
}

const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1]

let sink = 0
const IMPLS = ['pyreon', 'nuqs'] as const
type ImplName = (typeof IMPLS)[number]
type Impl = Record<ImplName, (i: number) => void>

const OPS: Record<string, { note?: string; make: () => Impl }> = {
  'parse number': {
    note: 'nuqs peer = parseAsInteger (use-case peer; a cheaper int-prefix scan — see header)',
    make: () => ({
      pyreon: (i) => {
        sink += pyrNum.deserialize(NUM_STRINGS[i % NUM_STRINGS.length]!) as number
      },
      nuqs: (i) => {
        sink += (nqInt.parse(NUM_STRINGS[i % NUM_STRINGS.length]!) ?? 0) as number
      },
    }),
  },
  'parse number (float peer)': {
    note: 'nuqs peer = parseAsFloat (the SEMANTICS-matched peer — both parse floats)',
    make: () => ({
      pyreon: (i) => {
        sink += pyrNum.deserialize(NUM_STRINGS[i % NUM_STRINGS.length]!) as number
      },
      nuqs: (i) => {
        sink += (nqFloat.parse(NUM_STRINGS[i % NUM_STRINGS.length]!) ?? 0) as number
      },
    }),
  },
  'serialize number': {
    make: () => ({
      pyreon: (i) => {
        sink += pyrNum.serialize(NUM_VALUES[i % NUM_VALUES.length]! as unknown as number).length
      },
      nuqs: (i) => {
        sink += nqInt.serialize(NUM_VALUES[i % NUM_VALUES.length]!).length
      },
    }),
  },
  'parse boolean': {
    make: () => ({
      pyreon: (i) => {
        sink += pyrBool.deserialize(BOOL_STRINGS[i % BOOL_STRINGS.length]!) ? 1 : 0
      },
      nuqs: (i) => {
        sink += nqBool.parse(BOOL_STRINGS[i % BOOL_STRINGS.length]!) ? 1 : 0
      },
    }),
  },
  'parse string': {
    note: 'both identity-decode the URL value',
    make: () => ({
      pyreon: (i) => {
        sink += (pyrStr.deserialize(STR_VALUES[i % STR_VALUES.length]!) as string).length
      },
      nuqs: (i) => {
        sink += (nqStr.parse(STR_VALUES[i % STR_VALUES.length]!) ?? '').length
      },
    }),
  },
  'parse array (comma)': {
    make: () => ({
      pyreon: (i) => {
        sink += (pyrArr.deserialize(ARR_STRINGS[i % ARR_STRINGS.length]!) as string[]).length
      },
      nuqs: (i) => {
        sink += (nqArr.parse(ARR_STRINGS[i % ARR_STRINGS.length]!) ?? []).length
      },
    }),
  },
  'serialize array (comma)': {
    make: () => ({
      pyreon: (i) => {
        sink += pyrArr.serialize(ARR_VALUES[i % ARR_VALUES.length]! as unknown as string[]).length
      },
      nuqs: (i) => {
        sink += nqArr.serialize(ARR_VALUES[i % ARR_VALUES.length]!).length
      },
    }),
  },
  'round-trip number': {
    note: 'parse the URL string, then serialize back (int peer)',
    make: () => ({
      pyreon: (i) => {
        const raw = NUM_STRINGS[i % NUM_STRINGS.length]!
        sink += pyrNum.serialize(pyrNum.deserialize(raw) as unknown as number).length
      },
      nuqs: (i) => {
        const raw = NUM_STRINGS[i % NUM_STRINGS.length]!
        sink += nqInt.serialize(nqInt.parse(raw) ?? 0).length
      },
    }),
  },
}
const OP_ORDER = Object.keys(OPS)

// ─── child mode: `bun <file> <op> <impl>` → JSON samples array ────────────────
const childOp = process.argv[2]
const childImpl = process.argv[3] as ImplName | undefined
if (childOp) {
  const spec = OPS[childOp]
  if (!spec) throw new Error(`unknown op: ${childOp}`)
  if (!childImpl || !IMPLS.includes(childImpl)) throw new Error(`unknown impl: ${childImpl}`)
  const impl = spec.make()
  process.stdout.write(JSON.stringify(measureSamples(impl[childImpl])))
  process.exit(0)
}

// ─── orchestrator: correctness gate, then spawn per-(op × impl) children ──────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[correctness] ${msg}`)
}
{
  assert(pyrNum.deserialize('42') === 42 && nqInt.parse('42') === 42, 'parse number')
  assert(pyrNum.deserialize('42') === 42 && nqFloat.parse('42') === 42, 'parse number (float peer)')
  assert(pyrNum.deserialize('3.5') === 3.5 && nqFloat.parse('3.5') === 3.5, 'float parse agrees on fractions')
  assert(pyrNum.serialize(42 as unknown as number) === '42' && nqInt.serialize(42) === '42', 'serialize number')
  assert(pyrBool.deserialize('true') === true && nqBool.parse('true') === true, 'parse boolean true')
  assert(pyrBool.deserialize('false') === false && nqBool.parse('false') === false, 'parse boolean false')
  assert(pyrStr.deserialize('hi') === 'hi' && nqStr.parse('hi') === 'hi', 'parse string')
  const pArr = pyrArr.deserialize('a,b,c') as string[]
  const nArr = nqArr.parse('a,b,c') ?? []
  assert(JSON.stringify(pArr) === JSON.stringify(['a', 'b', 'c']), 'pyreon parse array')
  assert(JSON.stringify(nArr) === JSON.stringify(['a', 'b', 'c']), 'nuqs parse array')
  assert(
    pyrArr.serialize(['a', 'b'] as unknown as string[]) === 'a,b' && nqArr.serialize(['a', 'b']) === 'a,b',
    'serialize array',
  )
  console.log('✓ correctness gate passed — both libraries produce identical parse/serialize results\n')
}

declare const Bun: {
  spawnSync: (cmd: string[], opts: { env: Record<string, string | undefined> }) => {
    stdout: Uint8Array
    exitCode: number
  }
}

const PROCS_PER_CELL = 3

function runCell(op: string, impl: ImplName): { med: number; ci: [number, number] } {
  const pooled: number[] = []
  for (let k = 0; k < PROCS_PER_CELL; k++) {
    const proc = Bun.spawnSync(['bun', import.meta.path, op, impl], {
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (proc.exitCode !== 0) throw new Error(`child failed for cell "${op}" × ${impl}`)
    pooled.push(...(JSON.parse(new TextDecoder().decode(proc.stdout)) as number[]))
  }
  return { med: median(pooled), ci: bootstrapCI(pooled) }
}

interface Row {
  op: string
  pyreon: { med: number; ci: [number, number] }
  nuqs: { med: number; ci: [number, number] }
  note?: string
}
const rows: Row[] = []
for (const op of OP_ORDER) {
  rows.push({ op, pyreon: runCell(op, 'pyreon'), nuqs: runCell(op, 'nuqs'), note: OPS[op]?.note })
}

console.log(
  `=== @pyreon/url-state vs nuqs (${process.platform}/${process.arch}, NODE_ENV=production, per-(op×impl) isolated processes ×${PROCS_PER_CELL} pooled, median ns/op [CI95], 🤝 = CI-overlap tie) ===\n`,
)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(`${pad('op', 27)} ${padL('pyreon', 9)} ${padL('nuqs', 9)} ${padL('verdict', 18)}   note`)
console.log('─'.repeat(118))
for (const r of rows) {
  const ratio = r.nuqs.med / r.pyreon.med
  const tied = overlaps(r.pyreon.ci, r.nuqs.ci)
  const verdict = tied
    ? `🤝 ${ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x SLOWER`}`
    : ratio >= 1
      ? `${ratio.toFixed(1)}x faster`
      : `${(1 / ratio).toFixed(1)}x SLOWER`
  console.log(
    `${pad(r.op, 27)} ${padL(r.pyreon.med.toFixed(1), 9)} ${padL(r.nuqs.med.toFixed(1), 9)} ${padL(verdict, 18)}   ${r.note ?? ''}`,
  )
}
console.log(
  `\n(ratio = nuqs ÷ Pyreon; >1 ⇒ Pyreon faster; 🤝 = CI95 overlap (treat as tied). Pooled median of 15×50k runs × ${PROCS_PER_CELL} fresh processes per (op × impl), rotated inputs. ns machine-dependent — the ratio is the portable signal. Pure parse/serialize core only; url-state's DOM-sync layer has no React-free nuqs analogue — see header.)`,
)
