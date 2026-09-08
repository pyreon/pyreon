/**
 * React Flow interaction parity (W4 of the 2026-09 flow audit): edge hit
 * width, endpoint reconnection by drag, the custom connection line, the
 * pan/zoom option set, configurable keys and selection modes. Real-pointer
 * geometry lives in interaction-parity.browser.test.tsx.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { Handle } from '../components/handle'
import { createFlow } from '../flow'
import type { ConnectionLineProps, FlowConfig, NodeComponentProps } from '../types'

function make(config: Partial<FlowConfig> = {}) {
  return createFlow({
    nodes: [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 300, y: 0 }, data: {} },
      { id: 'c', position: { x: 600, y: 0 }, data: {} },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b' }],
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
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    ...extra,
  } as PointerEventInit)
}
function wheel(el: Element, init: WheelEventInit) {
  const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 100, clientY: 100, ...init })
  el.dispatchEvent(ev)
  return ev
}
function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
}

function HandledNode(props: NodeComponentProps) {
  return h('div', { style: 'position: relative; width: 150px; height: 40px;' }, [
    h(Handle, { type: 'target', position: 'left' as never }),
    h('span', {}, () => props.id),
    h(Handle, { type: 'source', position: 'right' as never }),
  ])
}

describe('flow interaction parity', () => {
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
  const canvasOf = (c: Element) => c.querySelector<HTMLElement>('.pyreon-flow')!

  // ── Edge hit width ────────────────────────────────────────────────────────

  it('every edge carries an invisible interaction path (20px default, per-edge and config overrides); clicking it selects', () => {
    // Bisect: drop `edgeChrome` from the built-in edge <g> → no interaction path.
    const flow = make({ edgeInteractionWidth: 8 })
    flow.addEdge({ id: 'bc', source: 'b', target: 'c', interactionWidth: 40 })
    const c = mount(flow)
    const hits = [...c.querySelectorAll<SVGPathElement>('path.pyreon-flow-edge-interaction')]
    expect(hits).toHaveLength(2)
    expect(hits[0]!.getAttribute('style')).toContain('stroke-width: 8px')
    expect(hits[1]!.getAttribute('style')).toContain('stroke-width: 40px')
    expect(hits[0]!.getAttribute('style')).toContain('stroke: transparent')
    expect(hits[0]!.getAttribute('d')).toBe(
      c.querySelector('svg.pyreon-flow-edges g > path')!.getAttribute('d'),
    )
    hits[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(flow.selectedEdges()).toEqual(['bc'])
    const def = mount(make())
    expect(def.querySelector('path.pyreon-flow-edge-interaction')!.getAttribute('style')).toContain(
      'stroke-width: 20px',
    )
  })

  // ── Reconnect ─────────────────────────────────────────────────────────────

  it('a selected reconnectable edge shows endpoint updaters; dragging the target updater onto another handle reconnects it', () => {
    // Bisect: drop the `conn.reconnect` branch in handlePointerUp → the drop
    // adds a NEW edge a→c and leaves ab untouched.
    const doc = document as unknown as { elementFromPoint?: unknown }
    const orig = doc.elementFromPoint
    try {
      const flow = createFlow({
        nodes: [
          { id: 'a', type: 'h', position: { x: 0, y: 0 }, data: {} },
          { id: 'b', type: 'h', position: { x: 300, y: 0 }, data: {} },
          { id: 'c', type: 'h', position: { x: 600, y: 0 }, data: {} },
        ],
        edges: [{ id: 'ab', source: 'a', target: 'b', sourceHandle: 'source', targetHandle: 'target' }],
      })
      const c = mount(flow, { nodeTypes: { h: HandledNode } })
      expect(c.querySelector('.pyreon-flow-edge-updater')).toBeNull()
      flow.selectEdge('ab')
      const updaters = c.querySelectorAll<SVGCircleElement>('.pyreon-flow-edge-updater')
      expect(updaters).toHaveLength(2)
      const target = c.querySelector<SVGCircleElement>('.pyreon-flow-edge-updater-target')!
      expect(Number(target.getAttribute('cx'))).toBe(300)
      const cHandle = c.querySelector<HTMLElement>('[data-nodeid="c"] .pyreon-flow-handle-target')!
      doc.elementFromPoint = () => cHandle
      const canvas = canvasOf(c)
      target.dispatchEvent(pev('pointerdown', 300, 20))
      canvas.dispatchEvent(pev('pointermove', 600, 20))
      canvas.dispatchEvent(pev('pointerup', 600, 20))
      expect(flow.getEdge('ab')).toMatchObject({ source: 'a', target: 'c', targetHandle: 'target' })
      expect(flow.edges()).toHaveLength(1)
      // Source end: fixed end is the target.
      const src = c.querySelector<SVGCircleElement>('.pyreon-flow-edge-updater-source')!
      const bHandle = c.querySelector<HTMLElement>('[data-nodeid="b"] .pyreon-flow-handle-source')!
      doc.elementFromPoint = () => bHandle
      src.dispatchEvent(pev('pointerdown', 150, 20))
      canvas.dispatchEvent(pev('pointerup', 450, 20))
      expect(flow.getEdge('ab')).toMatchObject({ source: 'b', target: 'c' })
      // Dropped nowhere: unchanged.
      doc.elementFromPoint = () => null
      src.dispatchEvent(pev('pointerdown', 450, 20))
      canvas.dispatchEvent(pev('pointerup', 900, 900))
      expect(flow.getEdge('ab')).toMatchObject({ source: 'b', target: 'c' })
      expect(flow.edges()).toHaveLength(1)
    } finally {
      doc.elementFromPoint = orig
    }
  })

  it('reconnectable:false / edgesReconnectable:false render no updaters', () => {
    const flow = make({ edges: [{ id: 'ab', source: 'a', target: 'b', reconnectable: false }] })
    const c = mount(flow)
    flow.selectEdge('ab')
    expect(c.querySelector('.pyreon-flow-edge-updater')).toBeNull()
    const locked = make({ edgesReconnectable: false })
    const c2 = mount(locked)
    locked.selectEdge('ab')
    expect(c2.querySelector('.pyreon-flow-edge-updater')).toBeNull()
  })

  // ── Connection line ───────────────────────────────────────────────────────

  it('connectionLineType drives the built-in line; a custom connectionLine renders once and follows the pointer', () => {
    const flow = createFlow({
      nodes: [{ id: 'a', type: 'h', position: { x: 0, y: 0 }, data: {} }],
      connectionLineType: 'straight',
    })
    const c = mount(flow, { nodeTypes: { h: HandledNode } })
    const canvas = canvasOf(c)
    const src = c.querySelector<HTMLElement>('[data-nodeid="a"] .pyreon-flow-handle-source')!
    src.dispatchEvent(pev('pointerdown', 150, 20))
    canvas.dispatchEvent(pev('pointermove', 200, 50))
    const line = c.querySelector<SVGPathElement>('.pyreon-flow-connection-line')!
    expect(line.getAttribute('d')).toMatch(/^M150,20 ?L200,50$/)
    canvas.dispatchEvent(pev('pointermove', 210, 60))
    expect(c.querySelector('.pyreon-flow-connection-line')).toBe(line) // patched, not re-mounted
    expect(line.getAttribute('d')).toMatch(/L210,60$/)
    canvas.dispatchEvent(pev('pointerup', 210, 60))
    expect(c.querySelector('.pyreon-flow-connection-line')).toBeNull()

    let mounts = 0
    const Custom = (p: ConnectionLineProps) => {
      mounts++
      return h('path', { class: 'custom-line', d: () => p.path(), 'data-tx': () => String(p.targetX()) })
    }
    const c2 = mount(
      createFlow({ nodes: [{ id: 'a', type: 'h', position: { x: 0, y: 0 }, data: {} }] }),
      { nodeTypes: { h: HandledNode }, connectionLine: Custom },
    )
    const canvas2 = canvasOf(c2)
    c2.querySelector<HTMLElement>('[data-nodeid="a"] .pyreon-flow-handle-source')!.dispatchEvent(pev('pointerdown', 150, 20))
    canvas2.dispatchEvent(pev('pointermove', 200, 50))
    canvas2.dispatchEvent(pev('pointermove', 220, 50))
    const custom = c2.querySelector<SVGPathElement>('.custom-line')!
    expect(custom.getAttribute('data-tx')).toBe('220')
    expect(mounts).toBe(1)
    canvas2.dispatchEvent(pev('pointerup', 220, 50))
  })

  // ── Pan / zoom options ────────────────────────────────────────────────────

  it('panOnDrag: false disables panning; an array restricts it to those buttons', () => {
    // Bisect: revert handlePointerDown to the unconditional pan → viewport moves.
    const noPan = make({ panOnDrag: false })
    const c = mount(noPan)
    const canvas = canvasOf(c)
    canvas.dispatchEvent(pev('pointerdown', 10, 10))
    canvas.dispatchEvent(pev('pointermove', 60, 40))
    canvas.dispatchEvent(pev('pointerup', 60, 40))
    expect(noPan.viewport()).toEqual({ x: 0, y: 0, zoom: 1 })
    const middleOnly = make({ panOnDrag: [1] })
    const c2 = mount(middleOnly)
    const canvas2 = canvasOf(c2)
    canvas2.dispatchEvent(pev('pointerdown', 10, 10))
    canvas2.dispatchEvent(pev('pointermove', 60, 40))
    canvas2.dispatchEvent(pev('pointerup', 60, 40))
    expect(middleOnly.viewport()).toEqual({ x: 0, y: 0, zoom: 1 })
    canvas2.dispatchEvent(pev('pointerdown', 10, 10, { button: 1, buttons: 4 }))
    canvas2.dispatchEvent(pev('pointermove', 60, 40, { buttons: 4 }))
    canvas2.dispatchEvent(pev('pointerup', 60, 40, { button: 1 }))
    expect(middleOnly.viewport()).toEqual({ x: 50, y: 30, zoom: 1 })
  })

  it('panOnScroll pans (shift = horizontal), ctrl+wheel zooms; zoomOnScroll:false leaves the wheel alone', () => {
    const flow = make({ panOnScroll: true, panOnScrollSpeed: 1 })
    const canvas = canvasOf(mount(flow))
    expect(wheel(canvas, { deltaY: 40 }).defaultPrevented).toBe(true)
    expect(flow.viewport()).toEqual({ x: 0, y: -40, zoom: 1 })
    // A horizontal trackpad delta pans x (happy-dom's WheelEvent drops
    // `shiftKey`, so the shift+wheel remap is covered in the browser suite).
    wheel(canvas, { deltaX: 30, deltaY: 0 })
    expect(flow.viewport()).toEqual({ x: -30, y: -40, zoom: 1 })
    // ctrl+wheel → zoom is asserted in the browser suite (happy-dom's
    // WheelEvent drops modifier flags).
    const noZoom = make({ zoomOnScroll: false })
    const canvas2 = canvasOf(mount(noZoom))
    expect(wheel(canvas2, { deltaY: -100 }).defaultPrevented).toBe(false)
    expect(noZoom.viewport().zoom).toBe(1)
  })

  it('zoomOnDoubleClick zooms one step around the pointer on the empty canvas only (default off)', () => {
    const off = make()
    const c0 = canvasOf(mount(off))
    c0.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 0, clientY: 0 }))
    expect(off.viewport().zoom).toBe(1)
    const on = make({ zoomOnDoubleClick: true })
    const c = mount(on)
    c.querySelector('[data-nodeid="a"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(on.viewport().zoom).toBe(1)
    canvasOf(c).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 0, clientY: 0 }))
    expect(on.viewport().zoom).toBeCloseTo(1.2, 5)
  })

  // ── Keys + selection modes ────────────────────────────────────────────────

  it('deleteKeys configures (or disables) keyboard deletion', () => {
    const flow = make({ deleteKeys: ['x'] })
    const canvas = canvasOf(mount(flow))
    flow.selectNode('a')
    key(canvas, 'Delete')
    expect(flow.nodes()).toHaveLength(3)
    key(canvas, 'x')
    expect(flow.nodes()).toHaveLength(2)
    const none = make({ deleteKeys: null })
    const canvas2 = canvasOf(mount(none))
    none.selectNode('a')
    key(canvas2, 'Delete')
    key(canvas2, 'Backspace')
    expect(none.nodes()).toHaveLength(3)
  })

  it('multiSelectionKey changes the additive-click modifier', () => {
    const flow = make({ multiSelectionKey: 'meta' })
    const c = mount(flow)
    c.querySelector('[data-nodeid="a"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    c.querySelector('[data-nodeid="b"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
    expect(flow.selectedNodes()).toEqual(['b'])
    c.querySelector('[data-nodeid="a"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }))
    expect(flow.selectedNodes().sort()).toEqual(['a', 'b'])
  })

  it('selectionOnDrag boxes with a plain drag (middle button still pans with panOnDrag [1]); selectionMode full vs partial', () => {
    // Bisect: drop `selectionOnDrag` from the startsSelection rule → the
    // plain drag pans and nothing is selected.
    const partial = make({ selectionOnDrag: true, panOnDrag: [1] })
    const c = mount(partial)
    const canvas = canvasOf(c)
    // Box from (-10,-10) to (350, 60): covers a fully, b partially (b spans x 300..450).
    canvas.dispatchEvent(pev('pointerdown', -10, -10))
    canvas.dispatchEvent(pev('pointermove', 350, 60))
    canvas.dispatchEvent(pev('pointerup', 350, 60))
    expect(partial.selectedNodes().sort()).toEqual(['a', 'b'])
    expect(partial.viewport()).toEqual({ x: 0, y: 0, zoom: 1 })
    canvas.dispatchEvent(pev('pointerdown', 10, 10, { button: 1, buttons: 4 }))
    canvas.dispatchEvent(pev('pointermove', 20, 10, { buttons: 4 }))
    canvas.dispatchEvent(pev('pointerup', 20, 10, { button: 1 }))
    expect(partial.viewport().x).toBe(10)
    const full = make({ selectionOnDrag: true, selectionMode: 'full' })
    const c2 = mount(full)
    const canvas2 = canvasOf(c2)
    canvas2.dispatchEvent(pev('pointerdown', -10, -10))
    canvas2.dispatchEvent(pev('pointermove', 350, 60))
    canvas2.dispatchEvent(pev('pointerup', 350, 60))
    expect(full.selectedNodes()).toEqual(['a'])
  })

  it('selectionKey null disables the shift-drag box; a custom key enables it', () => {
    const flow = make({ selectionKey: 'alt' })
    const canvas = canvasOf(mount(flow))
    canvas.dispatchEvent(pev('pointerdown', -10, -10, { shiftKey: true }))
    canvas.dispatchEvent(pev('pointermove', 200, 60, { shiftKey: true }))
    canvas.dispatchEvent(pev('pointerup', 200, 60, { shiftKey: true }))
    expect(flow.selectedNodes()).toEqual([]) // shift now pans
    expect(flow.viewport().x).toBe(210)
    flow.viewport.set({ x: 0, y: 0, zoom: 1 })
    canvas.dispatchEvent(pev('pointerdown', -10, -10, { altKey: true }))
    canvas.dispatchEvent(pev('pointermove', 200, 60, { altKey: true }))
    canvas.dispatchEvent(pev('pointerup', 200, 60, { altKey: true }))
    expect(flow.selectedNodes()).toEqual(['a'])
  })
})
