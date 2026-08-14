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
 * Methodology mirrors the repo bench standard (http-bench.ts / url-state-bench.ts):
 *  - NODE_ENV=production BEFORE any import (dev paths are noise) — set by the
 *    npm script's SHELL as well, since imports hoist above the in-file assignment.
 *  - happy-dom registered so react-hot-toast imports (touches document at
 *    module-eval); the measured store ops never touch the DOM.
 *  - duration: 0 / Infinity so auto-dismiss timers don't fire mid-measurement
 *    (`@pyreon/toast` arms no timer for `duration <= 0`; rht none for Infinity).
 *  - PER-(SCENARIO × LIBRARY) PROCESS ISOLATION — each cell runs in a fresh `bun`
 *    child that loads ONLY the library it measures. This is load-bearing: run in
 *    one process, Pyreon went first and react-hot-toast started each scenario
 *    after ~28k iterations of foreign allocation + JIT tiering (and after
 *    react-hot-toast's own module-eval had already touched the document). The
 *    same shape is documented inflating a competitor ~10× in state-tree-bench.ts.
 *  - TWO-SIDED CORRECTNESS GATE — every store-size assertion is made against
 *    BOTH libraries. Pyreon's `_toasts` signal is read directly; react-hot-toast
 *    has no headless store accessor, so its size is read through its own
 *    `useToasterStore` hook rendered once via `react-dom/server` (a synchronous
 *    read of `memoryState`; the gate never runs it inside a timed loop). Without
 *    the rht half, a scenario where react-hot-toast silently did LESS work —
 *    an update that no-ops, a clear-all that clears nothing — would post the
 *    faster number and look like a win.
 *  - `BENCH_GATE_ONLY=1` runs the gate and exits 0 without timing — use it to
 *    check correctness on a loaded machine, where timings are worthless.
 *  - Warmup to steady state, median ns/op over runs, multiplier vs fastest.
 *
 * DISCLOSED ASYMMETRY: both stores cap their length (Pyreon `MAX_TOASTS = 50`,
 * react-hot-toast `TOAST_LIMIT = 20`). No scenario here exceeds 10 live toasts,
 * so neither cap is exercised — the gate asserts the exact expected size on both
 * sides, which is what keeps that true.
 *
 * Run: bun bench/toast-bench.ts   (or `bun run bench`)
 */
process.env.NODE_ENV = 'production'

import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()

declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; stderr: Uint8Array; exitCode: number }
}

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

const IMPLS = ['pyreon', 'rht'] as const
type ImplName = (typeof IMPLS)[number]

const loadPyreon = () => import('../src/toast')
const loadRht = async () => (await import('react-hot-toast')).default

/**
 * One scenario = one op, built for ONE library. Building per-impl (rather than
 * returning a {pyreon, rht} pair) keeps the child from even importing the
 * library it is not measuring — react-hot-toast touches `document` at
 * module-eval, which would otherwise be paid inside the pyreon cell too.
 */
interface Scenario {
  note: string
  build: (impl: ImplName) => Promise<() => void>
}

const SCENARIOS: Record<string, Scenario> = {
  // ── 1 — create + hard-remove cycle (steady state, store returns to empty) ──
  // Removal uses the HARD path (`remove`) on BOTH sides — the instant,
  // animation-free op both libraries expose. The SOFT animated `dismiss` is
  // measured against react-hot-toast in `toast-commit-bench.ts`.
  'create+remove': {
    note: 'create then HARD-remove by id — both sides `remove`, never `dismiss`',
    build: async (impl) => {
      let n = 0
      if (impl === 'pyreon') {
        const { toast } = await loadPyreon()
        return () => {
          const id = toast('m' + (n++ & 1023), { duration: 0 })
          toast.remove(id)
        }
      }
      const rht = await loadRht()
      return () => {
        const id = rht('m' + (n++ & 1023), { duration: Infinity })
        rht.remove(id)
      }
    },
  },

  // ── 2 — update one persistent toast (the loading→done hot path) ────────────
  'update-by-id': {
    note: 'update an EXISTING toast in place — must not grow either store (gated)',
    build: async (impl) => {
      let u = 0
      if (impl === 'pyreon') {
        const { toast } = await loadPyreon()
        const pid = toast.loading('start')
        return () => {
          toast.update(pid, { message: 'm' + (u++ & 1023) })
        }
      }
      const rht = await loadRht()
      const rid = rht('start', { duration: Infinity })
      return () => {
        rht('m' + (u++ & 1023), { id: rid as string, duration: Infinity })
      }
    },
  },

  // ── 3 — create 10 + clear-all (burst) ──────────────────────────────────────
  'create10+clear': {
    note: 'burst of 10 creates then ONE clear-all call per library (not a remove loop)',
    build: async (impl) => {
      if (impl === 'pyreon') {
        const { toast } = await loadPyreon()
        return () => {
          for (let i = 0; i < 10; i++) toast('m' + i, { duration: 0 })
          toast.remove() // HARD clear-all
        }
      }
      const rht = await loadRht()
      return () => {
        for (let i = 0; i < 10; i++) rht('m' + i, { duration: Infinity })
        rht.remove() // HARD clear-all — the SAME single call Pyreon makes
      }
    },
  },
}
const SCENARIO_ORDER = Object.keys(SCENARIOS)

