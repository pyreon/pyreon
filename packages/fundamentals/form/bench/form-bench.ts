#!/usr/bin/env bun
/**
 * Headless form-core benchmark — @pyreon/form vs TanStack Form (form-core).
 *
 * These two are the closest architectural peers: both are HEADLESS, store/
 * signal-based form cores measurable in isolation (no React render). That
 * makes a direct wall-clock comparison fair. (react-hook-form / Formik are
 * React-render-coupled — their cost is component RE-RENDERS, measured by the
 * separate `form-rerender-bench.tsx` harness, not here.)
 *
 * Methodology mirrors the repo's bench standards (see validate/bench):
 *  - NODE_ENV=production before any import.
 *  - Equivalent semantics: same field set, same value writes, same validator
 *    shape across both libraries.
 *  - Idiomatic per lib: Pyreon `useForm` + `setFieldValue` / `validate`;
 *    TanStack `new FormApi` + `.mount()` + `.setFieldValue` /
 *    `.validateAllFields`.
 *  - Warmup to steady state, then timed batches; median ns/op + ops/sec +
 *    a relative multiplier vs the fastest.
 *
 * Run: bun bench/form-bench.ts
 */
process.env.NODE_ENV = 'production'

import { FormApi } from '@tanstack/form-core'
import { useForm } from '../src/index'

const now = () => Number(process.hrtime.bigint())

function measure(fn: () => void, { warmup = 3_000, iters = 20_000, runs = 12 } = {}) {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    const t1 = now()
    samples.push((t1 - t0) / iters)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]!
}

interface Row {
  scenario: string
  pyreon: number
  tanstack: number
}
const rows: Row[] = []
const bench = (scenario: string, impls: { pyreon: () => void; tanstack: () => void }) => {
  rows.push({ scenario, pyreon: measure(impls.pyreon), tanstack: measure(impls.tanstack) })
}

// A realistic 12-field form shape (mix of string / number / boolean).
type Vals = {
  first: string; last: string; email: string; phone: string; street: string; city: string
  zip: string; country: string; age: number; score: number; newsletter: boolean; terms: boolean
}
const initial = (): Vals => ({ first: '', last: '', email: '', phone: '', street: '', city: '', zip: '', country: '', age: 0, score: 0, newsletter: false, terms: false })

// ── Scenario 1 — form setup (create a 12-field form) ────────────────────
bench('setup-12-fields', {
  pyreon: () => {
    const f = useForm({ initialValues: initial(), onSubmit: () => {} })
    void f.fields.first
  },
  tanstack: () => {
    const f = new FormApi({ defaultValues: initial() })
    f.mount()
    void f.getFieldValue('first')
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
      void pf.values()
    },
    tanstack: () => {
      void tf.state.values
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
console.log(`\nHeadless form-core benchmark — @pyreon/form vs TanStack Form`)
console.log(`Node ${process.version}, ${process.platform} ${process.arch}, NODE_ENV=production`)
console.log(`Median ns/op (lower = faster). Multiplier = vs fastest in row.\n`)
const head = ['scenario', 'pyreon', 'tanstack', 'winner']
console.log(head.map((h) => h.padEnd(h === 'scenario' ? 26 : 14)).join(''))
console.log('─'.repeat(70))
const jsonRows: unknown[] = []
for (const r of rows) {
  const min = Math.min(r.pyreon, r.tanstack)
  const winner = r.pyreon === min ? 'pyreon' : 'tanstack'
  const cell = (n: number) => `${fmt(n)}(${(n / min).toFixed(1)}x)`
  console.log(r.scenario.padEnd(26) + cell(r.pyreon).padEnd(14) + cell(r.tanstack).padEnd(14) + winner)
  jsonRows.push({ ...r, winner, opsPerSec: { pyreon: opsPerSec(r.pyreon), tanstack: opsPerSec(r.tanstack) } })
}
console.log('\n' + JSON.stringify({ meta: { node: process.version, platform: `${process.platform}/${process.arch}` }, rows: jsonRows }, null, 0))
