#!/usr/bin/env bun
/**
 * TIER A — Headless store-PRIMITIVE benchmark — @pyreon/form vs TanStack Form.
 *
 * ⚠ SCOPE: this measures the store WRITE/READ primitive in isolation (no DOM,
 * no field subscribers mounted, no render). It is the closest *architectural*
 * peer comparison (both are headless store/signal cores), but it is NOT the
 * user-perceived cost of typing into a form (keystroke→validate→commit→paint).
 * For the truly objective, real-browser, cross-framework comparison vs React
 * Hook Form / Formik / vee-validate / Felte / modular-forms, see the Tier-B
 * suite in `examples/form-bench/` (real apps, Playwright, per-framework
 * idiomatic models). Treat the multipliers here as primitive characterization,
 * never as "fastest form library."
 *
 * (react-hook-form / Formik are React-render-coupled — their architectural
 * cost is component RE-RENDERS, measured by the `form-rerender-bench.ts`
 * harness; the real wall-clock comparison is Tier B.)
 *
 * Methodology mirrors the repo's bench standards (see validate/bench):
 *  - NODE_ENV=production before any import. NOTE: the `process.env.NODE_ENV`
 *    assignment below CANNOT achieve that on its own — ES imports hoist, so
 *    `@tanstack/form-core` and `../src/index` are both evaluated before it
 *    runs. The load-bearing part is the SHELL: run this via `bun run bench`
 *    (which sets NODE_ENV=production in the environment), not `bun
 *    bench/form-bench.ts` directly, or BOTH libraries are measured with their
 *    dev-mode instrumentation live.
 *  - Equivalent semantics: same field set, same value writes, same validator
 *    shape across both libraries.
 *  - Idiomatic per lib: Pyreon `useForm` + `setFieldValue` / `validate`;
 *    TanStack `new FormApi` + `.mount()` + `.setFieldValue` /
 *    `.validateAllFields`.
 *  - PER-(SCENARIO × LIBRARY) PROCESS ISOLATION — each cell runs in a fresh
 *    child in which ONLY that library's path is warmed + timed. (It used to
 *    time Pyreon then TanStack back to back in ONE process — an order bias,
 *    and a shared-JIT/heap contamination between the two libraries.)
 *  - Impl order rotated per round; samples pooled over ${BENCH_ROUNDS:-4}
 *    rounds → median ns/op + seeded bootstrap CI95 + ops/sec; CI overlap =
 *    🤝 tie. A `sink` (written out by every child) defeats DCE. `--quick` =
 *    a correctness/structure smoke with meaningless timings.
 *
 * Run: bun run bench   (sets NODE_ENV=production — see above)
 */
process.env.NODE_ENV = 'production'

import { cpus, loadavg } from 'node:os'
import { FormApi } from '@tanstack/form-core'
import { useForm } from '../src/index'

// ─── isolated-cell harness ───────────────────────────────────────────────────
// ONE fresh child process per (op × library) — only that library's path is
// warmed/timed in it, so neither library measures after the other's JIT/heap
// debt. The impl order is ROTATED per round (and per op), so neither library
// is systematically first while the machine drifts; samples from every round
// are POOLED → median + SEEDED bootstrap CI95 (reproducible for identical
// samples). Overlapping CIs = 🤝 statistical tie — no winner is read. Same
// shape as the store / rx / http benches. `--quick` (or BENCH_QUICK=1) is a
// structural/correctness smoke only — its timings are meaningless.
declare const Bun: {
  version: string
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; stderr: Uint8Array; exitCode: number }
}
const QUICK = process.argv.includes('--quick') || process.env.BENCH_QUICK === '1'
const ROUNDS = QUICK ? 1 : Number(process.env.BENCH_ROUNDS ?? 4)
const now = () => Number(process.hrtime.bigint())

function measureSamples(
  fn: () => void,
  opts: { warmup?: number; iters?: number; runs?: number } = {},
): number[] {
  const warmup = QUICK ? 100 : (opts.warmup ?? 2_000)
  const iters = QUICK ? 500 : (opts.iters ?? 20_000)
  const runs = QUICK ? 3 : (opts.runs ?? 11)
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    samples.push((now() - t0) / iters)
  }
  return samples
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** mulberry32 PRNG — seeded so the CI is reproducible for identical samples. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a — a stable per-cell seed from the cell's label. */
function seedOf(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  return h >>> 0
}

