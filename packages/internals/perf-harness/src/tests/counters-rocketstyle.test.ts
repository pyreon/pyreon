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
  it('fires on the first $rocketstyleAccessor invocation (memo miss)', async () => {
    const Comp = rocketstyle()({
      name: 'GetThemeProbe',
      component: ThemeCapture,
    }).theme(() => ({ color: 'red' }))

    const outcome = await perfHarness.record('resolve-once', () => {
      getComputedTheme(Comp, {}, { mode: 'light' })
    })
    // First render: dimension-prop memo misses, fresh resolution fires.
    expect(outcome.after['rocketstyle.getTheme']).toBeGreaterThanOrEqual(1)
  })
})

describe('rocketstyle.dimensionMemo.hit', () => {
  it('fires on the second+ render with the same prop tuple (skips fresh resolve)', async () => {
    const Comp = rocketstyle()({
      name: 'MemoProbe',
      component: ThemeCapture,
    }).theme(() => ({ color: 'red' }))

    // Prime the memo
    getComputedTheme(Comp, {}, { mode: 'light' })
    const outcome = await perfHarness.record('memo-hit', () => {
      getComputedTheme(Comp, {}, { mode: 'light' })
      getComputedTheme(Comp, {}, { mode: 'light' })
    })
    // Two renders with identical key → two memo hits, zero fresh resolves
    expect(outcome.after['rocketstyle.dimensionMemo.hit']).toBeGreaterThanOrEqual(2)
    expect(outcome.after['rocketstyle.getTheme'] ?? 0).toBe(0)
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
  it('fires when theme is warm but the dimension-prop memo misses', async () => {
    // Use sizes() so we can force a memo miss with a different prop tuple
    // while the underlying theme + mode caches are already warm.
    const Comp = rocketstyle()({
      name: 'ThemeMgrProbe',
      component: ThemeCapture,
    })
      .sizes(() => ({ small: { fontSize: '12px' }, large: { fontSize: '16px' } }))
      .theme(() => ({ color: 'red' }))

    // Prime: warms theme + mode + memo for size=small
    getComputedTheme(Comp, { size: 'small' }, { mode: 'light' })
    // Now render with size=large — memo misses but theme/mode caches hit.
    // The localThemeManager rollup fires 4× (baseTheme, dimensionsThemes,
    // modeBaseTheme, modeDimensionTheme) on the fresh resolution path.
    const outcome = await perfHarness.record('warm-theme-cold-memo', () => {
      getComputedTheme(Comp, { size: 'large' }, { mode: 'light' })
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
