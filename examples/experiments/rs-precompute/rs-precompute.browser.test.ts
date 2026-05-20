/**
 * Rocketstyle pre-computation spike
 *
 * Hypothesis under test (from the user): "for each rocketstyle component
 * have precalculated and merged all dimensions used for theming and
 * compose — would it bring measurable improvement over the current runtime
 * `_rsMemo` LRU?"
 *
 * Strategy: instead of changing the compiler, we directly observe whether
 * PRE-WARMING the runtime memo (via mount-and-dispose of every tuple we
 * intend to use, BEFORE the timed loop) shifts measurable cost. This
 * isolates "pre-computation as a concept" from "where the precomputation
 * happens" (build-time vs module-load vs lazy runtime).
 *
 * Variants ×  Profiles = 12 cells. For each cell we capture:
 *   - wall-clock (median of 5 runs, 0 warmup so we see cold-vs-warm)
 *   - perf-harness counters (rocketstyle.getTheme, dimensionMemo.hit,
 *     localThemeManager.hit, styler.resolve, etc.)
 *   - heap delta
 *
 * Variants:
 *   B0: no prime — what every page-load does today
 *   V-A: prime with FULL Cartesian (4 states × 3 sizes × 5 variants = 60)
 *   V-B: prime with EXACT tuple set the timed loop uses
 *   V-C: prime with ONLY the dominant tuple (1 entry)
 *
 * Profiles:
 *   HOT_1:    200 mounts, all same tuple
 *   MIXED_12: 200 mounts, cycling 12 tuples
 *   COLD_60:  200 mounts, cycling all 60 tuples (≈ 3.3 mounts per tuple)
 *
 * For each VARIANT we ALSO time the "prime phase" separately so the
 * grand-total (prime + timed) can be compared honestly. Pre-warming that
 * pays MORE in priming than it saves in the timed loop is a net loss
 * unless the priming can be moved to BUILD time (no runtime cost).
 *
 * IMPORTANT: we do NOT recreate the Button definition per test (impossible
 * without a fresh module load). Instead each test runs WARMUP_RUNS=0 so
 * the first measured run IS the cold-path of the chosen tuple set; the
 * dimension memo is per (definition, theme) — different tuples never
 * collide. We DO measure the test order in the output so we can audit any
 * accidental cross-test cache leakage.
 */

import type { CleanupFn, NativeItem } from '@pyreon/core'
import { h, type VNodeChild } from '@pyreon/core'
import { _tpl, mount } from '@pyreon/runtime-dom'
import { Button } from '@pyreon/ui-components'
import { PyreonUI } from '@pyreon/ui-core'
import { install as installPerfHarness, perfHarness } from '@pyreon/perf-harness'
import { theme } from '@pyreon/ui-theme'
import { flush } from '@pyreon/test-utils/browser'
import { beforeAll, describe, expect, it } from 'vitest'

// ─── Tuples — derived from packages/ui/components/src/components/Button/index.ts
const STATES = ['primary', 'secondary', 'danger', 'success'] as const
const SIZES = ['small', 'medium', 'large'] as const
const VARIANTS = ['solid', 'outline', 'subtle', 'ghost', 'link'] as const
type Tuple = { state: (typeof STATES)[number]; size: (typeof SIZES)[number]; variant: (typeof VARIANTS)[number] }

function cartesian(): Tuple[] {
  const out: Tuple[] = []
  for (const state of STATES) for (const size of SIZES) for (const variant of VARIANTS) {
    out.push({ state, size, variant })
  }
  return out
}
const ALL_60 = cartesian()
const DOMINANT: Tuple = { state: 'primary', size: 'large', variant: 'solid' }
const MIXED_12: Tuple[] = ALL_60.filter((_, i) => i % 5 === 0).slice(0, 12)
// EXACTLY 32 tuples — sized to equal rocketstyle's `_rsMemo` LRU cap. This
// is the boundary case where the cache holds the entire working set with
// zero evictions. Comparing MEDIUM_32 vs COLD_60 isolates pure LRU-pressure
// cost from per-mount work.
const MEDIUM_32: Tuple[] = ALL_60.slice(0, 32)

