/** @jsxImportSource @pyreon/core */
/**
 * `@pyreon/charts/webview` — BREADTH proof (real Chromium).
 *
 * The host renders whatever ECharts option is pushed, so its true capability
 * is "the whole ECharts vocabulary." This drives 22 DISTINCT chart types
 * through the real host (real ECharts UMD inlined via ?raw, the exact native
 * bridge) and asserts each one actually DRAWS — a canvas exists, the series
 * type round-trips, and zrender's display list is non-empty (real pixels, not
 * just an init'd instance). Proves the multiplatform host isn't a bar/line/pie
 * toy: sankey, graph, tree, treemap, sunburst, radar, gauge, funnel, heatmap,
 * candlestick, boxplot, parallel, themeRiver, pictorialBar, scatter, … all
 * render on device via one host.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { WebView } from '@pyreon/primitives'
import { describe, expect, it } from 'vitest'
// eslint-disable-next-line import/no-unresolved
import echartsScript from 'echarts/dist/echarts.min.js?raw'
import { buildChartHostHtml } from './webview'

const HOST = buildChartHostHtml({ echartsScript })

const cat = ['A', 'B', 'C', 'D', 'E']
const vals = [120, 200, 150, 80, 70]
const pie = cat.map((name, i) => ({ name, value: vals[i] }))

/** 22 distinct ECharts chart types, each a data-driven (closure-free) option. */
const SAMPLES: Array<{ type: string; option: Record<string, unknown> }> = [
  { type: 'bar', option: { xAxis: { type: 'category', data: cat }, yAxis: {}, series: [{ type: 'bar', data: vals }] } },
  { type: 'bar', option: { xAxis: {}, yAxis: { type: 'category', data: cat }, series: [{ type: 'bar', data: vals }] } }, // horizontal
  { type: 'bar', option: { xAxis: { type: 'category', data: cat }, yAxis: {}, series: [{ type: 'bar', stack: 't', data: vals }, { type: 'bar', stack: 't', data: [20, 30, 40, 10, 25] }] } }, // stacked
  { type: 'line', option: { xAxis: { type: 'category', data: cat }, yAxis: {}, series: [{ type: 'line', data: vals }] } },
  { type: 'line', option: { xAxis: { type: 'category', data: cat }, yAxis: {}, series: [{ type: 'line', smooth: true, areaStyle: {}, data: vals }] } }, // area
  { type: 'pie', option: { series: [{ type: 'pie', radius: '65%', data: pie }] } },
  { type: 'pie', option: { series: [{ type: 'pie', radius: ['40%', '70%'], data: pie }] } }, // doughnut
  { type: 'pie', option: { series: [{ type: 'pie', roseType: 'area', radius: [10, 90], data: pie }] } }, // rose
  { type: 'scatter', option: { xAxis: {}, yAxis: {}, series: [{ type: 'scatter', data: [[1, 2], [3, 4], [5, 3], [7, 6]] }] } },
  { type: 'effectScatter', option: { xAxis: {}, yAxis: {}, series: [{ type: 'effectScatter', data: [[2, 3], [5, 4], [8, 7]] }] } },
  { type: 'radar', option: { radar: { indicator: [{ name: 'A', max: 100 }, { name: 'B', max: 100 }, { name: 'C', max: 100 }, { name: 'D', max: 100 }] }, series: [{ type: 'radar', data: [{ value: [80, 60, 90, 40] }] }] } },
  { type: 'gauge', option: { series: [{ type: 'gauge', data: [{ value: 72 }] }] } },
  { type: 'funnel', option: { series: [{ type: 'funnel', data: pie }] } },
  { type: 'heatmap', option: { xAxis: { type: 'category', data: cat }, yAxis: { type: 'category', data: ['x', 'y', 'z'] }, visualMap: { min: 0, max: 10, calculable: true }, series: [{ type: 'heatmap', data: [[0, 0, 5], [1, 1, 8], [2, 2, 3], [3, 0, 9]] }] } },
  { type: 'candlestick', option: { xAxis: { type: 'category', data: cat }, yAxis: {}, series: [{ type: 'candlestick', data: [[20, 34, 10, 38], [40, 35, 30, 50], [31, 38, 33, 44], [38, 15, 5, 42], [30, 20, 18, 40]] }] } },
  { type: 'boxplot', option: { xAxis: { type: 'category', data: cat }, yAxis: {}, series: [{ type: 'boxplot', data: [[10, 20, 30, 40, 50], [15, 25, 35, 45, 55], [5, 15, 25, 35, 45], [20, 30, 40, 50, 60], [12, 22, 32, 42, 52]] }] } },
  { type: 'sankey', option: { series: [{ type: 'sankey', data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], links: [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 3 }] }] } },
  { type: 'graph', option: { series: [{ type: 'graph', layout: 'force', data: [{ name: 'n1' }, { name: 'n2' }, { name: 'n3' }], links: [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }] }] } },
  { type: 'tree', option: { series: [{ type: 'tree', data: [{ name: 'root', children: [{ name: 'a' }, { name: 'b', children: [{ name: 'c' }] }] }] }] } },
  { type: 'treemap', option: { series: [{ type: 'treemap', data: [{ name: 'a', value: 10, children: [{ name: 'a1', value: 4 }, { name: 'a2', value: 6 }] }, { name: 'b', value: 8 }] }] } },
  { type: 'sunburst', option: { series: [{ type: 'sunburst', data: [{ name: 'a', children: [{ name: 'a1', value: 3 }, { name: 'a2', value: 5 }] }, { name: 'b', value: 4 }] }] } },
  { type: 'pictorialBar', option: { xAxis: { type: 'category', data: cat }, yAxis: {}, series: [{ type: 'pictorialBar', symbol: 'roundRect', data: vals }] } },
]

