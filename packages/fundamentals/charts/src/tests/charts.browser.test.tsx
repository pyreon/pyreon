import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Chart } from '../chart-component'
import { useChart } from '../use-chart'

// Real-Chromium smoke for @pyreon/charts. Covers:
//   - <Chart> mounts the wrapper div
//   - useChart signal surface (ref/instance/loading/error/resize)
//   - errors land on .error signal instead of throwing
//   - lazy-loads ECharts and renders a <canvas>
//   - reactive options re-apply without remounting the canvas
//
// The ECharts loading path was blocked through Phase 3 (PR #231) by a
// tslib + esbuild interop bug. Resolved in this PR via a `tslib` alias
// to `tslib.es6.js`. See `vitest.browser.config.ts` for the full
// investigation.

const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<boolean> => {
  const start = Date.now()
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise<void>((r) => setTimeout(r, 25))
  }
  return predicate()
}

describe('charts in real browser', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('Chart mounts a real div with supplied style and class', async () => {
    const options = () => ({ series: [{ type: 'bar' as const, data: [1, 2, 3] }] })
    const { container, unmount } = mountInBrowser(
      h(Chart, { options, style: 'width: 400px; height: 300px', class: 'my-chart' }),
    )
    const div = container.querySelector<HTMLDivElement>('div.my-chart')
    expect(div).not.toBeNull()
    expect(div?.style.width).toBe('400px')
    expect(div?.style.height).toBe('300px')
    unmount()
  })

  it('useChart exposes the documented signal surface', () => {
    const result = useChart(() => ({ series: [{ type: 'bar', data: [1] }] }))
    expect(typeof result.ref).toBe('function')
    expect(typeof result.instance).toBe('function')
    expect(typeof result.loading).toBe('function')
    expect(typeof result.error).toBe('function')
    expect(typeof result.resize).toBe('function')
    // Initial state: still loading, no instance yet, no error.
    expect(result.loading()).toBe(true)
    expect(result.instance()).toBeNull()
    expect(result.error()).toBeNull()
  })

  it('captures load/init errors on the error signal instead of throwing', async () => {
    const result = useChart(() => ({ series: [{ type: 'bar', data: [1] }] }))
    // Bind a real container — triggers the load + init effect.
    const el = document.createElement('div')
    el.style.cssText = 'width: 200px; height: 100px'
    document.body.appendChild(el)
    result.ref(el)

    // Either the load succeeds (instance becomes non-null) OR fails
    // (error becomes non-null). Both outcomes are valid contract — what
    // we forbid is a thrown exception escaping useChart.
    const start = Date.now()
    while (
      result.loading() &&
      Date.now() - start < 5000
    ) {
      await new Promise<void>((r) => setTimeout(r, 25))
    }

    expect(result.loading()).toBe(false)
    const ok = result.instance() !== null || result.error() !== null
    expect(ok).toBe(true)
    el.remove()
  })

  it('lazy-loads ECharts and renders a real canvas with non-zero dimensions', async () => {
    const options = () => ({
      xAxis: { type: 'category' as const, data: ['Mon', 'Tue', 'Wed'] },
      yAxis: { type: 'value' as const },
      series: [{ data: [1, 2, 3], type: 'bar' as const }],
    })
    const { container, unmount } = mountInBrowser(
      h(Chart, { options, style: 'width: 400px; height: 300px' }),
    )

    const ok = await waitFor(() => container.querySelector('canvas') !== null, 5000)
    expect(ok).toBe(true)
    const canvas = container.querySelector<HTMLCanvasElement>('canvas')!
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
    unmount()
  })

  it('reactive options getter — signal change re-applies without remounting canvas', async () => {
    const data = signal([1, 2, 3])
    const options = () => ({
      xAxis: { type: 'category' as const, data: ['a', 'b', 'c'] },
      yAxis: { type: 'value' as const },
      series: [{ data: data(), type: 'line' as const }],
    })
    const { container, unmount } = mountInBrowser(
      h(Chart, { options, style: 'width: 400px; height: 300px' }),
    )
    const ready = await waitFor(() => container.querySelector('canvas') !== null, 5000)
    expect(ready).toBe(true)
    const canvasBefore = container.querySelector('canvas')

    data.set([10, 20, 30, 40])
    await new Promise<void>((r) => setTimeout(r, 100))

    const canvasAfter = container.querySelector('canvas')
    // Same canvas element — chart updates via setOption, not remount.
    expect(canvasAfter).toBe(canvasBefore)
    unmount()
  })

  it('useChart.instance() resolves to a real ECharts instance after mount', async () => {
    const result = useChart(() => ({
      xAxis: { type: 'category' as const, data: ['x'] },
      yAxis: { type: 'value' as const },
      series: [{ data: [1], type: 'bar' as const }],
    }))
    const el = document.createElement('div')
    el.style.cssText = 'width: 200px; height: 100px'
    document.body.appendChild(el)
    result.ref(el)

    const ok = await waitFor(() => result.instance() !== null, 5000)
    expect(ok).toBe(true)
    expect(result.error()).toBeNull()
    expect(result.loading()).toBe(false)

    // ECharts instance has the documented API surface.
    const inst = result.instance()!
    expect(typeof inst.setOption).toBe('function')
    expect(typeof inst.resize).toBe('function')
    expect(typeof inst.dispose).toBe('function')
    el.remove()
  })
})