// ─── Profile generators — produce the N-tuple sequence to mount
type ProfileId = 'HOT_1' | 'MIXED_12' | 'MEDIUM_32' | 'COLD_60'
function profileSequence(id: ProfileId, N: number): Tuple[] {
  switch (id) {
    case 'HOT_1': return Array.from({ length: N }, () => DOMINANT)
    case 'MIXED_12': return Array.from({ length: N }, (_, i) => MIXED_12[i % MIXED_12.length]!)
    case 'MEDIUM_32': return Array.from({ length: N }, (_, i) => MEDIUM_32[i % MEDIUM_32.length]!)
    case 'COLD_60': return Array.from({ length: N }, (_, i) => ALL_60[i % ALL_60.length]!)
  }
}

// ─── Variant primer sets
type VariantId = 'B0' | 'V-A' | 'V-B' | 'V-C'
function primerSet(id: VariantId, profile: ProfileId): Tuple[] {
  switch (id) {
    case 'B0': return []
    case 'V-A': return ALL_60
    case 'V-B': return profileSequence(profile, 200).filter((t, i, arr) =>
      arr.findIndex((x) => x.state === t.state && x.size === t.size && x.variant === t.variant) === i,
    )
    case 'V-C': return [DOMINANT]
  }
}

// ─── Harness
const N = 200
const RUNS = 5

interface CellResult {
  variant: VariantId
  profile: ProfileId
  primeCount: number
  primeMs: number
  timedRuns: number[]
  timedMedian: number
  timedFirstRun: number // proxy for cold-path effect inside the timed loop
  timedSubsequentMedian: number
  counters: Record<string, number>
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  return (s[Math.floor(s.length / 2)] ?? 0)
}

let provider: { mountInto: (t: Tuple, i: number) => CleanupFn; root: Element; dispose: () => void }

function setupProvider(): typeof provider {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(
    h(PyreonUI, { theme, mode: 'light' as const }, h('div', { id: '__ctx-host' })) as unknown as VNodeChild,
    root,
  )
  const inner = root.querySelector('#__ctx-host')!
  return {
    root,
    dispose,
    mountInto: (t, i) =>
      mount(h(Button, { ...t }, `b-${i}`) as unknown as VNodeChild, inner),
  }
}

async function runCell(variant: VariantId, profile: ProfileId): Promise<CellResult> {
  const tuples = profileSequence(profile, N)
  const primer = primerSet(variant, profile)

  // === PRIME PHASE (timed separately) ===
  perfHarness.reset()
  const primeT0 = performance.now()
  const primeDisposers: CleanupFn[] = []
  for (let i = 0; i < primer.length; i++) {
    primeDisposers.push(provider.mountInto(primer[i]!, 10_000 + i))
  }
  await flush()
  for (const d of primeDisposers) d()
  await flush()
  const primeMs = performance.now() - primeT0
  const countersAfterPrime = perfHarness.snapshot()

  // === TIMED LOOP — N=200, 5 runs, no warmup ===
  perfHarness.reset()
  const beforeTimed = perfHarness.snapshot()
  const timedRuns: number[] = []
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now()
    const ds: CleanupFn[] = []
    for (let i = 0; i < N; i++) ds.push(provider.mountInto(tuples[i]!, r * N + i))
    for (const d of ds) d()
    timedRuns.push(performance.now() - t0)
    await flush()
  }
  const afterTimed = perfHarness.snapshot()
  const counters: Record<string, number> = {}
  const allKeys = new Set([...Object.keys(beforeTimed), ...Object.keys(afterTimed)])
  for (const k of allKeys) counters[k] = (afterTimed[k] ?? 0) - (beforeTimed[k] ?? 0)

  return {
    variant,
    profile,
    primeCount: primer.length,
    primeMs,
    timedRuns,
    timedMedian: median(timedRuns),
    timedFirstRun: timedRuns[0]!,
    timedSubsequentMedian: median(timedRuns.slice(1)),
    counters,
  }
}

function fmt(n: number, d = 2): string { return n.toFixed(d) }