function bootstrapCI(samples: readonly number[], key: string, B = 2_000): [number, number] {
  const rand = seededRandom(seedOf(key))
  const n = samples.length
  const meds = new Array<number>(B)
  const re = new Array<number>(n)
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) re[i] = samples[(rand() * n) | 0]!
    meds[b] = median(re)
  }
  meds.sort((a, b) => a - b)
  return [meds[(B * 0.025) | 0]!, meds[(B * 0.975) | 0]!]
}

interface Cell {
  median: number
  ci: [number, number]
  n: number
}
const ciOverlap = (a: Cell, b: Cell): boolean => a.ci[0] <= b.ci[1] && b.ci[0] <= a.ci[1]

function runtimeBanner(): string {
  const engine =
    typeof Bun !== 'undefined'
      ? `bun ${Bun.version} (JavaScriptCore)`
      : `node ${process.version} (V8)`
  const load = loadavg()
    .map((l) => l.toFixed(2))
    .join(' ')
  return `${engine} · ${process.platform}/${process.arch} · ${cpus()[0]?.model ?? 'unknown cpu'} · loadavg ${load} · NODE_ENV=${process.env.NODE_ENV}`
}

/** Child argv: `<op> <impl>` (flags such as `--quick` are ignored here). */
const childArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'))

function runIsolatedCells<I extends string>(
  ops: readonly string[],
  impls: readonly I[],
): Record<string, Record<I, Cell>> {
  const pooled: Record<string, Record<string, number[]>> = {}
  for (const op of ops) {
    pooled[op] = {}
    for (const impl of impls) pooled[op]![impl] = []
  }
  for (let round = 0; round < ROUNDS; round++) {
    ops.forEach((op, opIndex) => {
      const k = (round + opIndex) % impls.length
      const order = [...impls.slice(k), ...impls.slice(0, k)]
      for (const impl of order) {
        const proc = Bun.spawnSync(
          [process.execPath, import.meta.path, op, impl, ...(QUICK ? ['--quick'] : [])],
          { env: { ...process.env, NODE_ENV: 'production' } },
        )
        if (proc.exitCode !== 0) {
          throw new Error(
            `child failed for (op "${op}", impl "${impl}"):\n${new TextDecoder().decode(proc.stderr)}`,
          )
        }
        const out = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
        pooled[op]![impl]!.push(...out.samples)
      }
    })
  }
  const result: Record<string, Record<I, Cell>> = {}
  for (const op of ops) {
    const row = {} as Record<I, Cell>
    for (const impl of impls) {
      const s = pooled[op]![impl]!
      row[impl] = { median: median(s), ci: bootstrapCI(s, `${op}::${impl}`), n: s.length }
    }
    result[op] = row
  }
  return result
}

/** Two-library table: Pyreon vs one competitor, CI + tie verdict per row. */
function printPairTable<I extends string>(opts: {
  title: string
  ops: readonly string[]
  cells: Record<string, Record<I, Cell>>
  pyreon: I
  competitor: I
  competitorLabel: string
  notes: Record<string, string | undefined>
  opWidth: number
}): void {
  const { ops, cells, pyreon, competitor, competitorLabel, notes, opWidth } = opts
  console.log(`=== ${opts.title} ===`)
  console.log(runtimeBanner())
  console.log(
    `one fresh process per (op × library) · ${ROUNDS} round(s), impl order rotated · pooled median ns/op [seeded bootstrap CI95] · 🤝 = CI overlap (tie)${QUICK ? ' · --quick: TIMINGS MEANINGLESS' : ''}\n`,
  )
  const fmtCell = (c: Cell) => `${c.median.toFixed(0)} [${c.ci[0].toFixed(0)}–${c.ci[1].toFixed(0)}]`
  console.log(
    `${'op'.padEnd(opWidth)} ${'pyreon'.padStart(20)} ${competitorLabel.padStart(20)}  verdict   note`,
  )
  console.log('─'.repeat(opWidth + 80))
  for (const op of ops) {
    const p = cells[op]![pyreon]
    const c = cells[op]![competitor]
    const ratio = c.median / p.median
    const verdict = ciOverlap(p, c)
      ? '🤝 tie'
      : ratio >= 1
        ? `pyreon ${ratio.toFixed(1)}x faster`
        : `pyreon ${(1 / ratio).toFixed(1)}x SLOWER`
    console.log(
      `${op.padEnd(opWidth)} ${fmtCell(p).padStart(20)} ${fmtCell(c).padStart(20)}  ${verdict}   ${notes[op] ?? ''}`,
    )
  }
}

