import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Chart } from '../chart-component'
import { useChart } from '../use-chart'

// Real-Chromium smoke for @pyreon/charts.
//
// SCOPE NOTE: ECharts ships CommonJS that Vite's pre-bundler mishandles
// inside @vitest/browser (TypeError: Cannot destructure property
// '__extends' of '__toESM(...).default'). Resolving that is a separate
// vite/optimizeDeps investigation worth its own PR.
//
// What this suite still locks down:
// - <Chart> mounts a real <div> with the supplied style/class through
//   to the live DOM (proves the JSX transform + ref forwarding work)
// - useChart() exposes the documented signals (instance / loading /
//   error / resize) under real-browser conditions
// - When ECharts fails to load (the situation we're in here), the
//   `error` signal captures it instead of throwing — this is the
//   contract consumers rely on for graceful degradation
//
// A follow-up PR can fix the optimizeDeps issue and add full
// canvas-rendering tests on top of these.

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
})
