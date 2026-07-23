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
})
