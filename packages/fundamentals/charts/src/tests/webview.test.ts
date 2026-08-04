/**
 * `@pyreon/charts/webview` — host-builder contract + `<ChartWebView>` emit.
 *
 * The bridge is exercised end-to-end (real ECharts in a real iframe, the exact
 * native protocol) in `webview.browser.test.ts`. This file locks the pure
 * string/emit contract that must hold on every target.
 */
import { describe, expect, it, vi } from 'vitest'
import { WebView } from '@pyreon/primitives'
import { ChartWebView, buildChartHostHtml } from '../webview'

describe('buildChartHostHtml', () => {
  it('produces a self-contained page that inits ECharts + wires the forward/reverse/resize bridge', () => {
    const html = buildChartHostHtml()
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('id="pyreon-chart"')
    expect(html).toContain('echarts.init')
    // Forward bridge: applies window.__pyreonData as the option on `pyreondata`.
    expect(html).toContain("window.addEventListener('pyreondata', apply)")
    // Smart-merge: MERGE on unchanged series structure, replace on change.
    expect(html).toContain('chart.setOption(opt, sig !== lastSig)')
    expect(html).toContain('function seriesSig(')
    // Coalesced to one render/frame.
    expect(html).toContain('requestAnimationFrame(doApply)')
    // Reverse bridge: click → pyreonPostMessage(JSON).
    expect(html).toContain("chart.on('click'")
    expect(html).toContain('window.pyreonPostMessage(JSON.stringify(payload))')
    // Resize.
    expect(html).toContain("window.addEventListener('resize'")
  })

  it('inlines echartsScript (self-contained) and takes precedence over echartsSrc', () => {
    const html = buildChartHostHtml({
      echartsScript: 'window.echarts={init:function(){}}',
      echartsSrc: 'https://example.com/echarts.js',
    })
    expect(html).toContain('window.echarts={init:function(){}}')
    expect(html).not.toContain('https://example.com/echarts.js')
    expect(html).not.toContain('<script src=') // no network tag when inlined
  })

  it('falls back to a CDN <script src> when not inlined (default pinned build)', () => {
    const html = buildChartHostHtml()
    expect(html).toMatch(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/echarts@5[^"]*"><\/script>/)
  })

  it('neutralizes a </script> injection in the inlined engine source', () => {
    const html = buildChartHostHtml({ echartsScript: 'var x="</script><img src=x onerror=alert(1)>"' })
    // The literal closing tag must be broken so it cannot terminate the block.
    expect(html).not.toContain('</script><img')
    expect(html).toContain('<\\/script>')
  })

  it('passes theme + renderer through to echarts.init', () => {
    const html = buildChartHostHtml({ theme: 'dark', renderer: 'svg' })
    expect(html).toContain("echarts.init(el, 'dark', { renderer: 'svg' })")
  })
})

describe('<ChartWebView>', () => {
  it('emits a <WebView> with the built host HTML + the option as `data`', () => {
    const vnode = ChartWebView({ option: { series: [{ type: 'bar', data: [1, 2] }] } })
    expect(vnode.type).toBe(WebView)
    expect(typeof (vnode.props as { html: string }).html).toBe('string')
    expect((vnode.props as { html: string }).html).toContain('echarts.init')
    expect((vnode.props as { data: unknown }).data).toEqual({ series: [{ type: 'bar', data: [1, 2] }] })
    // No onMessage wired when no onSelect.
    expect('onMessage' in (vnode.props as object)).toBe(false)
  })

  it('a provided `html` is used verbatim (const-ref inlining path)', () => {
    const HOST = '<html>custom host</html>'
    const vnode = ChartWebView({ html: HOST, option: {} })
    expect((vnode.props as { html: string }).html).toBe(HOST)
  })

  it('wires onSelect through onMessage, parsing the JSON payload', () => {
    const onSelect = vi.fn()
    const vnode = ChartWebView({ option: {}, onSelect })
    const onMessage = (vnode.props as { onMessage: (m: string) => void }).onMessage
    onMessage(JSON.stringify({ name: 'US', value: 42, dataIndex: 0 }))
    expect(onSelect).toHaveBeenCalledWith({ name: 'US', value: 42, dataIndex: 0 })
  })

  it('a non-JSON reverse message is handed back as { name } (never silently dropped)', () => {
    const onSelect = vi.fn()
    const vnode = ChartWebView({ option: {}, onSelect })
    ;(vnode.props as { onMessage: (m: string) => void }).onMessage('raw-string')
    expect(onSelect).toHaveBeenCalledWith({ name: 'raw-string' })
  })

  // ── `data` is a live getter, not a captured value ───────────────────────
  //
  // The whole reason `data` is defined with `Object.defineProperty` instead of
  // written as `data: props.option` is the descriptor-copy rule: reading a
  // compiler-wrapped reactive prop eagerly collapses it to a static value, and
  // the chart then never updates. That contract had no test — the accessor
  // branch was the one uncovered line in the file.

  it('re-reads `option` on EVERY access, so a signal change reaches the WebView', () => {
    let n = 0
    const vnode = ChartWebView({ option: () => ({ series: [{ data: [++n] }] }) })
    const props = vnode.props as { data: unknown }

    // Two reads must produce two evaluations. A captured value would return
    // the same object both times and the chart would freeze at first render.
    expect(props.data).toEqual({ series: [{ data: [1] }] })
    expect(props.data).toEqual({ series: [{ data: [2] }] })
  })

  it('passes a plain (non-accessor) option object straight through', () => {
    const option = { series: [{ type: 'bar' }] }
    const vnode = ChartWebView({ option })
    expect((vnode.props as { data: unknown }).data).toBe(option)
  })

  it('does NOT evaluate the option accessor at construction time', () => {
    // Eager evaluation is the bug this shape exists to prevent, and it is
    // observable: the accessor must not run until something reads `data`.
    const option = vi.fn(() => ({}))
    const vnode = ChartWebView({ option })
    expect(option).not.toHaveBeenCalled()
    void (vnode.props as { data: unknown }).data
    expect(option).toHaveBeenCalledTimes(1)
  })

  it('forwards each host-builder option to buildChartHostHtml', () => {
    // Every `if (props.X !== undefined)` arm — previously only exercised by
    // calling buildChartHostHtml directly, never THROUGH the component, so a
    // forwarding line could have been dropped without failing anything.
    const vnode = ChartWebView({
      option: {},
      echartsSrc: 'https://example.test/echarts.js',
      theme: 'dark',
      renderer: 'svg',
    })
    const html = (vnode.props as { html: string }).html
    expect(html).toContain('https://example.test/echarts.js')
    expect(html).toContain('dark')
    expect(html).toContain('svg')
  })

  it('forwards an inlined echartsScript through the component', () => {
    const vnode = ChartWebView({ option: {}, echartsScript: '/*INLINE_ECHARTS*/' })
    expect((vnode.props as { html: string }).html).toContain('/*INLINE_ECHARTS*/')
  })
})