// Sink for benched results. Without consuming the result, `void pf.values()`
// is dead code the JIT can eliminate entirely — which measures elimination,
// not work (the symptom is a sub-timer-resolution median with CV > 100%).
// Every child writes it out, so it can never be optimised away.
let sink = 0

// A realistic 12-field form shape (mix of string / number / boolean).
type Vals = {
  first: string; last: string; email: string; phone: string; street: string; city: string
  zip: string; country: string; age: number; score: number; newsletter: boolean; terms: boolean
}
const initial = (): Vals => ({ first: '', last: '', email: '', phone: '', street: '', city: '', zip: '', country: '', age: 0, score: 0, newsletter: false, terms: false })

const IMPLS = ['pyreon', 'tanstack'] as const
type ImplName = (typeof IMPLS)[number]
type Impl = Record<ImplName, () => void>

const OPS: Record<string, { note?: string; make: () => Impl }> = {
  // ── Scenario 1 — form setup (create a 12-field form) ───────────────────
  'setup-12-fields': {
    make: () => ({
      pyreon: () => {
        const f = useForm({ initialValues: initial(), onSubmit: () => {} })
        sink += f.fields.first ? 1 : 0
      },
      tanstack: () => {
        const f = new FormApi({ defaultValues: initial() })
        f.mount()
        sink += f.getFieldValue('first') === undefined ? 0 : 1
      },
    }),
  },
  // ── Scenario 2 — field update (the keystroke hot path) ─────────────────
  'update-field (hot path)': {
    make: () => {
      const pf = useForm({ initialValues: initial(), onSubmit: () => {} })
      const tf = new FormApi({ defaultValues: initial() })
      tf.mount()
      let n = 0
      return {
        pyreon: () => {
          pf.setFieldValue('email', 'a' + (n++ & 1023))
        },
        tanstack: () => {
          tf.setFieldValue('email', 'a' + (n++ & 1023))
        },
      }
    },
  },
  // ── Scenario 3 — read all values ────────────────────────────────────────
  'read-all-values': {
    make: () => {
      const pf = useForm({ initialValues: initial(), onSubmit: () => {} })
      const tf = new FormApi({ defaultValues: initial() })
      tf.mount()
      return {
        pyreon: () => {
          sink += Object.keys(pf.values()).length
        },
        tanstack: () => {
          sink += Object.keys(tf.state.values).length
        },
      }
    },
  },
  // ── Scenario 4 — reset ──────────────────────────────────────────────────
  reset: {
    make: () => {
      const pf = useForm({ initialValues: initial(), onSubmit: () => {} })
      const tf = new FormApi({ defaultValues: initial() })
      tf.mount()
      let n = 0
      return {
        pyreon: () => {
          pf.setFieldValue('email', 'x' + n++)
          pf.reset()
        },
        tanstack: () => {
          tf.setFieldValue('email', 'x' + n++)
          tf.reset()
        },
      }
    },
  },
}
const OP_ORDER = Object.keys(OPS)

