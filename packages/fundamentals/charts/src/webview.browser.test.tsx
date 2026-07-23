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
    // End state = the option APPLIED (a canvas exists) — apply() is now
    // rAF-coalesced, so instance+data alone races the first setOption.
    if (win?.echarts && el && win.echarts.getInstanceByDom(el) && win.__pyreonData !== undefined && el.querySelector('canvas')) {
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

describe('ChartWebView performance + robustness (real ECharts)', () => {
  async function mountChart(initial: unknown) {
    const opt = signal(initial)
    const wvProps: Record<string, unknown> = { html: HOST }
    Object.defineProperty(wvProps, 'data', { enumerable: true, configurable: true, get: () => opt() })
    const { container, unmount } = mountInBrowser(h(WebView as never, wvProps))
    container.style.width = '400px'
    container.style.height = '300px'
    await flush()
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const win = (await waitForChart(iframe)) as Window & {
      echarts: { getInstanceByDom(el: Element): any }
    }
    const el = iframe.contentDocument!.getElementById('pyreon-chart')!
    const inst = win.echarts.getInstanceByDom(el)
    return { opt, win, el, inst, unmount }
  }
  const twoFrames = async () => {
    await flush()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }

  it('rapid updates COALESCE to ~one setOption/frame, MERGE (not replace), single instance, land the final value', async () => {
    const { opt, win, el, inst, unmount } = await mountChart(barOption([1, 2, 3]))
    // Spy on the host's setOption to record (notMerge) per call.
    const notMergeArgs: unknown[] = []
    const orig = inst.setOption.bind(inst)
    inst.setOption = (o: unknown, nm: unknown) => {
      notMergeArgs.push(nm)
      return orig(o, nm)
    }

    // 8 synchronous data-only updates (same series structure).
    for (let i = 0; i < 8; i++) opt.set(barOption([i, i + 1, i + 2]))
    await twoFrames()

    // Coalesced — far fewer renders than pushes.
    expect(notMergeArgs.length, 'coalesced to <8 renders').toBeLessThan(8)
    expect(notMergeArgs.length).toBeGreaterThan(0)
    // All merges (unchanged series structure) — the fast path.
    expect(notMergeArgs.every((nm) => nm === false), 'data-only updates MERGE').toBe(true)
    // Final value landed.
    expect(inst.getOption().series[0].data).toEqual([7, 8, 9])
    // Never re-created the instance (no teardown/leak).
    expect(win.echarts.getInstanceByDom(el)).toBe(inst)

    // A STRUCTURAL change (bar → pie) → full replace for correctness.
    notMergeArgs.length = 0
    opt.set({ series: [{ type: 'pie', radius: '60%', data: [{ name: 'A', value: 1 }, { name: 'B', value: 2 }] }] })
    await twoFrames()
    expect(notMergeArgs.some((nm) => nm === true), 'structural change REPLACES').toBe(true)
    expect(inst.getOption().series[0].type).toBe('pie')

    unmount()
  })

  it('handles a large 1,000-point series without error', async () => {
    const big = Array.from({ length: 1000 }, (_, i) => Math.sin(i / 20) * 100)
    const { win, el, inst, unmount } = await mountChart({
      xAxis: { type: 'category', data: big.map((_, i) => String(i)) },
      yAxis: {},
      series: [{ type: 'line', showSymbol: false, data: big }],
    })
    expect((win as any).__pyreonChartError, 'no host error on large data').toBeFalsy()
    expect(el.querySelector('canvas')).not.toBeNull()
    expect(inst.getOption().series[0].data.length).toBe(1000)
    expect(inst.getZr().storage.getDisplayList().length, 'drew the large series').toBeGreaterThan(0)
    unmount()
  })

  it('malformed / empty data is ignored gracefully (no crash, no host error)', async () => {
    const { opt, win, el, unmount } = await mountChart(barOption([1, 2, 3]))
    for (const bad of [null, undefined, 'not-an-option', 42, [1, 2, 3]]) {
      opt.set(bad as never)
      await twoFrames()
      expect((win as any).__pyreonChartError, `no error on ${JSON.stringify(bad)}`).toBeFalsy()
    }
    // Recovers with a valid option afterwards.
    opt.set(barOption([9, 8, 7]))
    await twoFrames()
    expect(el.querySelector('canvas')).not.toBeNull()
    unmount()
  })
})
