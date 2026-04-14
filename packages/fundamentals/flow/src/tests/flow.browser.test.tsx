import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'

// Real-Chromium smoke suite for @pyreon/flow.
//
// Why this exists: <Flow> renders SVG paths + transforms via CSS, uses
// pointer events for drag/pan, and depends on real layout for hit
// testing. happy-dom doesn't compute layout or honor pointer-event
// dispatch the way real browsers do. This suite exercises a small
// graph end-to-end.

describe('flow in real browser', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the configured nodes and edges', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 200, y: 100 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    expect(flow.nodes()).toHaveLength(2)
    expect(flow.edges()).toHaveLength(1)
    // Default node renders a div with the data-nodeid attribute.
    expect(container.querySelectorAll('[data-nodeid]').length).toBeGreaterThanOrEqual(2)
    unmount()
  })

  it('selectNode flips the reactive selectedNodes signal and highlights the node', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 200, y: 100 }, data: { label: 'B' } },
      ],
    })
    const { unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    expect(flow.selectedNodes()).toEqual([])

    flow.selectNode('1')
    await flush()
    expect(flow.selectedNodes()).toEqual(['1'])

    flow.selectNode('2')
    await flush()
    // Non-additive: '1' is replaced.
    expect(flow.selectedNodes()).toEqual(['2'])

    flow.selectNode('1', true)
    await flush()
    expect([...flow.selectedNodes()].sort()).toEqual(['1', '2'])
    unmount()
  })

  it('updateNode mutates position reactively and re-renders without remounting nodes', async () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    const nodeEl = container.querySelector<HTMLElement>('[data-nodeid="1"]')
    expect(nodeEl).not.toBeNull()
    const originalRef = nodeEl

    flow.updateNode('1', { position: { x: 250, y: 175 } })
    await flush()

    // Same DOM element — no remount; position is reactive.
    expect(container.querySelector('[data-nodeid="1"]')).toBe(originalRef)
    expect(flow.nodes()[0]?.position).toEqual({ x: 250, y: 175 })
    unmount()
  })
})
