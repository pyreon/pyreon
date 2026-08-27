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

describe('webview — coverage of the defensive and forwarding paths', () => {
  it('num() substitutes 0 for a non-finite dimension rather than emitting NaN', () => {
    // The emitted string is executed as JS inside the host page, so a NaN or
    // Infinity reaching `var NODE_W = …` would produce a diagram that lays out
    // to nothing — silently, with no parse error to trace it by.
    const nan = buildFlowHostHtml({ nodeWidth: Number.NaN, nodeHeight: Number.NaN })
    expect(nan).toContain('var NODE_W = 0, NODE_H = 0;')
    expect(nan).not.toContain('NaN')

    const inf = buildFlowHostHtml({
      nodeWidth: Number.POSITIVE_INFINITY,
      nodeHeight: Number.NEGATIVE_INFINITY,
    })
    expect(inf).toContain('var NODE_W = 0, NODE_H = 0;')
  })

  it('FlowWebView forwards every optional style prop into the built host HTML', () => {
    // Each of these is an `if (props.X !== undefined)` line. A dropped one is
    // invisible: the diagram still renders, just ignoring that prop.
    const vnode = FlowWebView({
      graph: { nodes: [], edges: [] },
      nodeWidth: 111,
      nodeHeight: 222,
      nodeFill: '#abcdef',
      nodeStroke: '#123456',
      labelColor: '#fedcba',
      edgeColor: '#654321',
    })

    const html = (vnode.props as { html: string }).html
    expect(html).toContain('var NODE_W = 111, NODE_H = 222;')
    for (const c of ['#abcdef', '#123456', '#fedcba', '#654321']) {
      expect(html).toContain(c)
    }
  })

  it('an explicit `html` prop wins over the built default', () => {
    const vnode = FlowWebView({
      graph: { nodes: [], edges: [] },
      html: '<!doctype html><p>mine</p>',
    })
    expect((vnode.props as { html: string }).html).toBe('<!doctype html><p>mine</p>')
  })
})

describe('buildFlowHostHtml — color hardening', () => {
  it("strips breakout chars from color options (can't close the JS string / HTML attr)", () => {
    const html = buildFlowHostHtml({ edgeColor: "red'; x</style><script>evil" })
    // the raw payload — the quote/semicolon/</> that enable a breakout — is gone
    expect(html).not.toContain("red';")
    expect(html).not.toContain('</style><script>evil')
    // present only in sanitized form (CSS-token chars only); the head's own
    // <style>/<script> are unrelated and untouched
    expect(html).toContain('red xstylescriptevil')
  })
})
