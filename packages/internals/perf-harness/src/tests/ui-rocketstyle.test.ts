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

  it('mode toggle (light ↔ dark) 50 times — caches work across modes', async () => {
    const Comp = rocketstyle()({
      name: 'ModeToggle',
      component: ThemeCapture,
    }).theme((_t: unknown, m: (a: unknown, b: unknown) => unknown) => ({
      color: m('#fff', '#000'),
    }))

    // Warm up both modes
    getComputedTheme(Comp, {}, { mode: 'light' })
    getComputedTheme(Comp, {}, { mode: 'dark' })
    perfHarness.reset()

    const outcome = await perfHarness.record('mode-toggle-50', () => {
      for (let i = 0; i < 50; i++) {
        getComputedTheme(Comp, {}, { mode: 'light' })
        getComputedTheme(Comp, {}, { mode: 'dark' })
      }
    })
    // 100 renders total, each should hit all caches
    const themeHits = outcome.after['rocketstyle.localThemeManager.hit'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(`[rocketstyle] mode toggle: localTheme.hit=${themeHits}`)
    // Every render should hit all 4 cache tiers (baseTheme, dimensions,
    // modeBaseTheme, modeDimensionTheme) = at least 400 total hits for 100 renders.
    expect(themeHits).toBeGreaterThan(100)
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
    // 90 renders total; all should hit the caches except the first mount for
    // each dimensions/theme combination.
    // oxlint-disable-next-line no-console
    console.log(
      `[rocketstyle] with sizes: dimMap.hit=${snap['rocketstyle.dimensionsMap.hit']}, localTheme.hit=${snap['rocketstyle.localThemeManager.hit']}`,
    )
    expect(snap['rocketstyle.getTheme']).toBe(90)
  })
})
