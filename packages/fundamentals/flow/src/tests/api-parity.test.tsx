/**
 * React Flow API parity (W3 of the 2026-09 flow audit): batch mutations,
 * viewport helpers + screen↔flow conversion, `hidden` / `deletable`, the
 * `isValidConnection` veto + `connectionRadius` snap, automatic history, and
 * the extended listener surface. Bisect notes inline.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Flow } from '../components/flow-component'
import { Handle } from '../components/handle'
import { createFlow } from '../flow'
import type { FlowConfig, NodeComponentProps } from '../types'

function make(config: Partial<FlowConfig> = {}) {
  return createFlow({
    nodes: [
      { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
      { id: 'b', position: { x: 300, y: 0 }, data: { label: 'B' } },
      { id: 'c', position: { x: 600, y: 0 }, data: { label: 'C' } },
    ],
    edges: [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'bc', source: 'b', target: 'c' },
    ],
    ...config,
  })
}

function pev(type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  const Ctor = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent
  return new Ctor(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    isPrimary: true,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    buttons: type === 'pointerup' ? 0 : 1,
    ...extra,
  } as PointerEventInit)
}

describe('flow API parity', () => {
  let cleanups: Array<() => void> = []
  beforeEach(() => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>
    if (typeof proto.setPointerCapture !== 'function') proto.setPointerCapture = () => {}
    if (typeof proto.releasePointerCapture !== 'function') proto.releasePointerCapture = () => {}
  })
  afterEach(() => {
    for (const c of cleanups) c()
    cleanups = []
  })
  function mount(flow: ReturnType<typeof make>, props: Record<string, unknown> = {}) {
    const r = mountReactive(h(Flow, { instance: flow, ...props }))
    cleanups.push(r.cleanup, () => flow.dispose())
    return r.container
  }

  // ── Batch mutations ───────────────────────────────────────────────────────

  it('addNodes skips duplicate ids; setNodes prunes edges + selection to survivors', () => {
    const flow = make()
    flow.addNodes([
      { id: 'd', position: { x: 0, y: 100 }, data: {} },
      { id: 'a', position: { x: 9, y: 9 }, data: {} },
      { id: 'd', position: { x: 1, y: 1 }, data: {} },
    ])
    expect(flow.getNodes().map((n) => n.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(flow.getNode('a')!.position).toEqual({ x: 0, y: 0 })
    flow.selectNode('c')
    flow.selectEdge('bc', true)
    flow.setNodes((ns) => ns.filter((n) => n.id !== 'c'))
    expect(flow.getEdges().map((e) => e.id)).toEqual(['ab'])
    expect(flow.selectedNodes()).toEqual([])
    expect(flow.selectedEdges()).toEqual([])
    flow.dispose()
  })

  it('removeNodes drops connected edges and emits onNodesDelete / onEdgesDelete once', () => {
    // Bisect: revert `removeNode` to its inline body → the delete listeners never fire.
    const flow = make()
    const nodesDeleted = vi.fn()
    const edgesDeleted = vi.fn()
    const changes = vi.fn()
    flow.onNodesDelete(nodesDeleted)
    flow.onEdgesDelete(edgesDeleted)
    flow.onEdgesChange(changes)
    flow.removeNodes(['b'])
    expect(flow.getNodes().map((n) => n.id)).toEqual(['a', 'c'])
    expect(flow.getEdges()).toEqual([])
    expect(nodesDeleted).toHaveBeenCalledTimes(1)
    expect(nodesDeleted.mock.calls[0]![0].map((n: { id: string }) => n.id)).toEqual(['b'])
    expect(edgesDeleted).toHaveBeenCalledTimes(1)
    expect(edgesDeleted.mock.calls[0]![0].map((e: { id: string }) => e.id)).toEqual(['ab', 'bc'])
    expect(changes.mock.calls[0]![0]).toEqual([
      { type: 'remove', id: 'ab' },
      { type: 'remove', id: 'bc' },
    ])
    flow.dispose()
  })

  it('addEdges normalises, dedupes, emits add changes + connect; setEdges/updateEdge/removeEdges', () => {
    const flow = make()
    const connect = vi.fn()
    const changes = vi.fn()
    flow.onConnect(connect)
    flow.onEdgesChange(changes)
    flow.addEdges([
      { source: 'a', target: 'c' },
      { id: 'ab', source: 'a', target: 'b' },
    ])
    expect(flow.getEdges()).toHaveLength(3)
    const ac = flow.getEdges()[2]!
    expect(ac.id).toBeTruthy()
    expect(ac.type).toBe('bezier')
    expect(connect).toHaveBeenCalledTimes(1)
    expect(changes).toHaveBeenLastCalledWith([{ type: 'add', edge: ac }])
    flow.updateEdge('ab', { label: 'hello' })
    expect(flow.getEdge('ab')!.label).toBe('hello')
    flow.selectEdge('ab')
    flow.setEdges([{ id: 'x', source: 'c', target: 'a' }])
    expect(flow.getEdges().map((e) => e.id)).toEqual(['x'])
    expect(flow.selectedEdges()).toEqual([])
    flow.removeEdges(['x', 'nope'])
    expect(flow.getEdges()).toEqual([])
    flow.dispose()
  })

  it('updateNodeData merges (object and function form)', () => {
    const flow = make()
    flow.updateNodeData('a', { extra: 1 })
    expect(flow.getNode('a')!.data).toEqual({ label: 'A', extra: 1 })
    flow.updateNodeData('a', (n) => ({ label: `${n.data.label}!` }))
    expect(flow.getNode('a')!.data).toEqual({ label: 'A!', extra: 1 })
    flow.dispose()
  })

  // ── Viewport ──────────────────────────────────────────────────────────────

  it('setViewport / setCenter / getViewport; zoomTo with a duration animates and a plain write cancels it', () => {
    // Bisect: drop the `_caf` cancel in setViewport → the animation frame
    // later overwrites the plain write.
    const g = globalThis as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown }
    const orig = g.requestAnimationFrame
    const origCancel = g.cancelAnimationFrame
    const frames: FrameRequestCallback[] = []
    const cancelled: number[] = []
    g.requestAnimationFrame = (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    }
    g.cancelAnimationFrame = (id: number) => {
      cancelled.push(id)
    }
    try {
      const flow = make({ reducedMotion: false } as never)
      flow.containerSize.set({ width: 800, height: 600 })
      flow.setViewport({ x: 10 })
      expect(flow.getViewport()).toEqual({ x: 10, y: 0, zoom: 1 })
      flow.setCenter(100, 50, { zoom: 2 })
      expect(flow.getViewport()).toEqual({ x: -200 + 400, y: -100 + 300, zoom: 2 })
      flow.zoomTo(1, { duration: 300 })
      expect(frames).toHaveLength(1)
      expect(flow.getViewport().zoom).toBe(2) // not yet — animating
      flow.setViewport({ zoom: 3 })
      expect(flow.getViewport().zoom).toBe(3)
      expect(cancelled).toEqual([1]) // the pending animation frame was cancelled
      flow.dispose()
    } finally {
      g.requestAnimationFrame = orig
      g.cancelAnimationFrame = origCancel
    }
  })

  it('screenToFlowPosition / flowToScreenPosition round-trip through the mounted container rect', () => {
    // Bisect: drop `instance._setContainer(el)` in containerRef → the origin
    // stays {0,0} and the first expectation reads {x: 150, y: 90}.
    const flow = make()
    const c = mount(flow)
    const canvas = c.querySelector<HTMLElement>('.pyreon-flow')!
    canvas.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 800, height: 600, right: 900, bottom: 650, x: 100, y: 50 }) as DOMRect
    flow.setViewport({ x: 20, y: 10, zoom: 2 })
    expect(flow.screenToFlowPosition({ x: 160, y: 100 })).toEqual({ x: 20, y: 20 })
    expect(flow.flowToScreenPosition({ x: 20, y: 20 })).toEqual({ x: 160, y: 100 })
  })

  // ── hidden / deletable ────────────────────────────────────────────────────

  it('hidden nodes and edges (and edges into hidden nodes) are not rendered but stay in the graph', () => {
    // Bisect: drop the hidden filters in visibleNodeList/visibleEdgeList → 3 nodes, 2 edges render.
    const flow = make()
    const c = mount(flow)
    expect(c.querySelectorAll('.pyreon-flow-node')).toHaveLength(3)
    expect(c.querySelectorAll('svg.pyreon-flow-edges g > path:not(.pyreon-flow-edge-interaction)')).toHaveLength(2)
    flow.updateNode('b', { hidden: true })
    expect(c.querySelectorAll('.pyreon-flow-node')).toHaveLength(2)
    expect(c.querySelectorAll('svg.pyreon-flow-edges g > path:not(.pyreon-flow-edge-interaction)')).toHaveLength(0)
    expect(flow.getNodes()).toHaveLength(3)
    expect(flow.getEdges()).toHaveLength(2)
    flow.updateNode('b', { hidden: false })
    flow.updateEdge('ab', { hidden: true })
    expect(c.querySelectorAll('.pyreon-flow-node')).toHaveLength(3)
    expect(c.querySelectorAll('svg.pyreon-flow-edges g > path:not(.pyreon-flow-edge-interaction)')).toHaveLength(1)
  })

  it('deletable:false / nodesDeletable:false exempt elements from deleteSelected (they stay selected)', () => {
    // Bisect: revert deleteSelected to the unconditional filter → 'b' is deleted.
    const flow = make()
    flow.updateNode('b', { deletable: false })
    flow.updateEdge('bc', { deletable: false })
    flow.selectNodes(['a', 'b'])
    flow.selectEdge('bc', true)
    flow.deleteSelected()
    expect(flow.getNodes().map((n) => n.id)).toEqual(['b', 'c'])
    // 'ab' went with 'a' (no endpoint); 'bc' survived on its own flag.
    expect(flow.getEdges().map((e) => e.id)).toEqual(['bc'])
    expect(flow.selectedNodes()).toEqual(['b'])
    expect(flow.selectedEdges()).toEqual(['bc'])
    flow.dispose()
    const locked = make({ nodesDeletable: false })
    locked.selectAll()
    locked.deleteSelected()
    expect(locked.getNodes()).toHaveLength(3)
    locked.dispose()
  })

  // ── Connections ───────────────────────────────────────────────────────────

  it('config.isValidConnection vetoes before connectionRules', () => {
    const flow = make({ isValidConnection: (c) => c.target !== 'c' })
    expect(flow.isValidConnection({ source: 'a', target: 'b' })).toBe(true)
    expect(flow.isValidConnection({ source: 'a', target: 'c' })).toBe(false)
    flow.dispose()
  })

  function HandledNode(props: NodeComponentProps) {
    return h('div', { style: 'position: relative; width: 150px; height: 40px;' }, [
      h(Handle, { type: 'target', position: 'left' as never }),
      h('span', {}, () => props.id),
      h(Handle, { type: 'source', position: 'right' as never }),
    ])
  }

  it('connectionRadius snaps a near-miss drop to the closest target handle; onConnectStart/End fire', () => {
    // Bisect: drop the `connectionRadius` branch in handlePointerUp → no
    // edge, connectEnd(null).
    const doc = document as unknown as { elementFromPoint?: unknown }
    const origEfp = doc.elementFromPoint
    doc.elementFromPoint = () => null
    try {
      const flow = createFlow({
        nodes: [
          { id: 'a', type: 'h', position: { x: 0, y: 0 }, data: {} },
          { id: 'b', type: 'h', position: { x: 300, y: 0 }, data: {} },
        ],
        connectionRadius: 20,
      })
      const started = vi.fn()
      const ended = vi.fn()
      flow.onConnectStart(started)
      flow.onConnectEnd(ended)
      const c = mount(flow, { nodeTypes: { h: HandledNode } })
      const canvas = c.querySelector<HTMLElement>('.pyreon-flow')!
      const src = c.querySelector<HTMLElement>('[data-nodeid="a"] .pyreon-flow-handle-source')!
      expect(src).toBeTruthy()
      src.dispatchEvent(pev('pointerdown', 150, 20))
      expect(started).toHaveBeenCalledWith({ nodeId: 'a', handleId: 'source' })
      // b's default target anchor is its left-middle (300, 20); drop 7px away.
      canvas.dispatchEvent(pev('pointermove', 305, 25))
      canvas.dispatchEvent(pev('pointerup', 305, 25))
      expect(flow.getEdges()).toHaveLength(1)
      expect(flow.getEdges()[0]).toMatchObject({ source: 'a', target: 'b', targetHandle: 'target' })
      expect(ended).toHaveBeenCalledWith({
        source: 'a',
        target: 'b',
        sourceHandle: 'source',
        targetHandle: 'target',
      })
      // Beyond the radius: nothing connects, connectEnd(null).
      src.dispatchEvent(pev('pointerdown', 150, 20))
      canvas.dispatchEvent(pev('pointerup', 340, 25))
      expect(flow.getEdges()).toHaveLength(1)
      expect(ended).toHaveBeenLastCalledWith(null)
    } finally {
      doc.elementFromPoint = origEfp
    }
  })

  // ── History ───────────────────────────────────────────────────────────────

  it('mutations checkpoint automatically; a manual pushHistory before one does not double-record', () => {
    // Bisect: drop `checkpoint()` from addNode → undo restores nothing.
    const flow = make()
    flow.addNode({ id: 'd', position: { x: 0, y: 0 }, data: {} })
    expect(flow.getNodes()).toHaveLength(4)
    flow.undo()
    expect(flow.getNodes()).toHaveLength(3)
    flow.redo()
    expect(flow.getNodes()).toHaveLength(4)
    // Delete-key path: explicit push + auto checkpoint = ONE entry.
    flow.selectNode('d')
    flow.pushHistory()
    flow.deleteSelected()
    expect(flow.getNodes()).toHaveLength(3)
    flow.undo()
    expect(flow.getNodes()).toHaveLength(4)
    flow.undo()
    expect(flow.getNodes()).toHaveLength(3) // back past the add, not a duplicate snapshot
    flow.dispose()
    const manual = make({ autoHistory: false })
    manual.addNode({ id: 'd', position: { x: 0, y: 0 }, data: {} })
    manual.undo()
    expect(manual.getNodes()).toHaveLength(4)
    manual.dispose()
  })

  // ── Listeners ─────────────────────────────────────────────────────────────

  it('onSelectionChange fires with node/edge objects after changes, not at creation; onViewportChange on writes', () => {
    const flow = make()
    const sel = vi.fn()
    const vp = vi.fn()
    flow.onSelectionChange(sel)
    flow.onViewportChange(vp)
    expect(sel).not.toHaveBeenCalled()
    flow.selectNode('a')
    expect(sel).toHaveBeenCalledTimes(2) // node set + edge set both written by selectNode
    expect(sel.mock.calls.at(-1)![0].nodes.map((n: { id: string }) => n.id)).toEqual(['a'])
    flow.selectEdge('ab', true)
    expect(sel.mock.calls.at(-1)![0].edges.map((e: { id: string }) => e.id)).toEqual(['ab'])
    flow.setViewport({ x: 5 })
    expect(vp).toHaveBeenCalledWith({ x: 5, y: 0, zoom: 1 })
    const unsub = flow.onViewportChange(vp)
    unsub()
    flow.dispose()
    flow.setViewport({ x: 6 })
    expect(vp).toHaveBeenCalledTimes(1) // disposed: subscriptions gone
  })

  it('onNodeDrag fires per drag frame with live state; onPaneClick only for the empty canvas', () => {
    // Bisect: drop the `_emit.nodeDrag` line in handlePointerMove → 0 calls.
    const flow = make()
    const drag = vi.fn()
    const pane = vi.fn()
    flow.onNodeDrag(drag)
    flow.onPaneClick(pane)
    const c = mount(flow)
    const canvas = c.querySelector<HTMLElement>('.pyreon-flow')!
    const a = c.querySelector<HTMLElement>('[data-nodeid="a"]')!
    a.dispatchEvent(pev('pointerdown', 10, 10))
    canvas.dispatchEvent(pev('pointermove', 20, 15))
    canvas.dispatchEvent(pev('pointermove', 30, 20))
    canvas.dispatchEvent(pev('pointerup', 30, 20))
    expect(drag).toHaveBeenCalledTimes(2)
    expect(drag.mock.calls[1]![0].position).toEqual({ x: 20, y: 10 })
    a.click()
    expect(pane).not.toHaveBeenCalled()
    canvas.click()
    expect(pane).toHaveBeenCalledTimes(1)
  })
})
