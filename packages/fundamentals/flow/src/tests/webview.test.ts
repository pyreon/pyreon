/**
 * `@pyreon/flow/webview` — host-builder contract + `<FlowWebView>` emit.
 * The bridge + real SVG render are exercised in `webview.browser.test.tsx`.
 */
import { describe, expect, it, vi } from 'vitest'
import { WebView } from '@pyreon/primitives'
import { FlowWebView, buildFlowHostHtml } from '../webview'

describe('buildFlowHostHtml', () => {
  it('produces a self-contained SVG diagram host wired to the forward/reverse bridge', () => {
    const html = buildFlowHostHtml()
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('id="pyreon-flow"')
    expect(html).toContain('createElementNS') // real SVG renderer, no external engine
    expect(html).toContain("window.addEventListener('pyreondata', schedule)") // forward (coalesced)
    expect(html).toContain('function schedule(')
    expect(html).toContain('window.pyreonPostMessage(JSON.stringify({ id: n.id, data: n.data }))') // reverse
    expect(html).toContain('function bezier(') // flow's edge geometry inlined
    // No network dependency — fully self-contained.
    expect(html).not.toContain('<script src=')
  })

  it('threads style options into the renderer', () => {
    const html = buildFlowHostHtml({ nodeFill: '#eef', edgeColor: '#123456', nodeWidth: 200 })
    expect(html).toContain('#eef')
    expect(html).toContain('#123456')
    expect(html).toContain('NODE_W = 200')
  })
})

describe('<FlowWebView>', () => {
  const graph = { nodes: [{ id: 'a', position: { x: 0, y: 0 } }], edges: [] }

  it('emits a <WebView> with the host HTML + the graph as reactive `data`', () => {
    const vnode = FlowWebView({ graph })
    expect(vnode.type).toBe(WebView)
    expect((vnode.props as { html: string }).html).toContain('pyreon-flow')
    expect((vnode.props as { data: unknown }).data).toEqual(graph)
    expect('onMessage' in (vnode.props as object)).toBe(false)
  })

  it('unwraps an accessor graph', () => {
    const vnode = FlowWebView({ graph: () => graph })
    expect((vnode.props as { data: unknown }).data).toEqual(graph)
  })

  it('wires onSelect through onMessage, parsing {id,data}', () => {
    const onSelect = vi.fn()
    const vnode = FlowWebView({ graph, onSelect })
    ;(vnode.props as { onMessage: (m: string) => void }).onMessage(
      JSON.stringify({ id: 'a', data: { label: 'Start' } }),
    )
    expect(onSelect).toHaveBeenCalledWith({ id: 'a', data: { label: 'Start' } })
  })

  it('a non-JSON reverse message is handed back as { id } (never dropped)', () => {
    const onSelect = vi.fn()
    ;(FlowWebView({ graph, onSelect }).props as { onMessage: (m: string) => void }).onMessage('x')
    expect(onSelect).toHaveBeenCalledWith({ id: 'x' })
  })
})
