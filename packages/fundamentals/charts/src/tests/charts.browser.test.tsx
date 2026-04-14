import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Chart } from '../chart-component'
import { useChart } from '../use-chart'

// Real-Chromium smoke for @pyreon/charts.
//
// SCOPE NOTE: ECharts ships CommonJS that Vite's pre-bundler cannot
// transform under @vitest/browser. See vitest.browser.config.ts for
// the full investigation log. Bridge tests here lock down the parts
// of @pyreon/charts contract that don't require ECharts to load.

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
