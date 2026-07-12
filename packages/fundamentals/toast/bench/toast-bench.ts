#!/usr/bin/env bun
/**
 * Headless toast-store benchmark — @pyreon/toast vs react-hot-toast.
 *
 * Both ship a module-level imperative store with a HARD, instant removal path
 * (`toast.remove` on both — @pyreon/toast and react-hot-toast share the exact
 * `dismiss` (soft, animated) / `remove` (hard, instant) split), so the raw
 * store-op dispatch cost is directly comparable with the store kept at steady
 * size across the timed loop. The SOFT animated `dismiss` (which schedules a
 * leave transition) is measured against react-hot-toast — where the DOM commit
 * is what matters — in `toast-commit-bench.ts`'s dismiss→commit row.
 *
 * sonner is DELIBERATELY EXCLUDED here: its `dismiss` is animation-coupled —
 * a dismissed toast is only removed from the store once a MOUNTED `<Toaster>`
 * finishes the exit animation (its `dismiss` fires a `requestAnimationFrame`),
 * so headless (no Toaster) dismissed toasts linger forever and the loop degrades
 * to O(N²). That isn't sonner's real per-op cost, so reporting it here would be a
 * benchmark artifact. sonner IS measured fairly on the ONE headless-comparable op
 * (create throughput, fresh process per sample) in `toast-commit-bench.ts`; that
 * file's mounted-commit rows are @pyreon/toast vs react-hot-toast only (sonner's
 * layout-measurement Toaster does not render under happy-dom).
 *
 * Methodology mirrors the repo bench standard (form-bench.ts):
 *  - NODE_ENV=production BEFORE any import (dev paths are noise).
 *  - happy-dom registered so react-hot-toast imports (touches document at
 *    module-eval); the measured store ops never touch the DOM.
 *  - duration: 0 / Infinity so auto-dismiss timers don't fire mid-measurement.
 *  - Warmup to steady state, median ns/op over runs, multiplier vs fastest.
 *
 * Run: bun bench/toast-bench.ts   (from packages/fundamentals/toast)
 */
process.env.NODE_ENV = 'production'

import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()

const { toast: pyreon, _reset: pyreonReset } = await import('../src/toast')
const rht = (await import('react-hot-toast')).default

const now = () => Number(process.hrtime.bigint())
function measure(fn: () => void, { warmup = 1_000, iters = 3_000, runs = 9 } = {}) {
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
  rht: number
}
const rows: Row[] = []
const bench = (scenario: string, impls: { pyreon: () => void; rht: () => void }) => {
  rows.push({ scenario, pyreon: measure(impls.pyreon), rht: measure(impls.rht) })
}

// ── Scenario 1 — create + dismiss cycle (steady state, store stays ~empty) ──
// This bench measures raw STORE DISPATCH, so removal uses the HARD path
// (`remove`) on both — the instant, animation-free op both libraries expose. The
// SOFT animated `dismiss` (which schedules a leave) is fairly measured against
// react-hot-toast in `toast-commit-bench.ts`'s dismiss→commit row.
let n = 0
bench('create+remove', {
  pyreon: () => {
    const id = pyreon('m' + (n++ & 1023), { duration: 0 })
    pyreon.remove(id) // HARD, instant
  },
  rht: () => {
    const id = rht('m' + (n++ & 1023), { duration: Infinity })
    rht.remove(id) // HARD, instant
  },
})

// ── Scenario 2 — update one persistent toast (the loading→done hot path) ────
{
  const pid = pyreon.loading('start')
  const rid = rht('start', { duration: Infinity })
  let u = 0
  bench('update-by-id', {
    pyreon: () => {
      pyreon.update(pid, { message: 'm' + (u++ & 1023) })
    },
    rht: () => {
      rht('m' + (u++ & 1023), { id: rid as string, duration: Infinity })
    },
  })
  pyreon.dismiss(pid)
  rht.remove(rid)
}

// ── Scenario 3 — create 10 + clear-all (burst) ──────────────────────────────
bench('create10+clear', {
  pyreon: () => {
    for (let i = 0; i < 10; i++) pyreon('m' + i, { duration: 0 })
    pyreon.remove() // HARD clear-all
  },
  rht: () => {
    const ids: string[] = []
    for (let i = 0; i < 10; i++) ids.push(rht('m' + i, { duration: Infinity }))
    for (const id of ids) rht.remove(id)
  },
})

pyreonReset()

// ── output ──────────────────────────────────────────────────────────────
const fmt = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(2)}µs` : `${x.toFixed(0)}ns`)
const opsPerSec = (ns: number) => Math.round(1e9 / ns).toLocaleString('en-US')
console.log(`\nHeadless toast-store benchmark — @pyreon/toast vs react-hot-toast`)
console.log(`Node ${process.version}, ${process.platform} ${process.arch}, NODE_ENV=production`)
console.log(`Median ns/op (lower = faster). Multiplier = vs fastest in row.`)
console.log(`(sonner excluded — its dismiss is Toaster-coupled, not fairly headless; see toast-commit-bench.ts)\n`)
const head = ['scenario', 'pyreon', 'react-hot-toast', 'winner']
console.log(head.map((h) => h.padEnd(18)).join(''))
console.log('─'.repeat(72))
const jsonRows: unknown[] = []
for (const r of rows) {
  const min = Math.min(r.pyreon, r.rht)
  const winner = r.pyreon === min ? 'pyreon' : 'react-hot-toast'
  const cell = (x: number) => `${fmt(x)}(${(x / min).toFixed(1)}x)`
  console.log(r.scenario.padEnd(18) + cell(r.pyreon).padEnd(18) + cell(r.rht).padEnd(18) + winner)
  jsonRows.push({ ...r, winner, opsPerSec: { pyreon: opsPerSec(r.pyreon), rht: opsPerSec(r.rht) } })
}
console.log(
  '\n' +
    JSON.stringify(
      { meta: { node: process.version, platform: `${process.platform}/${process.arch}` }, rows: jsonRows },
      null,
      0,
    ),
)