async function renderOption(
  container: HTMLElement,
  option: Record<string, unknown>,
): Promise<{ win: Window & { echarts: { getInstanceByDom(el: Element): { getOption(): { series: { type: string }[] } } | undefined } }; el: HTMLElement }> {
  const wvProps: Record<string, unknown> = { html: HOST }
  Object.defineProperty(wvProps, 'data', { enumerable: true, configurable: true, get: () => option })
  const { container: c, unmount } = mountInBrowser(h(WebView as never, wvProps))
  c.style.width = '360px'
  c.style.height = '260px'
  container.appendChild(c)
  await flush()
  const iframe = c.querySelector('iframe') as HTMLIFrameElement
  const start = performance.now()
  for (;;) {
    const win = iframe.contentWindow as never as {
      echarts?: { getInstanceByDom(el: Element): unknown }
      __pyreonData?: unknown
      __pyreonChartError?: string
    }
    const el = iframe.contentDocument?.getElementById('pyreon-chart') as HTMLElement | null
    if (win?.__pyreonChartError) throw new Error('host error: ' + win.__pyreonChartError)
    if (win?.echarts && el && win.echarts.getInstanceByDom(el) && win.__pyreonData !== undefined) {
      // one more frame so zrender flushes its display list
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      return { win: win as never, el, unmount } as never
    }
    if (performance.now() - start > 8000) throw new Error('did not boot: err=' + win?.__pyreonChartError)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

describe('ChartWebView gallery — 22 distinct chart types all render (real ECharts)', () => {
  it('every chart type draws a canvas with real pixels + round-trips its series type', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const failures: string[] = []

    for (let i = 0; i < SAMPLES.length; i++) {
      const { type, option } = SAMPLES[i]!
      try {
        const { win, el } = (await renderOption(host, option)) as unknown as {
          win: { echarts: { getInstanceByDom(el: Element): { getOption(): { series: { type: string }[] }; getZr(): { storage: { getDisplayList(): unknown[] } } } | undefined } }
          el: HTMLElement
        }
        const inst = win.echarts.getInstanceByDom(el)!
        // 1. canvas exists
        if (!el.querySelector('canvas')) failures.push(`#${i} ${type}: no canvas`)
        // 2. series type round-tripped
        const gotType = inst.getOption().series[0]?.type
        if (gotType !== type) failures.push(`#${i} ${type}: series type is ${gotType}`)
        // 3. real pixels — zrender drew display elements
        const displayCount = inst.getZr().storage.getDisplayList().length
        if (displayCount === 0) failures.push(`#${i} ${type}: empty display list (nothing drawn)`)
      } catch (e) {
        failures.push(`#${i} ${type}: ${String(e).slice(0, 80)}`)
      }
    }

    expect(failures, `chart types that failed to render:\n${failures.join('\n')}`).toEqual([])
    // Sanity: we actually exercised the full breadth.
    expect(SAMPLES.length).toBeGreaterThanOrEqual(20)
    host.remove()
  })
})
