// @vitest-environment happy-dom
/**
 * rocketstyle hot-path probe.
 *
 * Drives the rocketstyle resolution pipeline through `getComputedTheme`
 * and measures cache hit ratios across repeated invocations with same
 * and different modes/themes.
 */
import rocketstyle from '@pyreon/rocketstyle'
import { getComputedTheme, initTestConfig, ThemeCapture } from '@pyreon/test-utils'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

describe('rocketstyle hot-path', () => {
  it('100 renders of the same component — cache hit ratio ≥ 99%', async () => {
    const Comp = rocketstyle()({
      name: 'RepeatComp',
      component: ThemeCapture,
    }).theme((_t: unknown, m: (a: unknown, b: unknown) => unknown) => ({
      color: m('light-blue', 'dark-blue'),
      background: m('#fff', '#000'),
      padding: '12px',
    }))

    // Warm up caches
    getComputedTheme(Comp, {}, { mode: 'light' })
    perfHarness.reset()

    const outcome = await perfHarness.record('100-renders', () => {
      for (let i = 0; i < 100; i++) {
        getComputedTheme(Comp, {}, { mode: 'light' })
      }
    })
    const dimHits = outcome.after['rocketstyle.dimensionsMap.hit'] ?? 0
    const themeHits = outcome.after['rocketstyle.localThemeManager.hit'] ?? 0
    const omitHits = outcome.after['rocketstyle.omitSet.hit'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(
      `[rocketstyle] 100-renders: dimMap.hit=${dimHits}, localTheme.hit=${themeHits}, omitSet.hit=${omitHits}`,
    )
    // Each render should hit all 3 caches
    expect(dimHits).toBeGreaterThanOrEqual(99)
    expect(omitHits).toBeGreaterThanOrEqual(99)
  })

  it('mode toggle (light ↔ dark) 50 times — dimension-prop memo catches both modes', async () => {
    const Comp = rocketstyle()({
      name: 'ModeToggle',
      component: ThemeCapture,
    }).theme((_t: unknown, m: (a: unknown, b: unknown) => unknown) => ({
      color: m('#fff', '#000'),
    }))

    // Warm up both modes — populates the dimension-prop memo with one
    // entry per mode (key includes the mode value).
    getComputedTheme(Comp, {}, { mode: 'light' })
    getComputedTheme(Comp, {}, { mode: 'dark' })
    perfHarness.reset()

    const outcome = await perfHarness.record('mode-toggle-50', () => {
      for (let i = 0; i < 50; i++) {
        getComputedTheme(Comp, {}, { mode: 'light' })
        getComputedTheme(Comp, {}, { mode: 'dark' })
      }
    })
    const memoHits = outcome.after['rocketstyle.dimensionMemo.hit'] ?? 0
    const freshResolves = outcome.after['rocketstyle.getTheme'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(
      `[rocketstyle] mode toggle: dimensionMemo.hit=${memoHits}, getTheme=${freshResolves}`,
    )
    // 100 renders × 2 accessor calls each (ThemeCapture invokes both
    // `$rocketstyle()` and `$rocketstate()`) = 200 lookups, all hits.
    expect(memoHits).toBe(200)
    expect(freshResolves).toBe(0)
  })

  it('4 different components with identical themes — each hits its own definition cache', async () => {
    const makeComp = (name: string) =>
      rocketstyle()({
        name,
        component: ThemeCapture,
      }).theme(() => ({ color: '#fff' }))

    const A = makeComp('A')
    const B = makeComp('B')
    const C = makeComp('C')
    const D = makeComp('D')

    perfHarness.reset()
    // Mount each twice
    for (const Comp of [A, B, C, D, A, B, C, D]) {
      getComputedTheme(Comp, {}, { mode: 'light' })
    }

    const snap = perfHarness.snapshot()
    // First pass: 4 misses. Second pass: 4 hits. Total: 4 dim-cache hits.
    // (per-definition caches are independent, so each definition caches separately)
    expect(snap['rocketstyle.dimensionsMap.hit']).toBe(4)
  })

  it('with dimension props set — rocketstate resolves without extra recompute', async () => {
    const Comp = rocketstyle()({
      name: 'StatesComp',
      component: ThemeCapture,
    })
      .sizes(() => ({
        small: { fontSize: '12px' },
        medium: { fontSize: '14px' },
        large: { fontSize: '16px' },
      }))
      .theme(() => ({ color: 'red' }))

    perfHarness.reset()
    // Render with different sizes
    for (let i = 0; i < 30; i++) {
      getComputedTheme(Comp, { size: 'small' }, { mode: 'light' })
      getComputedTheme(Comp, { size: 'medium' }, { mode: 'light' })
      getComputedTheme(Comp, { size: 'large' }, { mode: 'light' })
    }
    const snap = perfHarness.snapshot()
    // 90 renders × 3 unique size values → memo populates 3 entries on the
    // first render of each. ThemeCapture invokes both `$rocketstyle()` and
    // `$rocketstate()` per render, so each render is 2 lookups: the first
    // is a miss-or-hit, the second is always a hit (entry just stored or
    // already cached). Net: 3 misses + (90 × 2 - 3) = 177 hits.
    // oxlint-disable-next-line no-console
    console.log(
      `[rocketstyle] with sizes: dimMap.hit=${snap['rocketstyle.dimensionsMap.hit']}, ` +
        `localTheme.hit=${snap['rocketstyle.localThemeManager.hit']}, ` +
        `dimensionMemo.hit=${snap['rocketstyle.dimensionMemo.hit']}, ` +
        `getTheme=${snap['rocketstyle.getTheme']}`,
    )
    expect(snap['rocketstyle.getTheme']).toBe(3)
    expect(snap['rocketstyle.dimensionMemo.hit']).toBe(177)
  })
})
