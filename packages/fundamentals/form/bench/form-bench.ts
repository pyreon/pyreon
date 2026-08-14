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
 *  - Warmup to steady state, then timed batches; median ns/op + ops/sec +
 *    a relative multiplier vs the fastest.
 *
 * Run: bun run bench   (sets NODE_ENV=production — see above)
 */
process.env.NODE_ENV = 'production'

import { FormApi } from '@tanstack/form-core'
import { useForm } from '../src/index'

const now = () => Number(process.hrtime.bigint())

interface Stats {
  median: number
  ci95: [number, number]
  cv: number // coefficient of variation (stddev/mean) — measurement stability
}

/** 95% bootstrap CI on the median (1000 non-parametric resamples) — same
 *  approach as the DOM `bench:fair` / `runner.ts`. Timing data is right-skewed
 *  by GC outliers, so a non-parametric bootstrap is the honest interval. */
function bootstrapCi95Median(sorted: number[]): [number, number] {
  const n = sorted.length
  const RESAMPLES = 1000
  const medians = new Array<number>(RESAMPLES)
  for (let r = 0; r < RESAMPLES; r++) {
    const draw = new Array<number>(n)
    for (let i = 0; i < n; i++) draw[i] = sorted[(Math.random() * n) | 0]!
    draw.sort((a, b) => a - b)
    medians[r] = draw[(n / 2) | 0]!
  }
  medians.sort((a, b) => a - b)
  return [medians[(RESAMPLES * 0.025) | 0]!, medians[(RESAMPLES * 0.975) | 0]!]
}

function measure(fn: () => void, { warmup = 3_000, iters = 20_000, runs = 20 } = {}): Stats {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    const t1 = now()
    samples.push((t1 - t0) / iters)
  }
  const sorted = [...samples].sort((a, b) => a - b)
  const median = sorted[(sorted.length / 2) | 0]!
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length
  return { median, ci95: bootstrapCi95Median(sorted), cv: Math.sqrt(variance) / mean }
}

interface Row {
  scenario: string
  pyreon: Stats
  tanstack: Stats
}
const rows: Row[] = []
const bench = (scenario: string, impls: { pyreon: () => void; tanstack: () => void }) => {
  rows.push({ scenario, pyreon: measure(impls.pyreon), tanstack: measure(impls.tanstack) })
}

// Sink for benched results. Without consuming the result, `void pf.values()`
// is dead code the JIT can eliminate entirely — which measures elimination,
// not work (the symptom is a sub-timer-resolution median with CV > 100%).
// Printed at exit so it can never be optimised away.
let __sink = 0

// A realistic 12-field form shape (mix of string / number / boolean).
type Vals = {
  first: string; last: string; email: string; phone: string; street: string; city: string
  zip: string; country: string; age: number; score: number; newsletter: boolean; terms: boolean
}
const initial = (): Vals => ({ first: '', last: '', email: '', phone: '', street: '', city: '', zip: '', country: '', age: 0, score: 0, newsletter: false, terms: false })

// ─── CORRECTNESS GATE (runs BEFORE any timing) ──────────────────────────
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
// ── Scenario 1 — form setup (create a 12-field form) ────────────────────
bench('setup-12-fields', {
  pyreon: () => {
    const f = useForm({ initialValues: initial(), onSubmit: () => {} })
    __sink += f.fields.first ? 1 : 0
  },
  tanstack: () => {
    const f = new FormApi({ defaultValues: initial() })
    f.mount()
    __sink += f.getFieldValue('first') === undefined ? 0 : 1
  },
})

// ── Scenario 2 — field update (the keystroke hot path) ──────────────────
{
  const pf = useForm({ initialValues: initial(), onSubmit: () => {} })
  const tf = new FormApi({ defaultValues: initial() })
  tf.mount()
  let n = 0
  bench('update-field (hot path)', {
    pyreon: () => {
      pf.setFieldValue('email', 'a' + (n++ & 1023))
    },
    tanstack: () => {
      tf.setFieldValue('email', 'a' + (n++ & 1023))
    },
  })
}

// ── Scenario 3 — read all values ────────────────────────────────────────
{
  const pf = useForm({ initialValues: initial(), onSubmit: () => {} })
  const tf = new FormApi({ defaultValues: initial() })
  tf.mount()
  bench('read-all-values', {
    pyreon: () => {
      __sink += Object.keys(pf.values()).length
    },
    tanstack: () => {
      __sink += Object.keys(tf.state.values).length
    },
  })
}

// ── Scenario 4 — reset ──────────────────────────────────────────────────
{
  const pf = useForm({ initialValues: initial(), onSubmit: () => {} })
  const tf = new FormApi({ defaultValues: initial() })
  tf.mount()
  let n = 0
  bench('reset', {
    pyreon: () => {
      pf.setFieldValue('email', 'x' + n++)
      pf.reset()
    },
    tanstack: () => {
      tf.setFieldValue('email', 'x' + n++)
      tf.reset()
    },
  })
}

// ── output ──────────────────────────────────────────────────────────────
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}µs` : `${n.toFixed(0)}ns`)
const opsPerSec = (ns: number) => Math.round(1e9 / ns).toLocaleString('en-US')
// Tied-within-noise: the two medians' 95% CIs overlap → the difference is not
// resolvable at this sample size (don't read a winner). Mirrors bench:fair's 🤝.
const ciOverlap = (a: Stats, b: Stats) => a.ci95[0] <= b.ci95[1] && b.ci95[0] <= a.ci95[1]

console.log(`\nTIER A — HEADLESS STORE-PRIMITIVE micro-benchmark — @pyreon/form vs TanStack Form`)
console.log(`⚠  Measures the store WRITE/READ primitive in isolation (no DOM, no subscribers, no`)
console.log(`   render). This is NOT the user-perceived keystroke→validate→commit→paint cost — for`)
console.log(`   the real-app cross-framework comparison see examples/form-bench (Tier B).`)
console.log(`Node ${process.version}, ${process.platform} ${process.arch}, NODE_ENV=production`)
console.log(`Median ns/op ± 95% bootstrap CI (1000 resamples), CV%. Lower = faster.\n`)
const head = ['scenario', 'pyreon', 'tanstack', 'verdict']
console.log(head.map((h) => h.padEnd(h === 'scenario' ? 26 : 22)).join(''))
console.log('─'.repeat(92))
const jsonRows: unknown[] = []
for (const r of rows) {
  const min = Math.min(r.pyreon.median, r.tanstack.median)
  const tied = ciOverlap(r.pyreon, r.tanstack)
  const verdict = tied ? '🤝 tied (CI overlap)' : r.pyreon.median === min ? 'pyreon' : 'tanstack'
  const cell = (s: Stats) =>
    `${fmt(s.median)}(${(s.median / min).toFixed(1)}x,cv${(s.cv * 100).toFixed(0)}%)`
  console.log(r.scenario.padEnd(26) + cell(r.pyreon).padEnd(22) + cell(r.tanstack).padEnd(22) + verdict)
  jsonRows.push({
    scenario: r.scenario,
    verdict,
    tied,
    pyreon: { ...r.pyreon, opsPerSec: opsPerSec(r.pyreon.median) },
    tanstack: { ...r.tanstack, opsPerSec: opsPerSec(r.tanstack.median) },
  })
}
console.log(
  '\n' +
    JSON.stringify(
      { tier: 'A-store-primitive', meta: { node: process.version, platform: `${process.platform}/${process.arch}` }, rows: jsonRows },
      null,
      0,
    ),
)

if (__sink === -1) console.log('sink', __sink) // keep __sink observable