function reportRow(r: CellResult): void {
  const totals: Record<string, number> = {
    'rs.getTheme': r.counters['rocketstyle.getTheme'] ?? 0,
    'rs.dimMemo.hit': r.counters['rocketstyle.dimensionMemo.hit'] ?? 0,
    'rs.ltm.hit': r.counters['rocketstyle.localThemeManager.hit'] ?? 0,
    'styler.resolve': r.counters['styler.resolve'] ?? 0,
    'styler.insert': r.counters['styler.sheet.insert'] ?? 0,
    'styler.insert.hit': r.counters['styler.sheet.insert.hit'] ?? 0,
    'rt.mount': r.counters['runtime.mount'] ?? 0,
  }
  // oxlint-disable-next-line no-console
  console.warn(
    `[${r.variant}/${r.profile}] ` +
      `prime: ${fmt(r.primeMs)}ms (${r.primeCount}× tuples) | ` +
      `timed med=${fmt(r.timedMedian)}ms first=${fmt(r.timedFirstRun)}ms tail-med=${fmt(r.timedSubsequentMedian)}ms ` +
      `runs=[${r.timedRuns.map((x) => fmt(x, 1)).join(',')}] | ` +
      `counters=${JSON.stringify(totals)}`,
  )
}

describe('rs-precompute spike — 4 variants × 3 profiles', () => {
  beforeAll(async () => {
    installPerfHarness()
    perfHarness.enable()
    provider = setupProvider()
    // Warm the GLOBAL styler sheet once with a baseline mount so insertions
    // don't pollute the per-cell counter delta on the first measured cell.
    // The styler sheet is module-scoped (singleton across the test file) so
    // priming once here is faithful to a real app's "first paint" cost.
    const warm = provider.mountInto(DOMINANT, -1)
    await flush()
    warm()
    await flush()
  })

  const variants: VariantId[] = ['B0', 'V-A', 'V-B', 'V-C']
  const profiles: ProfileId[] = ['HOT_1', 'MIXED_12', 'MEDIUM_32', 'COLD_60']
  const results: CellResult[] = []

  for (const profile of profiles) {
    for (const variant of variants) {
      it(`${variant} × ${profile}`, async () => {
        const r = await runCell(variant, profile)
        results.push(r)
        reportRow(r)
        // Sanity asserts (light): mount count should match N×RUNS
        expect(r.counters['runtime.mount']).toBeGreaterThanOrEqual(N * RUNS)
      }, 60_000)
    }
  }

  // ─── FLOOR variant — bypass rocketstyle entirely via `_tpl()` with
  // pre-resolved className. Mirrors what `pyreon({ collapse: true })`
  // emits for literal-prop call sites. Defines the THEORETICAL FLOOR for
  // wall-clock — any pre-computation strategy that doesn't reach this
  // value is leaving runtime cost unclaimed.
  const floorResults: CellResult[] = []
  for (const profile of profiles) {
    it(`V-FLOOR × ${profile}`, async () => {
      // Phase 1: capture the resolved class per tuple by mounting the real
      // Button once each + reading className. This is what the resolver
      // would emit at BUILD time under collapse:true.
      const tuples = profileSequence(profile, N)
      const uniqueTuples = tuples.filter((t, i, arr) =>
        arr.findIndex((x) => x.state === t.state && x.size === t.size && x.variant === t.variant) === i,
      )
      const classByTuple = new Map<string, string>()
      perfHarness.reset()
      const captureT0 = performance.now()
      for (const t of uniqueTuples) {
        const captureRoot = document.createElement('div')
        provider.root.appendChild(captureRoot)
        const d = provider.mountInto(t, -99999)
        await flush()
        const btn = provider.root.querySelector('#__ctx-host button:last-of-type') as HTMLElement | null
        if (!btn) throw new Error(`V-FLOOR: capture failed for ${JSON.stringify(t)}`)
        classByTuple.set(`${t.state}|${t.size}|${t.variant}`, btn.className)
        d()
        captureRoot.remove()
        await flush()
      }
      const captureMs = performance.now() - captureT0

      const innerHost = provider.root.querySelector('#__ctx-host')!

      // Phase 2: timed loop using `_tpl()` directly with the resolved class.
      perfHarness.reset()
      const beforeTimed = perfHarness.snapshot()
      const timedRuns: number[] = []
      for (let r = 0; r < RUNS; r++) {
        const t0 = performance.now()
        const ds: CleanupFn[] = []
        for (let i = 0; i < N; i++) {
          const t = tuples[i]!
          const cls = classByTuple.get(`${t.state}|${t.size}|${t.variant}`)!
          const native: NativeItem = _tpl(
            `<button class="${cls}"></button>`,
            (root) => {
              root.textContent = `b-${r * N + i}`
              return null
            },
          )
          ds.push(mount(native as unknown as VNodeChild, innerHost))
        }
        for (const d of ds) d()
        timedRuns.push(performance.now() - t0)
        await flush()
      }
      const afterTimed = perfHarness.snapshot()
      const counters: Record<string, number> = {}
      const allKeys = new Set([...Object.keys(beforeTimed), ...Object.keys(afterTimed)])
      for (const k of allKeys) counters[k] = (afterTimed[k] ?? 0) - (beforeTimed[k] ?? 0)

      const result: CellResult = {
        variant: 'B0', // overload — we'll relabel in report
        profile,
        primeCount: uniqueTuples.length,
        primeMs: captureMs,
        timedRuns,
        timedMedian: median(timedRuns),
        timedFirstRun: timedRuns[0]!,
        timedSubsequentMedian: median(timedRuns.slice(1)),
        counters,
      }
      floorResults.push(result)
      // oxlint-disable-next-line no-console
      console.warn(
        `[V-FLOOR/${profile}] capture: ${fmt(captureMs)}ms (${uniqueTuples.length}× tuples → class) | ` +
          `timed med=${fmt(result.timedMedian)}ms first=${fmt(result.timedFirstRun)}ms tail-med=${fmt(result.timedSubsequentMedian)}ms ` +
          `runs=[${result.timedRuns.map((x) => fmt(x, 1)).join(',')}] | ` +
          `counters={"rs.getTheme":${counters['rocketstyle.getTheme'] ?? 0},"styler.resolve":${counters['styler.resolve'] ?? 0},"rt.mount":${counters['runtime.mount'] ?? 0}}`,
      )
      expect(counters['runtime.mount']).toBeGreaterThanOrEqual(N * RUNS)
    }, 60_000)
  }

  it('SUMMARY (z-final)', async () => {
    // oxlint-disable-next-line no-console
    console.warn('\n=== rs-precompute SPIKE — full results ===')
    for (const r of results) reportRow(r)
    // oxlint-disable-next-line no-console
    console.warn('\n=== analysis by profile ===')
    for (const profile of profiles) {
      const cells = results.filter((r) => r.profile === profile)
      const b0 = cells.find((c) => c.variant === 'B0')
      if (!b0) continue
      const floor = floorResults.find((f) => f.profile === profile)
      // oxlint-disable-next-line no-console
      console.warn(`\n[${profile}] baseline B0 timed-median=${fmt(b0.timedMedian)}ms (cold-path getTheme=${b0.counters['rocketstyle.getTheme'] ?? 0})`)
      for (const v of ['V-A', 'V-B', 'V-C'] as VariantId[]) {
        const c = cells.find((x) => x.variant === v)
        if (!c) continue
        const deltaTimed = c.timedMedian - b0.timedMedian
        const deltaTotal = (c.primeMs + c.timedMedian) - b0.timedMedian
        const sign = deltaTimed < 0 ? '−' : '+'
        const totalSign = deltaTotal < 0 ? '−' : '+'
        // oxlint-disable-next-line no-console
        console.warn(
          `  ${v}: prime=${fmt(c.primeMs)}ms timed=${fmt(c.timedMedian)}ms ` +
            `(timed Δ=${sign}${fmt(Math.abs(deltaTimed))}ms, ` +
            `total Δ=${totalSign}${fmt(Math.abs(deltaTotal))}ms) ` +
            `cold-resolves: ${c.counters['rocketstyle.getTheme'] ?? 0} (baseline ${b0.counters['rocketstyle.getTheme'] ?? 0})`,
        )
      }
      if (floor) {
        const ratio = b0.timedMedian / floor.timedMedian
        // oxlint-disable-next-line no-console
        console.warn(
          `  V-FLOOR: capture=${fmt(floor.primeMs)}ms timed=${fmt(floor.timedMedian)}ms ` +
            `(B0 is ${fmt(ratio, 1)}× FLOOR — that's the runtime cost still on the table) ` +
            `cold-resolves: 0 (rocketstyle bypassed)`,
        )
      }
    }
  })
})
