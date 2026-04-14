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

  it('drags a node via real PointerEvent sequence (down/move/up)', async () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    })
    const seenDragStart: string[] = []
    flow.onNodeDragStart((n) => seenDragStart.push(n.id))

    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    const node = container.querySelector<HTMLElement>('[data-nodeid="1"]')!
    const flowEl = container.querySelector<HTMLElement>('.pyreon-flow')!

    const dispatch = (
      el: Element,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      x: number,
      y: number,
    ) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          isPrimary: true,
          pointerType: 'mouse',
          button: type === 'pointermove' ? -1 : 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
        }),
      )

    dispatch(node, 'pointerdown', 10, 10)
    // Confirms drag actually started before we move.
    expect(seenDragStart).toEqual(['1'])

    // After setPointerCapture(1) on the flow container, subsequent
    // pointer events for pointerId=1 are routed to the container.
    dispatch(flowEl, 'pointermove', 60, 40)
    dispatch(flowEl, 'pointermove', 110, 80)
    dispatch(flowEl, 'pointerup', 110, 80)
    await flush()

    const pos = flow.nodes()[0]!.position
    expect(pos.x).toBeGreaterThan(0)
    expect(pos.y).toBeGreaterThan(0)
    unmount()
  })

  it('node click selects via real click event (not just selectNode API)', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 200, y: 100 }, data: { label: 'B' } },
      ],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    const node1 = container.querySelector<HTMLElement>('[data-nodeid="1"]')!
    node1.click()
    await flush()
    expect(flow.selectedNodes()).toEqual(['1'])

    // Node click also fires the nodeClick event listener (subscribe API)
    const seen: string[] = []
    flow.onNodeClick((n) => seen.push(n.id))
    container.querySelector<HTMLElement>('[data-nodeid="2"]')!.click()
    await flush()
    expect(seen).toEqual(['2'])
    unmount()
  })

  it('handles empty graph (zero nodes, zero edges) without crashing', async () => {
    const flow = createFlow({ nodes: [], edges: [] })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()
    // Container mounts even for empty graph.
    expect(container.querySelector('.pyreon-flow')).not.toBeNull()
    expect(flow.nodes()).toEqual([])
    unmount()
  })

  it('addNode after mount updates the rendered DOM (live mutation)', async () => {
    const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }] })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()
    expect(container.querySelectorAll('[data-nodeid]')).toHaveLength(1)

    flow.addNode({ id: '2', position: { x: 100, y: 100 }, data: {} })
    await flush()
    expect(container.querySelectorAll('[data-nodeid]')).toHaveLength(2)
    expect(container.querySelector('[data-nodeid="2"]')).not.toBeNull()

    flow.removeNode('1')
    await flush()
    expect(container.querySelectorAll('[data-nodeid]')).toHaveLength(1)
    expect(container.querySelector('[data-nodeid="1"]')).toBeNull()
    unmount()
  })

  it('removing a node also removes its incident edges', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()
    expect(flow.edges()).toHaveLength(1)
    expect(container.querySelector('svg.pyreon-flow-edges path')).not.toBeNull()

    flow.removeNode('2')
    await flush()
    expect(flow.edges()).toHaveLength(0)
    expect(container.querySelector('svg.pyreon-flow-edges path')).toBeNull()
    unmount()
  })

  it('zoom changes viewport and survives bounds (clamp to min/max)', async () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
      minZoom: 0.5,
      maxZoom: 2,
    })
    const { unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    expect(flow.viewport().zoom).toBe(1)
    flow.zoomTo(0.1)
    expect(flow.viewport().zoom).toBe(0.5) // clamped to minZoom
    flow.zoomTo(100)
    expect(flow.viewport().zoom).toBe(2) // clamped to maxZoom
    flow.zoomTo(1.5)
    expect(flow.viewport().zoom).toBe(1.5)
    unmount()
  })

  it('toJSON / fromJSON round-trips graph state', async () => {
    const flow1 = createFlow({
      nodes: [
        { id: 'a', position: { x: 10, y: 20 }, data: { label: 'A' } },
        { id: 'b', position: { x: 30, y: 40 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b' }],
    })
    const json = flow1.toJSON()
    const flow2 = createFlow()
    flow2.fromJSON(json)
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow2 }))
    await flush()

    expect(flow2.nodes().map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(flow2.edges().map((e) => e.id)).toEqual(['e'])
    expect(container.querySelectorAll('[data-nodeid]')).toHaveLength(2)
    unmount()
  })

  it('renders an SVG path between two connected nodes', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 200, y: 100 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    const svg = container.querySelector('svg.pyreon-flow-edges')
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    const path = svg?.querySelector('path')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('d')).toBeTruthy()
    unmount()
  })

  it('renders custom node types via nodeTypes registry', async () => {
    const CustomNode = (props: { id: string; data: () => { label: string } }) =>
      h('div', { 'data-custom': props.id, class: 'custom-node' }, () => props.data().label)

    const flow = createFlow({
      nodes: [
        { id: 'c1', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'CUSTOM' } },
      ],
    })
    const { container, unmount } = mountInBrowser(
      h(Flow, { instance: flow, nodeTypes: { custom: CustomNode } }),
    )
    await flush()

    const customEl = container.querySelector<HTMLElement>('[data-custom="c1"]')
    expect(customEl).not.toBeNull()
    expect(customEl?.textContent).toBe('CUSTOM')
    unmount()
  })
})
