/** @jsxImportSource @pyreon/core */
/**
 * `@pyreon/flow/webview` — REAL bridge + SVG render proof (real Chromium).
 *
 * Same faithful setup as the charts webview test: the web `<WebView>` uses an
 * `<iframe srcdoc>` with the IDENTICAL bridge protocol the native PyreonWebView
 * runtime speaks (forward `__pyreonData` + `pyreondata`; reverse
 * `pyreonPostMessage`). The flow host is fully self-contained (no external
 * bundle), so this exercises the whole thing end-to-end.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { WebView } from '@pyreon/primitives'
import { describe, expect, it } from 'vitest'
import { FlowWebView, buildFlowHostHtml } from './webview'

const HOST = buildFlowHostHtml()

const graph = (labels: string[]) => ({
  nodes: labels.map((l, i) => ({ id: l, position: { x: i * 200, y: i * 80 }, data: { label: l } })),
  edges: labels.slice(1).map((l, i) => ({ source: labels[i]!, target: l })),
})

async function waitForFlow(iframe: HTMLIFrameElement, timeoutMs = 8000): Promise<Document> {
  const start = performance.now()
  for (;;) {
    const win = iframe.contentWindow as (Window & { __pyreonData?: unknown; __pyreonFlowError?: string }) | null
    const doc = iframe.contentDocument
    if (win?.__pyreonFlowError) throw new Error('host error: ' + win.__pyreonFlowError)
    // End state: SVG rendered nodes AND the parent's forward push landed.
    if (doc && win?.__pyreonData !== undefined && doc.querySelectorAll('[data-node-id]').length > 0) {
      return doc
    }
    if (performance.now() - start > timeoutMs) {
      throw new Error(`flow host did not render: data=${typeof win?.__pyreonData} err=${win?.__pyreonFlowError}`)
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

describe('FlowWebView bridge (real SVG diagram in a real iframe)', () => {
  it('FORWARD: pushing a graph renders SVG nodes + bezier edges; updating re-renders in place', async () => {
    const g = signal(graph(['Start', 'Middle', 'End']))
    const wvProps: Record<string, unknown> = { html: HOST }
    Object.defineProperty(wvProps, 'data', { enumerable: true, configurable: true, get: () => g() })
    const { container, unmount } = mountInBrowser(h(WebView as never, wvProps))
    container.style.width = '500px'
    container.style.height = '400px'
    await flush()
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const doc = await waitForFlow(iframe)

    // 3 nodes rendered as real SVG groups with labels.
    const nodeEls = doc.querySelectorAll('[data-node-id]')
    expect(nodeEls.length).toBe(3)
    expect(Array.from(nodeEls).map((n) => n.getAttribute('data-node-id'))).toEqual(['Start', 'Middle', 'End'])
    expect(doc.querySelector('text')!.textContent).toBe('Start')
    // 2 edges rendered as bezier paths (with the arrow marker).
    const edges = Array.from(doc.querySelectorAll('path')).filter((p) => (p.getAttribute('d') ?? '').includes('C'))
    expect(edges.length).toBe(2)
    expect(edges[0]!.getAttribute('marker-end')).toBe('url(#pf-arrow)')

    // UPDATE via the forward bridge — re-renders in place (still one SVG, no reload).
    g.set(graph(['Only']))
    await flush()
    await new Promise((r) => setTimeout(r, 60))
    expect(doc.querySelectorAll('[data-node-id]').length).toBe(1)
    expect(doc.querySelector('[data-node-id]')!.getAttribute('data-node-id')).toBe('Only')

    unmount()
  })

  it('REVERSE: tapping a node drives onSelect with {id,data}', async () => {
    const received: unknown[] = []
    const { container, unmount } = mountInBrowser(
      h(FlowWebView as never, {
        html: HOST,
        graph: () => graph(['A', 'B']),
        onSelect: (p: unknown) => received.push(p),
      }),
    )
    container.style.width = '500px'
    container.style.height = '400px'
    await flush()
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const doc = await waitForFlow(iframe)

    // A real click on the node's SVG group fires the host's handler → the
    // reverse bridge → onSelect (full page → parent → native path).
    const nodeB = doc.querySelector('[data-node-id="B"]') as SVGGElement
    nodeB.dispatchEvent(new (iframe.contentWindow as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent('click', { bubbles: true }))
    await flush()

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ id: 'B', data: { label: 'B' } })
    unmount()
  })
})

describe('FlowWebView performance + robustness', () => {
  const twoFrames = async () => {
    await flush()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }

  it('rapid graph updates coalesce to ~one rebuild/frame; a large 100-node graph renders', async () => {
    // Large graph: 100 nodes in a grid + a chain of edges.
    const big = {
      nodes: Array.from({ length: 100 }, (_, i) => ({
        id: 'n' + i,
        position: { x: (i % 10) * 170, y: Math.floor(i / 10) * 90 },
        data: { label: 'N' + i },
      })),
      edges: Array.from({ length: 99 }, (_, i) => ({ source: 'n' + i, target: 'n' + (i + 1) })),
    }
    const g = signal(big)
    const wvProps: Record<string, unknown> = { html: HOST }
    Object.defineProperty(wvProps, 'data', { enumerable: true, configurable: true, get: () => g() })
    const { container, unmount } = mountInBrowser(h(WebView as never, wvProps))
    container.style.width = '600px'
    container.style.height = '400px'
    await flush()
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const doc = await waitForFlow(iframe)

    // All 100 nodes + 99 bezier edges rendered.
    expect(doc.querySelectorAll('[data-node-id]').length).toBe(100)
    expect(Array.from(doc.querySelectorAll('path')).filter((p) => (p.getAttribute('d') ?? '').includes('C')).length).toBe(99)
    expect((iframe.contentWindow as any).__pyreonFlowError, 'no error on large graph').toBeFalsy()

    // Spy the rebuild count: push 6 synchronous updates → coalesced to few renders.
    const win = iframe.contentWindow as any
    let rebuilds = 0
    // Count node-group creations via a MutationObserver on the <g> layer.
    const layer = doc.querySelector('g') as SVGGElement
    const mo = new (win.MutationObserver || MutationObserver)((muts: MutationRecord[]) => {
      if (muts.some((m) => m.removedNodes.length > 0)) rebuilds++
    })
    mo.observe(layer, { childList: true })
    for (let i = 0; i < 6; i++) g.set({ nodes: big.nodes.slice(0, 3 + i), edges: [] })
    await twoFrames()
    mo.disconnect()

    expect(rebuilds, 'coalesced to <6 rebuilds').toBeLessThan(6)
    expect(doc.querySelectorAll('[data-node-id]').length, 'final state landed').toBe(8) // 3 + 5
    unmount()
  })

  it('malformed / empty graph is ignored gracefully (no crash)', async () => {
    const g = signal({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
    const wvProps: Record<string, unknown> = { html: HOST }
    Object.defineProperty(wvProps, 'data', { enumerable: true, configurable: true, get: () => g() })
    const { container, unmount } = mountInBrowser(h(WebView as never, wvProps))
    container.style.width = '400px'
    container.style.height = '300px'
    await flush()
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    await waitForFlow(iframe)
    const win = iframe.contentWindow as any
    for (const bad of [null, undefined, {}, { nodes: null }, 'x', 42]) {
      g.set(bad as never)
      await twoFrames()
      expect(win.__pyreonFlowError, `no error on ${JSON.stringify(bad)}`).toBeFalsy()
    }
    g.set({ nodes: [{ id: 'z', position: { x: 0, y: 0 }, data: { label: 'Z' } }], edges: [] })
    await twoFrames()
    expect(iframe.contentDocument!.querySelectorAll('[data-node-id]').length).toBe(1)
    unmount()
  })
})