// ─── child mode: `bun <file> <scenario> <impl>` → {"ns": …} ──────────────────
const childScenario = process.argv[2]
const childImpl = process.argv[3] as ImplName | undefined
if (childScenario) {
  const spec = SCENARIOS[childScenario]
  if (!spec) throw new Error(`unknown scenario: ${childScenario}`)
  if (!childImpl || !IMPLS.includes(childImpl)) throw new Error(`unknown impl: ${childImpl}`)
  const fn = await spec.build(childImpl)
  process.stdout.write(JSON.stringify({ ns: measure(fn) }))
  process.exit(0)
}

// ─── CORRECTNESS GATE (runs BEFORE any timing) ───────────────────────────────
// Without this a "win" can be one side doing LESS work. Three asymmetries are
// specifically at risk in this file, and each is now asserted on BOTH sides:
//  1. `update-by-id` must UPDATE the existing toast rather than push a new one
//     (react-hot-toast expresses that as `rht(msg, { id })`, which reads like a
//     create — if the id were wrong it would silently create every iteration).
//  2. the clear-all scenario must use each library's OWN clear-all — looping N
//     removes against a single call measures the API shape, not the store.
//  3. `remove` must actually empty the store — a soft `dismiss` leaves the entry
//     behind, which would quietly turn a steady-state loop into a growing one.
{
  const { toast: pyreon, _reset: pyreonReset, _toasts: pyreonToasts } = await loadPyreon()
  const rht = await loadRht()

  // react-hot-toast has no headless store accessor. `useToasterStore` reads
  // `memoryState` synchronously on first render, so one server render is an
  // honest size probe. GATE-ONLY — never called inside a measured loop.
  const React = (await import('react')).default
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { useToasterStore } = await import('react-hot-toast')
  let probed = -1
  const RhtProbe = () => {
    probed = useToasterStore().toasts.length
    return null
  }
  const rhtSize = (): number => {
    probed = -1
    renderToStaticMarkup(React.createElement(RhtProbe))
    return probed
  }
  const pyreonSize = (): number => pyreonToasts().length

  const fail = (m: string): never => {
    throw new Error(`[toast-bench] CORRECTNESS GATE FAILED — ${m}`)
  }
  const bothSizes = (want: number, step: string): void => {
    const p = pyreonSize()
    const r = rhtSize()
    if (p !== want) fail(`${step}: pyreon store is ${p}, expected ${want}`)
    if (r !== want) fail(`${step}: react-hot-toast store is ${r}, expected ${want}`)
  }

  pyreonReset()
  rht.remove()
  bothSizes(0, 'gate start')

  // 1. create+remove returns BOTH stores to empty.
  const pid1 = pyreon('gate', { duration: 0 })
  const rid1 = rht('gate', { duration: Infinity })
  bothSizes(1, 'create')
  pyreon.remove(pid1)
  rht.remove(rid1)
  bothSizes(0, 'remove(id)')

  // 2. update-by-id UPDATES in place — BOTH stores must stay at 1, not grow.
  //    (This is the exact call shape scenario 2 measures.)
  const pid2 = pyreon.loading('start')
  const rid2 = rht('start', { duration: Infinity })
  bothSizes(1, 'update setup')
  pyreon.update(pid2, { message: 'changed' })
  rht('changed', { id: rid2 as string, duration: Infinity })
  bothSizes(1, 'update(id) — it created instead of updating')
  pyreon.remove(pid2)
  rht.remove(rid2)
  bothSizes(0, 'update teardown')

  // 3. clear-all empties BOTH stores in ONE call.
  for (let i = 0; i < 10; i++) pyreon('m' + i, { duration: 0 })
  for (let i = 0; i < 10; i++) rht('m' + i, { duration: Infinity })
  bothSizes(10, 'burst of 10 before clear')
  pyreon.remove()
  rht.remove()
  bothSizes(0, 'clear-all')

  pyreonReset()
  console.log('✓ correctness gate passed — both stores agree on size at every step\n')
}
if (process.env.BENCH_GATE_ONLY) process.exit(0)

// ─── orchestrator: one fresh child per (scenario × library) ──────────────────
interface Row {
  scenario: string
  pyreon: number
  rht: number
  note: string
}

function runCell(scenario: string, impl: ImplName): number {
  const proc = Bun.spawnSync(['bun', import.meta.path, scenario, impl], {
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (proc.exitCode !== 0) {
    process.stderr.write(new TextDecoder().decode(proc.stderr))
    throw new Error(`child failed for cell "${scenario}" × ${impl}`)
  }
  return (JSON.parse(new TextDecoder().decode(proc.stdout)) as { ns: number }).ns
}

const rows: Row[] = []
for (const scenario of SCENARIO_ORDER) {
  rows.push({
    scenario,
    pyreon: runCell(scenario, 'pyreon'),
    rht: runCell(scenario, 'rht'),
    note: SCENARIOS[scenario]!.note,
  })
}

// ── output ──────────────────────────────────────────────────────────────
const fmt = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(2)}µs` : `${x.toFixed(0)}ns`)
const opsPerSec = (ns: number) => Math.round(1e9 / ns).toLocaleString('en-US')
console.log(`\nHeadless toast-store benchmark — @pyreon/toast vs react-hot-toast`)
console.log(`Node ${process.version}, ${process.platform} ${process.arch}, NODE_ENV=production`)
console.log(`Median ns/op (lower = faster). Multiplier = vs fastest in row.`)
console.log(`Each (scenario × library) measured in its OWN fresh process.`)
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
  console.log(`  └ ${r.note}`)
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
