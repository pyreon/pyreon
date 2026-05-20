/**
 * Regression: `_rsMemo` LRU cap was 32, which thrashed on real-world
 * high-cardinality workloads (data tables with state derived from row
 * data, design systems with many tokens × axes, dashboards rendering many
 * small interactive components). The rs-precompute spike (closed PR #761,
 * branch `spike/rocketstyle-precompute`) bisect-verified that a 60-unique-
 * tuple Button mount loop had 45% cache-miss rate at cap=32 (888 out of
 * 2000 lookups were cold resolves) and 46% wall-clock regression vs the
 * cap-fits-workload case.
 *
 * Fix: raise `RS_MEMO_CAP` from 32 to 128. Memory cost ~12KB per
 * definition per theme (128 × ~100 bytes) — negligible vs the wall-clock
 * win.
 *
 * This test locks the cap behavior via the counter contract: with N=64
 * unique state variants (above the OLD cap of 32, below the NEW cap of
 * 128), a two-pass cold-then-warm render loop must have ZERO cold
 * resolves on the warm pass. Pre-fix (cap=32): the warm pass would
 * re-cold-resolve any tuples the first pass had evicted (the oldest 32
 * of the 64). Post-fix (cap=128): all 64 fit, second pass is fully
 * cached.
 *
 * Bisect verification (run manually before merging):
 *   1. Revert `RS_MEMO_CAP` to 32 in rocketstyle.ts
 *   2. Run this test — both warm-pass assertions fail with "expected N to be 0"
 *   3. Restore cap to 128
 *   4. Run test — both pass
 */

import { initTestConfig, withThemeContext } from '@pyreon/test-utils'
import rocketstyle from '../init'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

// Lightweight counter sink — rocketstyle emits via `globalThis.__pyreon_count__`
// without an import dep on @pyreon/perf-harness. We install our own sink to
// observe the cold-resolve count.
interface CounterGlobal {
  __pyreon_count__?: ((name: string) => void) | undefined
}
function installCounter(): { snapshot: () => Record<string, number>; reset: () => void; uninstall: () => void } {
  const counts: Record<string, number> = {}
  const prev = (globalThis as CounterGlobal).__pyreon_count__
  ;(globalThis as CounterGlobal).__pyreon_count__ = (name: string) => {
    counts[name] = (counts[name] ?? 0) + 1
  }
  return {
    snapshot: () => ({ ...counts }),
    reset: () => {
      for (const k of Object.keys(counts)) delete counts[k]
    },
    uninstall: () => {
      ;(globalThis as CounterGlobal).__pyreon_count__ = prev
    },
  }
}

// Capture the rocketstyle theme accessor's resolved value so a render
// actually invokes `_resolveRsEntry` (the function that emits the
// `rocketstyle.getTheme` counter on cache miss and
// `rocketstyle.dimensionMemo.hit` on cache hit).
const ThemeCapture: any = ({ $rocketstyle, $rocketstate, ...rest }: any) => ({
  type: 'div',
  props: rest,
  $rocketstyle: typeof $rocketstyle === 'function' ? $rocketstyle() : $rocketstyle,
  $rocketstate: typeof $rocketstate === 'function' ? $rocketstate() : $rocketstate,
})
ThemeCapture.displayName = 'ThemeCapture'

// Build N state variants in a single rocketstyle component. Each render
// with a different `state` prop produces a different memo key.
function makeHighCardinalityComponent(N: number): any {
  const states: Record<string, { color: string }> = {}
  for (let i = 0; i < N; i++) {
    states[`s${i}`] = { color: `rgb(${i % 256}, 0, 0)` }
  }
  return rocketstyle()({
    name: `HighCard${N}`,
    component: ThemeCapture,
  }).states(() => states)
}

describe('rocketstyle — _rsMemo LRU cap (regression PR #762)', () => {
  it('warm pass over 64 unique tuples has ZERO cold resolves (cap >= 64)', () => {
    const N = 64
    const Comp: any = makeHighCardinalityComponent(N)
    const counter = installCounter()

    try {
      // Cold pass — fills the memo with N entries.
      for (let i = 0; i < N; i++) {
        withThemeContext(() => Comp({ state: `s${i}` }))
      }
      const afterCold = counter.snapshot()
      const coldGetTheme = afterCold['rocketstyle.getTheme'] ?? 0
      // Sanity: cold pass must have ~N resolves (one per unique state).
      expect(coldGetTheme).toBeGreaterThanOrEqual(N)

      // Warm pass — same N tuples, in same order. With cap >= N, every
      // lookup hits cache. Pre-fix (cap=32, N=64): the cold pass filled
      // the memo and evicted the oldest 32 entries (entries 0..31),
      // leaving entries 32..63 cached. The warm pass would re-cold-
      // resolve entries 0..31 → 32 cold resolves. Post-fix (cap=128):
      // 0 cold resolves on the warm pass.
      counter.reset()
      for (let i = 0; i < N; i++) {
        withThemeContext(() => Comp({ state: `s${i}` }))
      }
      const afterWarm = counter.snapshot()
      const warmColdGetTheme = afterWarm['rocketstyle.getTheme'] ?? 0
      expect(warmColdGetTheme).toBe(0)
    } finally {
      counter.uninstall()
    }
  })

  it('warm pass over 100 unique tuples has ZERO cold resolves (cap = 128)', () => {
    // Second probe at the cap's effective boundary: 100 tuples is comfortably
    // within the cap=128 limit. If the cap were anything less than 100,
    // this would fail. The 64-vs-100 split lets a future bump (e.g. to 256)
    // be detected at the boundary without rewriting tests.
    const N = 100
    const Comp: any = makeHighCardinalityComponent(N)
    const counter = installCounter()

    try {
      for (let i = 0; i < N; i++) {
        withThemeContext(() => Comp({ state: `s${i}` }))
      }
      const afterCold = counter.snapshot()
      expect(afterCold['rocketstyle.getTheme'] ?? 0).toBeGreaterThanOrEqual(N)

      counter.reset()
      for (let i = 0; i < N; i++) {
        withThemeContext(() => Comp({ state: `s${i}` }))
      }
      const afterWarm = counter.snapshot()
      expect(afterWarm['rocketstyle.getTheme'] ?? 0).toBe(0)
    } finally {
      counter.uninstall()
    }
  })

  it('cap still bounds growth — workload of 200 tuples DOES evict (cap < 200)', () => {
    // Control: at workload > cap, the LRU SHOULD evict. This guards against
    // an accidental "remove the cap entirely" change that would let the
    // memo grow unbounded.
    const N = 200
    const Comp: any = makeHighCardinalityComponent(N)
    const counter = installCounter()

    try {
      for (let i = 0; i < N; i++) {
        withThemeContext(() => Comp({ state: `s${i}` }))
      }
      counter.reset()
      // Re-render in same order: with cap=128, the cold pass kept entries
      // 72..199 (last 128 of the 200), so the warm pass will re-resolve
      // entries 0..71 → 72 cold resolves. Some non-zero number must
      // appear; the exact value depends on insertion order.
      for (let i = 0; i < N; i++) {
        withThemeContext(() => Comp({ state: `s${i}` }))
      }
      const afterWarm = counter.snapshot()
      expect(afterWarm['rocketstyle.getTheme'] ?? 0).toBeGreaterThan(0)
    } finally {
      counter.uninstall()
    }
  })
})