// ─── child mode: measure ONE (scenario, impl) cell, print JSON ──────────────
const [childOp, childImpl] = childArgs
if (childOp) {
  const spec = OPS[childOp]
  if (!spec) throw new Error(`unknown op: ${childOp}`)
  if (!childImpl || !(IMPLS as readonly string[]).includes(childImpl)) {
    throw new Error(`unknown impl: ${String(childImpl)}`)
  }
  // `make()` builds both arms' fixtures, but ONLY `childImpl` is warmed + timed.
  const fn = spec.make()[childImpl as ImplName]
  const samples = measureSamples(fn, { warmup: 3_000, iters: 20_000, runs: 20 })
  process.stdout.write(JSON.stringify({ samples, sink }))
  process.exit(0)
}
// ─── CORRECTNESS GATE (orchestrator only, BEFORE any timing — children skip
// it so neither library is pre-warmed in a measured process) ──────────────────────────
// Without this, a "win" can be one side doing LESS work. Two shapes are
// specifically at risk here: Pyreon's `values()` is epoch-CACHED while
// TanStack reads `state.values` directly (a stale cache would read as a free
// win), and `setFieldValue` must be observable IMMEDIATELY on both sides —
// if one deferred the write, the hot-path comparison would be meaningless.
{
  const pf = useForm({ initialValues: initial(), onSubmit: () => {} })
  const tf = new FormApi({ defaultValues: initial() })
  tf.mount()
  const fail = (m: string): never => {
    throw new Error(`[form-bench] CORRECTNESS GATE FAILED — ${m}`)
  }

  // 1. Both expose all 12 fields with equal initial values.
  const pv0 = pf.values() as Record<string, unknown>
  const tv0 = tf.state.values as Record<string, unknown>
  const keys = Object.keys(initial())
  if (Object.keys(pv0).length !== keys.length) fail(`pyreon values() has ${Object.keys(pv0).length} keys, expected ${keys.length}`)
  for (const k of keys) {
    if (pv0[k] !== tv0[k]) fail(`initial mismatch on "${k}": pyreon=${String(pv0[k])} tanstack=${String(tv0[k])}`)
  }

  // 2. setFieldValue is observable IMMEDIATELY on both sides (no deferral).
  pf.setFieldValue('email', 'gate@x.dev')
  tf.setFieldValue('email', 'gate@x.dev')
  if ((pf.values() as Record<string, unknown>).email !== 'gate@x.dev') fail('pyreon setFieldValue not observable in values()')
  if ((tf.state.values as Record<string, unknown>).email !== 'gate@x.dev') fail('tanstack setFieldValue not observable in state.values')

  // 3. The epoch cache must INVALIDATE — a second write has to be visible too.
  pf.setFieldValue('email', 'second@x.dev')
  if ((pf.values() as Record<string, unknown>).email !== 'second@x.dev') fail('pyreon values() returned a STALE cached object after a second write')

  // 4. reset restores the initial value on both.
  pf.reset()
  tf.reset()
  if ((pf.values() as Record<string, unknown>).email !== '') fail('pyreon reset did not restore initial')
  if ((tf.state.values as Record<string, unknown>).email !== '') fail('tanstack reset did not restore initial')
}
console.log('✓ correctness gate passed — both stores agree on initial values, immediate writes, cache invalidation, reset')
if (process.env.BENCH_GATE_ONLY) process.exit(0)

// ── output ──────────────────────────────────────────────────────────────
const cells = runIsolatedCells(OP_ORDER, IMPLS)
console.log(`\nTIER A — HEADLESS STORE-PRIMITIVE micro-benchmark — @pyreon/form vs TanStack Form`)
console.log(`⚠  Measures the store WRITE/READ primitive in isolation (no DOM, no subscribers, no`)
console.log(`   render). This is NOT the user-perceived keystroke→validate→commit→paint cost — for`)
console.log(`   the real-app cross-framework comparison see examples/form-bench (Tier B).\n`)
printPairTable({
  title: '@pyreon/form vs TanStack Form (headless store primitive)',
  ops: OP_ORDER,
  cells,
  pyreon: 'pyreon',
  competitor: 'tanstack',
  competitorLabel: 'tanstack',
  notes: {},
  opWidth: 26,
})
const opsPerSec = (ns: number) => Math.round(1e9 / ns).toLocaleString('en-US')
const jsonRows = OP_ORDER.map((op) => {
  const p = cells[op]!.pyreon
  const t = cells[op]!.tanstack
  const tied = ciOverlap(p, t)
  return {
    scenario: op,
    verdict: tied ? 'tie' : p.median < t.median ? 'pyreon' : 'tanstack',
    tied,
    pyreon: { ...p, opsPerSec: opsPerSec(p.median) },
    tanstack: { ...t, opsPerSec: opsPerSec(t.median) },
  }
})
console.log(
  '\n' +
    JSON.stringify(
      { tier: 'A-store-primitive', meta: { runtime: runtimeBanner(), rounds: ROUNDS, quick: QUICK }, rows: jsonRows },
      null,
      0,
    ),
)
