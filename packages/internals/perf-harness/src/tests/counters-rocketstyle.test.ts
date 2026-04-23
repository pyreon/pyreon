/**
 * Per-counter behavioural tests for @pyreon/rocketstyle.
 *
 * Uses `@pyreon/test-utils.getComputedTheme` to drive the rocketstyle
 * resolution pipeline end-to-end — that's the same path that fires
 * `rocketstyle.getTheme` + the three cache-hit counters on every render.
 */
import { getComputedTheme, initTestConfig, ThemeCapture } from '@pyreon/test-utils'
import rocketstyle from '@pyreon/rocketstyle'
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

describe('rocketstyle.getTheme', () => {
  it('fires once per $rocketstyleAccessor invocation', async () => {
    const Comp = rocketstyle()({
      name: 'GetThemeProbe',
      component: ThemeCapture,
    }).theme(() => ({ color: 'red' }))

    const outcome = await perfHarness.record('resolve-once', () => {
      getComputedTheme(Comp, {}, { mode: 'light' })
    })
    expect(outcome.after['rocketstyle.getTheme']).toBeGreaterThanOrEqual(1)
  })
})

describe('rocketstyle.dimensionsMap.hit', () => {
  it('fires on the second+ render of the same component definition', async () => {
    const Comp = rocketstyle()({
      name: 'DimCacheProbe',
      component: ThemeCapture,
    }).theme(() => ({ color: 'red' }))

    // First render primes the WeakMap; second+ should hit.
    getComputedTheme(Comp, {}, { mode: 'light' })
    const outcome = await perfHarness.record('second-render', () => {
      getComputedTheme(Comp, {}, { mode: 'light' })
      getComputedTheme(Comp, {}, { mode: 'light' })
    })
    // Two renders of the already-primed definition → both should hit the
    // dimensions WeakMap.
    expect(outcome.after['rocketstyle.dimensionsMap.hit']).toBeGreaterThanOrEqual(2)
  })
})

describe('rocketstyle.localThemeManager.hit', () => {
  it('fires when theme + mode are stable (WeakMap tier hit)', async () => {
    const Comp = rocketstyle()({
      name: 'ThemeMgrProbe',
      component: ThemeCapture,
    }).theme(() => ({ color: 'red' }))

    // Prime caches.
    getComputedTheme(Comp, {}, { mode: 'light' })
    // Subsequent renders with the same theme + mode should hit all four
    // cache tiers (baseTheme, dimensionsThemes, modeBaseTheme,
    // modeDimensionTheme) — the counter rolls them up, so 4 hits per
    // render.
    const outcome = await perfHarness.record('same-theme-same-mode', () => {
      getComputedTheme(Comp, {}, { mode: 'light' })
    })
    expect(outcome.after['rocketstyle.localThemeManager.hit']).toBeGreaterThanOrEqual(4)
  })
})

describe('rocketstyle.omitSet.hit', () => {
  it('fires on the second+ render of the same definition (omitSet reused)', async () => {
    const Comp = rocketstyle()({
      name: 'OmitSetProbe',
      component: ThemeCapture,
    }).theme(() => ({ color: 'red' }))

    getComputedTheme(Comp, {}, { mode: 'light' })
    const outcome = await perfHarness.record('second-omit', () => {
      getComputedTheme(Comp, {}, { mode: 'light' })
    })
    expect(outcome.after['rocketstyle.omitSet.hit']).toBeGreaterThanOrEqual(1)
  })
})
