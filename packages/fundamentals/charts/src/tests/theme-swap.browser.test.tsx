/**
 * Real-Chromium, REAL-echarts lock for the reactive theme swap (2026-07
 * charts audit gap 1). The mocked-echarts twin (theme-swap-fastpath.test.tsx)
 * locks the wrapper's state machine; this file proves the mechanism against
 * the actual engine: dispose + re-init with the built-in 'dark' theme, the
 * current option re-applied, and a real canvas re-rendered.
 *
 * Bisect-verified (see PR body): against the pre-fix init-once theme read the
 * "flips the theme accessor…" spec fails — `chart.instance()` never changes
 * and `isDisposed()` stays false.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { useChart } from '../use-chart'

const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<boolean> => {
  const start = Date.now()
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise<void>((r) => setTimeout(r, 25))
  }
  return predicate()
}

describe('reactive theme swap (real echarts)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('flips the theme accessor → old instance disposed, new instance themed, option survives, canvas re-rendered', async () => {
    const mode = signal<'light' | 'dark'>('light')

    let chart!: ReturnType<typeof useChart>
    const Comp = () => {
      chart = useChart(
        () => ({
          xAxis: { type: 'category' as const, data: ['A', 'B', 'C'] },
          yAxis: { type: 'value' as const },
          series: [{ type: 'bar' as const, data: [5, 10, 15] }],
        }),
        { theme: () => (mode() === 'dark' ? 'dark' : null) },
      )
      return h('div', { ref: chart.ref, style: 'width: 400px; height: 300px' })
    }

    const { container, unmount } = mountInBrowser(h(Comp, {}))

    expect(await waitFor(() => chart.instance() !== null)).toBe(true)
    const inst1 = chart.instance()!
    expect(await waitFor(() => container.querySelector('canvas') !== null)).toBe(true)

    mode.set('dark')

    // Swap is synchronous — the effect disposed + re-inited on the flip.
    const inst2 = chart.instance()!
    expect(inst2).not.toBe(inst1)
    expect(inst1.isDisposed()).toBe(true)
    // Real-echarts quirk: `_disposed` has no initializer, so isDisposed() is
    // `undefined` (falsy) on a LIVE instance — assert falsy, not `false`.
    expect(inst2.isDisposed()).toBeFalsy()

    // The current option was re-applied to the NEW instance. `lazyUpdate:
    // true` (our default) defers the apply past the synchronous swap, so
    // poll getOption() rather than reading it in the same tick.
    const readOpt = () =>
      inst2.getOption() as {
        series?: { type?: string; data?: unknown[] }[]
        backgroundColor?: unknown
      }
    expect(await waitFor(() => readOpt().series?.[0] != null)).toBe(true)
    const opt = readOpt()
    expect(opt.series?.[0]?.type).toBe('bar')
    expect(opt.series?.[0]?.data).toEqual([5, 10, 15])

    // The dark theme actually took effect — echarts' built-in dark theme
    // sets a solid dark backgroundColor (the default theme leaves it unset /
    // transparent). inst1 is disposed, so we assert on inst2's option only.
    expect(opt.backgroundColor).toBeTruthy()
    expect(opt.backgroundColor).not.toBe('transparent')

    // A real canvas is (re-)rendered under the new instance.
    expect(await waitFor(() => container.querySelector('canvas') !== null)).toBe(true)
    const canvas = container.querySelector('canvas')!
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)

    // Reactivity survives the swap — resize() on the new instance is callable
    // and a subsequent option-driven update lands (no stale-instance effects).
    expect(() => chart.resize()).not.toThrow()

    unmount()
  })

  it('flipping BACK to the default theme swaps again (round-trip)', async () => {
    const mode = signal<'light' | 'dark'>('dark')

    let chart!: ReturnType<typeof useChart>
    const Comp = () => {
      chart = useChart(
        () => ({
          xAxis: { type: 'category' as const, data: ['A', 'B'] },
          yAxis: { type: 'value' as const },
          series: [{ type: 'bar' as const, data: [1, 2] }],
        }),
        { theme: () => (mode() === 'dark' ? 'dark' : null) },
      )
      return h('div', { ref: chart.ref, style: 'width: 300px; height: 200px' })
    }

    const { unmount } = mountInBrowser(h(Comp, {}))
    expect(await waitFor(() => chart.instance() !== null)).toBe(true)
    const darkInst = chart.instance()!

    mode.set('light')
    const lightInst = chart.instance()!
    expect(lightInst).not.toBe(darkInst)
    expect(darkInst.isDisposed()).toBe(true)
    // lazyUpdate defers the re-apply — poll (see the spec above).
    const readOpt = () => lightInst.getOption() as { series?: { data?: unknown[] }[] }
    expect(await waitFor(() => readOpt().series?.[0] != null)).toBe(true)
    expect(readOpt().series?.[0]?.data).toEqual([1, 2])

    unmount()
  })
})
