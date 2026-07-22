/** @jsxImportSource @pyreon/core */
/**
 * `@pyreon/charts/webview` — REAL bridge proof (real Chromium).
 *
 * The web `<WebView>` uses an `<iframe srcdoc>` with the IDENTICAL bridge
 * protocol the shipped native runtime hosts (`PyreonWebView`) speak:
 *   • forward — parent sets `iframe.contentWindow.__pyreonData` + fires a
 *     `pyreondata` event (mirrors iOS `evaluateJavaScript` / Android
 *     `evaluateJavascript` of `window.__pyreonData = …; dispatchEvent(…)`),
 *   • reverse — the page calls `window.pyreonPostMessage(s)` → the host's
 *     `onMessage` (mirrors the WKScriptMessageHandler / @JavascriptInterface).
 * So this test — real ECharts, real iframe, the real `<WebView>` primitive —
 * is a faithful reproduction of what runs on device, not a stand-in.
 *
 * The full ECharts UMD is inlined via Vite's `?raw` so the hosted page is
 * self-contained (the App-Store-safe shape a native build ships).
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { WebView } from '@pyreon/primitives'
import { describe, expect, it } from 'vitest'
// eslint-disable-next-line import/no-unresolved
import echartsScript from 'echarts/dist/echarts.min.js?raw'
import { ChartWebView, buildChartHostHtml } from './webview'

const HOST = buildChartHostHtml({ echartsScript })

const barOption = (data: number[]) => ({
  xAxis: { type: 'category', data: ['A', 'B', 'C'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data }],
})

/**
 * Poll until the host's END STATE: echarts booted AND `echarts.init` ran (an
 * instance exists) AND the parent's forward push landed (`__pyreonData` set on
 * the iframe's `load`). Waiting only for the echarts global races the bridge
 * script + the parent's onLoad push.
 */
async function waitForChart(iframe: HTMLIFrameElement, timeoutMs = 8000): Promise<Window> {
  const start = performance.now()
  for (;;) {
    const win = iframe.contentWindow as
      | (Window & {
          echarts?: { getInstanceByDom(el: Element): unknown }
          __pyreonData?: unknown
          __pyreonChartError?: string
        })
      | null
    const doc = iframe.contentDocument
    const el = doc?.getElementById('pyreon-chart') as HTMLElement | null
    if (win?.__pyreonChartError) throw new Error('host bridge error: ' + win.__pyreonChartError)
    if (win?.echarts && el && win.echarts.getInstanceByDom(el) && win.__pyreonData !== undefined) {
      return win
    }
    if (performance.now() - start > timeoutMs) {
      throw new Error(
        `chart host did not boot: echarts=${!!win?.echarts} inst=${!!(win?.echarts && el && win.echarts.getInstanceByDom(el))} data=${typeof win?.__pyreonData} err=${win?.__pyreonChartError}`,
      )
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

describe('ChartWebView bridge (real ECharts in a real iframe)', () => {
  it('FORWARD: pushing an option renders a real ECharts canvas; updating it re-renders in place', async () => {
    const option = signal(barOption([10, 20, 30]))
    // Simulate the compiler's reactive-prop wrapping: `data` is a getter that
    // reads the signal, so `<WebView>`'s data-tracking effect re-pushes on change.
    const wvProps: Record<string, unknown> = { html: HOST }
    Object.defineProperty(wvProps, 'data', {
      enumerable: true,
      configurable: true,
      get: () => option(),
    })
    const { container, unmount } = mountInBrowser(h(WebView as never, wvProps))
    // Size the container up front so the iframe (100%) — and echarts — has a box
    // by the time the page boots; the host's ResizeObserver covers any late sizing.
    container.style.width = '400px'
    container.style.height = '300px'
    await flush()
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    expect(iframe, 'WebView renders an iframe').not.toBeNull()

    const win = (await waitForChart(iframe)) as Window & {
      echarts: { getInstanceByDom(el: Element): { getOption(): { series?: { data: number[] }[] } } | undefined }
    }
    const el = iframe.contentDocument!.getElementById('pyreon-chart')!

    // Real ECharts rendered: a canvas exists inside the container.
    const canvas = el.querySelector('canvas')
    expect(canvas, 'ECharts rendered a canvas').not.toBeNull()

    // The pushed option reached the live chart instance.
    const inst = win.echarts.getInstanceByDom(el)!
    expect(inst.getOption().series![0]!.data).toEqual([10, 20, 30])

    // UPDATE via the forward bridge — no reload, chart instance is the SAME.
    option.set(barOption([99, 1, 50]))
    await flush()
    await new Promise((r) => setTimeout(r, 50))
    const sameInst = win.echarts.getInstanceByDom(el)!
    expect(sameInst, 'no reload — same chart instance').toBe(inst)
    expect(sameInst.getOption().series![0]!.data).toEqual([99, 1, 50])

    unmount()
  })

  it('REVERSE: the hosted page can drive the native onSelect via pyreonPostMessage', async () => {
    const received: unknown[] = []
    const { container, unmount } = mountInBrowser(
      h(ChartWebView as never, {
        html: HOST,
        option: () => barOption([5, 6, 7]),
        onSelect: (p: unknown) => received.push(p),
      }),
    )
    await flush()
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    iframe.style.width = '300px'
    iframe.style.height = '200px'
    const win = (await waitForChart(iframe)) as Window & {
      pyreonPostMessage?: (m: string) => void
    }

    // The host wires the click handler to call window.pyreonPostMessage — invoke
    // it exactly as an ECharts click would (proving page → parent → onSelect,
    // the bridge half that could break; the echarts-click→post link is
    // string-locked in the unit test).
    expect(typeof win.pyreonPostMessage, 'reverse bridge injected into the page').toBe('function')
    win.pyreonPostMessage!(JSON.stringify({ name: 'B', value: 6, dataIndex: 1, seriesIndex: 0 }))
    await flush()

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ name: 'B', value: 6, dataIndex: 1, seriesIndex: 0 })
    unmount()
  })
})
