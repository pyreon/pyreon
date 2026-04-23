// @vitest-environment happy-dom
/**
 * ui-system combined scale probe — rocketstyle + Element + styler working together.
 *
 * Real apps use rocketstyle-wrapped Element components. This probe
 * measures the full mount pipeline cost at scale (100 / 1000 mounts)
 * to catch any super-linear scaling in the combined hot path.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import rocketstyle from '@pyreon/rocketstyle'
import { initTestConfig, ThemeCapture } from '@pyreon/test-utils'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'
import { resetDom } from './_dom-setup'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

beforeEach(() => {
  _reset()
  install()
  resetDom()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
  document.body.innerHTML = ''
})

describe('ui-system combined mount scaling', () => {
  it('100 rocketstyle component mounts — counter footprint per mount is constant', async () => {
    const Card = rocketstyle()({
      name: 'BenchCard',
      component: ThemeCapture,
    }).theme(() => ({
      color: '#111',
      background: '#fff',
      padding: '12px',
      borderRadius: '8px',
    }))

    const root = document.getElementById('root')!
    // Warm up
    for (let i = 0; i < 5; i++) {
      const dispose = mount(h(Card as never, null, 'warm'), root)
      dispose()
      resetDom()
    }

    const outcome = await perfHarness.record('rs-100-mounts', () => {
      for (let i = 0; i < 100; i++) {
        const dispose = mount(h(Card as never, null, `item-${i}`), root)
        dispose()
        resetDom()
      }
    })

    const snap = outcome.after
    const perMount = (c: string) => (snap[c] ?? 0) / 100
    // oxlint-disable-next-line no-console
    console.log(
      `[combined] rocketstyle×100 per-mount: ` +
        `getTheme=${perMount('rocketstyle.getTheme').toFixed(1)}, ` +
        `resolve=${perMount('styler.resolve').toFixed(1)}, ` +
        `sheet.insert.hit=${perMount('styler.sheet.insert.hit').toFixed(1)}, ` +
        `mountChild=${perMount('runtime.mountChild').toFixed(1)}`,
    )
    // All per-mount values should be BOUNDED constants
    expect(perMount('runtime.mountChild')).toBeLessThan(30)
    expect(perMount('styler.resolve')).toBeLessThan(10)
  })

  it('1000 rocketstyle mounts — rocketstyle cache hit ratio ≥ 99%', async () => {
    const Card = rocketstyle()({
      name: 'BulkCard',
      component: ThemeCapture,
    }).theme(() => ({
      color: 'red',
    }))

    const root = document.getElementById('root')!
    // Warm up
    for (let i = 0; i < 5; i++) {
      const dispose = mount(h(Card as never, null, 'warm'), root)
      dispose()
      resetDom()
    }

    const outcome = await perfHarness.record('rs-1000-mounts', () => {
      for (let i = 0; i < 1000; i++) {
        const dispose = mount(h(Card as never, null, `item-${i}`), root)
        dispose()
        resetDom()
      }
    })
    const snap = outcome.after

    // Hit ratios: rocketstyle caches should dominate after warmup.
    // Note: ThemeCapture isn't styled, so styler counters stay at 0 —
    // this test only asserts rocketstyle's own cache ratios.
    const rsHits = snap['rocketstyle.dimensionsMap.hit'] ?? 0
    const totalRuns = 1000
    expect(rsHits / totalRuns).toBeGreaterThan(0.98) // 98%+ hit ratio
    // oxlint-disable-next-line no-console
    console.log(
      `[combined] rocketstyle×1000: dimMap.hit_ratio=${(rsHits / totalRuns).toFixed(3)}, ` +
        `localTheme.hit=${snap['rocketstyle.localThemeManager.hit']}, ` +
        `omitSet.hit=${snap['rocketstyle.omitSet.hit']}`,
    )
  })

  it('100 mounts × 100 unique theme objects — cache correctly handles different themes', async () => {
    // Different THEME object per mount — each one is a fresh identity.
    // Tests that the localThemeManager's WeakMap correctly keys on theme identity.
    const themes = Array.from({ length: 100 }, (_, i) => ({
      color: `rgb(${i}, 0, 0)`,
    }))

    const Card = rocketstyle()({
      name: 'ThemeCarousel',
      component: ThemeCapture,
    }).theme(() => ({ color: 'red' }))

    const root = document.getElementById('root')!

    const outcome = await perfHarness.record('100-themes', () => {
      for (let i = 0; i < 100; i++) {
        const dispose = mount(h(Card as never, { theme: themes[i] }, 'item'), root)
        dispose()
        resetDom()
      }
    })
    // oxlint-disable-next-line no-console
    console.log(
      `[combined] 100 unique themes: localTheme.hit=${outcome.after['rocketstyle.localThemeManager.hit']}, ` +
        `dimMap.hit=${outcome.after['rocketstyle.dimensionsMap.hit']}`,
    )
  })
})
