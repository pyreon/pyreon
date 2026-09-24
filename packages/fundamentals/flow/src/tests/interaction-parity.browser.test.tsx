/**
 * Real-Chromium half of the interaction-parity suite: the invisible hit
 * width is only meaningful against real hit testing (`elementFromPoint`),
 * a reconnect drag needs real handle geometry, and shift+wheel needs a
 * WheelEvent that keeps its modifier.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { Handle } from '../components/handle'
import { BaseEdge, ViewportPortal } from '../components/edge-base'
import { getStraightPath } from '../edges'
import type { EdgeComponentProps } from '../components/flow-component'
import { createFlow } from '../flow'
import type { NodeComponentProps } from '../types'

function HandledNode(props: NodeComponentProps) {
  return h('div', { style: 'position: relative; width: 150px; height: 40px; background: #eee;' }, [
    h(Handle, { type: 'target', position: 'left' as never }),
    h('span', {}, () => props.id),
    h(Handle, { type: 'source', position: 'right' as never }),
  ])
}

function pev(type: string, x: number, y: number) {
  return new PointerEvent(type, {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    bubbles: true,
    cancelable: true,
  })
}

describe('flow interaction parity in real browser', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function setup(config: Record<string, unknown> = {}) {
    const flow = createFlow({
      nodes: [
        { id: 'a', type: 'h', position: { x: 20, y: 20 }, data: {} },
        { id: 'b', type: 'h', position: { x: 320, y: 20 }, data: {} },
        { id: 'c', type: 'h', position: { x: 320, y: 220 }, data: {} },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b', type: 'straight', sourceHandle: 'source', targetHandle: 'target' }],
      ...config,
    })
    const mounted = mountInBrowser(
      h(
        'div',
        { style: 'width: 800px; height: 600px; position: relative;' },
        h(Flow, { instance: flow, nodeTypes: { h: HandledNode } }),
      ),
    )
    flow.containerSize.set({ width: 800, height: 600 })
    return { flow, ...mounted }
  }

  it('a click 8px off a hairline edge lands on its interaction path and selects the edge', async () => {
    // Bisect: remove the interaction path → elementFromPoint returns the
    // canvas and the edge stays unselected.
    const { flow, container, unmount } = setup()
    await flush()
    const visible = container.querySelector<SVGPathElement>('svg.pyreon-flow-edges g > path')!
    const box = visible.getBoundingClientRect()
    const midX = box.left + box.width / 2
    const midY = box.top + box.height / 2
    const hit = document.elementFromPoint(midX, midY + 8)!
    expect(hit.classList.contains('pyreon-flow-edge-interaction')).toBe(true)
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: midX, clientY: midY + 8 }))
    expect(flow.selectedEdges()).toEqual(['ab'])
    unmount()
  })

  it('dragging the target updater onto another node handle reconnects the edge with real geometry', async () => {
    const { flow, container, unmount } = setup()
    await flush()
    flow.selectEdge('ab')
    await flush()
    const updater = container.querySelector<SVGCircleElement>('.pyreon-flow-edge-updater-target')!
    expect(updater).toBeTruthy()
    const u = updater.getBoundingClientRect()
    const cHandle = container.querySelector<HTMLElement>('[data-nodeid="c"] .pyreon-flow-handle-target')!
    const t = cHandle.getBoundingClientRect()
    const tx = t.left + t.width / 2
    const ty = t.top + t.height / 2
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    updater.dispatchEvent(pev('pointerdown', u.left + u.width / 2, u.top + u.height / 2))
    canvas.dispatchEvent(pev('pointermove', tx, ty))
    expect(container.querySelector('.pyreon-flow-connection-line')).toBeTruthy()
    canvas.dispatchEvent(pev('pointerup', tx, ty))
    await flush()
    expect(flow.getEdge('ab')).toMatchObject({ source: 'a', target: 'c', targetHandle: 'target' })
    expect(flow.edges()).toHaveLength(1)
    unmount()
  })

  // connectionMode (React Flow semantics). Each spec drags between two real
  // handles and drops with elementFromPoint doing the hit test.
  function dragHandle(container: HTMLElement, from: string, to: string) {
    const start = container.querySelector<HTMLElement>(from)!
    const end = container.querySelector<HTMLElement>(to)!
    const s = start.getBoundingClientRect()
    const t = end.getBoundingClientRect()
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    start.dispatchEvent(pev('pointerdown', s.left + s.width / 2, s.top + s.height / 2))
    canvas.dispatchEvent(pev('pointermove', t.left + t.width / 2, t.top + t.height / 2))
    canvas.dispatchEvent(pev('pointerup', t.left + t.width / 2, t.top + t.height / 2))
  }

  it('strict (default): a source handle connects to a target handle', async () => {
    const { flow, container, unmount } = setup({ edges: [] })
    await flush()
    dragHandle(container, '[data-nodeid="a"] .pyreon-flow-handle-source', '[data-nodeid="c"] .pyreon-flow-handle-target')
    await flush()
    expect(flow.edges().map((e) => [e.source, e.target, e.sourceHandle, e.targetHandle])).toEqual([['a', 'c', 'source', 'target']])
    unmount()
  })

  it('strict: a handle dropped on a handle of the SAME type does not connect', async () => {
    // Bisect: without the type check the drop is accepted and an a -> c edge appears.
    const { flow, container, unmount } = setup({ edges: [] })
    await flush()
    // Same-type pair, both on screen: a's target dropped on c's target.
    dragHandle(container, '[data-nodeid="a"] .pyreon-flow-handle-target', '[data-nodeid="c"] .pyreon-flow-handle-target')
    await flush()
    expect(flow.edges()).toEqual([])
    unmount()
  })

  it('strict: a drag started at a TARGET handle still yields a source -> target edge', async () => {
    // Bisect: without the flip the edge is c -> a, from c's target handle.
    const { flow, container, unmount } = setup({ edges: [] })
    await flush()
    dragHandle(container, '[data-nodeid="c"] .pyreon-flow-handle-target', '[data-nodeid="a"] .pyreon-flow-handle-source')
    await flush()
    expect(flow.edges().map((e) => [e.source, e.target, e.sourceHandle, e.targetHandle])).toEqual([['a', 'c', 'source', 'target']])
    unmount()
  })

  it('loose: any handle connects to any handle, oriented from where the drag started', async () => {
    const { flow, container, unmount } = setup({ edges: [], connectionMode: 'loose' })
    await flush()
    // Two TARGET handles (strict would refuse this pair; both are inside the
    // test viewport, which a source handle on the right of c is not).
    dragHandle(container, '[data-nodeid="a"] .pyreon-flow-handle-target', '[data-nodeid="c"] .pyreon-flow-handle-target')
    await flush()
    expect(flow.edges().map((e) => [e.source, e.target, e.sourceHandle, e.targetHandle])).toEqual([['a', 'c', 'target', 'target']])
    unmount()
  })

  it('node zIndex and selection elevation reach the rendered z-index', async () => {
    const { flow, container, unmount } = setup({
      nodes: [
        { id: 'a', type: 'h', position: { x: 20, y: 20 }, data: {}, zIndex: 5 },
        { id: 'b', type: 'h', position: { x: 320, y: 20 }, data: {} },
      ],
      edges: [],
    })
    await flush()
    const z = (id: string) => getComputedStyle(container.querySelector<HTMLElement>(`[data-nodeid="${id}"]`)!).zIndex
    expect(z('a')).toBe('5')
    flow.selectNode('b')
    await flush()
    expect(z('b')).toBe('100')
    unmount()
  })

  it('edges draw in zIndex order, and elevateEdgesOnSelect puts the selected one last', async () => {
    const { flow, container, unmount } = setup({
      edges: [
        { id: 'ab', source: 'a', target: 'b', zIndex: 3 },
        { id: 'ac', source: 'a', target: 'c' },
        { id: 'bc', source: 'b', target: 'c' },
      ],
      elevateEdgesOnSelect: true,
    })
    await flush()
    // Each edge's focusable group is named "Edge from <source> to <target>".
    const order = () =>
      [...container.querySelectorAll('svg.pyreon-flow-edges [aria-label^="Edge from"]')].map((g) => {
        const m = /Edge from (\w+) to (\w+)/.exec(g.getAttribute('aria-label') ?? '')
        return m ? m[1]! + m[2]! : '?'
      })
    expect(order()).toEqual(['ac', 'bc', 'ab'])
    flow.selectEdge('ac')
    await flush()
    expect(order()).toEqual(['bc', 'ab', 'ac'])
    unmount()
  })

  const contextMenu = (el: Element, x = 0, y = 0) => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 })
    el.dispatchEvent(ev)
    return ev
  }

  it('right-click on a node fires onNodeContextMenu and suppresses the browser menu', async () => {
    const { flow, container, unmount } = setup()
    await flush()
    const node = container.querySelector('[data-nodeid="a"]')!
    // No listener: the browser keeps its own menu.
    expect(contextMenu(node).defaultPrevented).toBe(false)
    const seen: string[] = []
    flow.onNodeContextMenu((n) => seen.push(n.id))
    const ev = contextMenu(node)
    expect(seen).toEqual(['a'])
    expect(ev.defaultPrevented).toBe(true)
    unmount()
  })

  it('right-click on an edge fires onEdgeContextMenu, not the pane', async () => {
    const { flow, container, unmount } = setup()
    await flush()
    const edges: string[] = []
    let pane = 0
    flow.onEdgeContextMenu((e) => edges.push(e.id ?? ''))
    flow.onPaneContextMenu(() => pane++)
    contextMenu(container.querySelector('svg.pyreon-flow-edges .pyreon-flow-edge-interaction')!)
    expect(edges).toEqual(['ab'])
    expect(pane).toBe(0)
    unmount()
  })

  it('right-click on the empty canvas reports the FLOW position', async () => {
    const { flow, container, unmount } = setup()
    await flush()
    flow.setViewport({ x: 100, y: 50, zoom: 2 })
    await flush()
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    const r = canvas.getBoundingClientRect()
    const positions: { x: number; y: number }[] = []
    flow.onPaneContextMenu((p) => positions.push(p))
    // Screen (r.left + 300, r.top + 250) is flow ((300 - 100) / 2, (250 - 50) / 2).
    const ev = contextMenu(canvas, r.left + 300, r.top + 250)
    expect(positions).toEqual([{ x: 100, y: 100 }])
    expect(ev.defaultPrevented).toBe(true)
    unmount()
  })

  it('pointer enter and leave on nodes and edges fire the hover listeners', async () => {
    const { flow, container, unmount } = setup()
    await flush()
    const log: string[] = []
    flow.onNodeMouseEnter((n) => log.push(`enter ${n.id}`))
    flow.onNodeMouseLeave((n) => log.push(`leave ${n.id}`))
    flow.onEdgeMouseEnter((e) => log.push(`enter ${e.id}`))
    flow.onEdgeMouseLeave((e) => log.push(`leave ${e.id}`))
    const node = container.querySelector('[data-nodeid="a"]')!
    node.dispatchEvent(new MouseEvent('mouseenter'))
    node.dispatchEvent(new MouseEvent('mouseleave'))
    const edge = container.querySelector('svg.pyreon-flow-edges .pyreon-flow-edge-interaction')!
    edge.dispatchEvent(new MouseEvent('mouseenter'))
    edge.dispatchEvent(new MouseEvent('mouseleave'))
    expect(log).toEqual(['enter a', 'leave a', 'enter ab', 'leave ab'])
    unmount()
  })

  const frames = (n: number) => new Promise<void>((resolve) => {
    const step = (i: number) => (i === 0 ? resolve() : requestAnimationFrame(() => step(i - 1)))
    step(n)
  })

  it('a node dragged to the edge and held there auto-pans, and stays under the pointer', async () => {
    const { flow, container, unmount } = setup({ edges: [] })
    await flush()
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    const r = canvas.getBoundingClientRect()
    const node = container.querySelector<HTMLElement>('[data-nodeid="a"]')!
    const n = node.getBoundingClientRect()
    node.dispatchEvent(pev('pointerdown', n.left + 10, n.top + 10))
    // Hold still 5px from the right edge of the container.
    canvas.dispatchEvent(pev('pointermove', r.right - 5, n.top + 10))
    const x0 = flow.getNode('a')!.position.x
    await frames(12)
    expect(flow.viewport().x).toBeLessThan(-20)
    // The node kept moving right in flow coordinates by the same amount.
    expect(flow.getNode('a')!.position.x - x0).toBeCloseTo(-flow.viewport().x, 5)
    canvas.dispatchEvent(pev('pointerup', r.right - 5, n.top + 10))
    const settled = flow.viewport().x
    await frames(4)
    expect(flow.viewport().x).toBe(settled)
    unmount()
  })

  it('autoPanOnNodeDrag: false leaves the viewport where it is', async () => {
    const { flow, container, unmount } = setup({ edges: [], autoPanOnNodeDrag: false })
    await flush()
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    const r = canvas.getBoundingClientRect()
    const node = container.querySelector<HTMLElement>('[data-nodeid="a"]')!
    const n = node.getBoundingClientRect()
    node.dispatchEvent(pev('pointerdown', n.left + 10, n.top + 10))
    canvas.dispatchEvent(pev('pointermove', r.right - 5, n.top + 10))
    await frames(12)
    expect(flow.viewport().x).toBe(0)
    canvas.dispatchEvent(pev('pointerup', r.right - 5, n.top + 10))
    unmount()
  })

  it('a connection dragged to the edge auto-pans', async () => {
    const { flow, container, unmount } = setup({ edges: [] })
    await flush()
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    const r = canvas.getBoundingClientRect()
    const handle = container.querySelector<HTMLElement>('[data-nodeid="a"] .pyreon-flow-handle-source')!
    const h = handle.getBoundingClientRect()
    handle.dispatchEvent(pev('pointerdown', h.left + h.width / 2, h.top + h.height / 2))
    canvas.dispatchEvent(pev('pointermove', r.left + 400, r.bottom - 5))
    await frames(12)
    expect(flow.viewport().y).toBeLessThan(-20)
    canvas.dispatchEvent(pev('pointerup', r.left + 400, r.bottom - 5))
    unmount()
  })

  it('BaseEdge draws the stroke and an EdgeText label; ViewportPortal renders in the viewport layer', async () => {
    function Wire(props: EdgeComponentProps) {
      const geo = () => getStraightPath({ sourceX: props.sourceX(), sourceY: props.sourceY(), targetX: props.targetX(), targetY: props.targetY() })
      return h(BaseEdge, { path: geo().path, label: 'wire', labelX: geo().labelX, labelY: geo().labelY, style: 'stroke: #16a34a; stroke-width: 3px' })
    }
    const flow = createFlow({
      nodes: [
        { id: 'a', type: 'h', position: { x: 20, y: 20 }, data: {} },
        { id: 'b', type: 'h', position: { x: 320, y: 20 }, data: {} },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b', type: 'wire' }],
    })
    const { container, unmount } = mountInBrowser(
      h('div', { style: 'width: 800px; height: 600px; position: relative;' },
        h(Flow, { instance: flow, nodeTypes: { h: HandledNode }, edgeTypes: { wire: Wire } },
          h(ViewportPortal, {}, h('div', { class: 'portal-marker' }, 'in viewport')))),
    )
    flow.containerSize.set({ width: 800, height: 600 })
    await flush()
    const stroke = container.querySelector<SVGPathElement>('path.pyreon-flow-edge-path')!
    expect(stroke).toBeTruthy()
    expect(stroke.getAttribute('d')).toMatch(/^M/)
    expect(getComputedStyle(stroke).stroke).toBe('rgb(22, 163, 74)')
    const text = container.querySelector<SVGTextElement>('text.pyreon-flow-edge-text')!
    expect(text.textContent).toBe('wire')
    expect(text instanceof SVGTextElement).toBe(true)
    // The portal lands inside the pan/zoom viewport, so it moves with the graph.
    const marker = container.querySelector('.portal-marker')!
    expect(marker.closest('.pyreon-flow-viewport')).toBeTruthy()
    unmount()
  })

  it('shift+wheel pans horizontally under panOnScroll', async () => {
    const { flow, container, unmount } = setup({ panOnScroll: true, panOnScrollSpeed: 1 })
    await flush()
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 25, shiftKey: true, bubbles: true, cancelable: true }))
    expect(flow.viewport()).toEqual({ x: -25, y: 0, zoom: 1 })
    // ctrl+wheel keeps zooming under panOnScroll (zoomActivationKey).
    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: 0, clientY: 0, bubbles: true, cancelable: true }),
    )
    expect(flow.viewport().zoom).toBeCloseTo(1.1, 5)
    unmount()
  })
})
