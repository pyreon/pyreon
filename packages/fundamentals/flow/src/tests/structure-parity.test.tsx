/**
 * React Flow structure parity (W5 of the 2026-09 flow audit): sub-flows
 * (relative child positions rendered absolutely, parent drags carry children,
 * `extent: 'parent'`, `expandParent`, parents-first z-order), the pannable /
 * zoomable minimap, `<Controls>` children and the color-mode variable block.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Controls } from '../components/controls'
import { Flow } from '../components/flow-component'
import { MiniMap } from '../components/minimap'
import { createFlow } from '../flow'
import { flowStyles } from '../styles'
import type { FlowConfig } from '../types'

function subflow(config: Partial<FlowConfig> = {}) {
  return createFlow({
    nodes: [
      { id: 'child', parentId: 'group', position: { x: 20, y: 30 }, data: {}, width: 100, height: 40 },
      { id: 'group', position: { x: 100, y: 200 }, data: {}, width: 400, height: 300, group: true },
      { id: 'other', position: { x: 700, y: 0 }, data: {}, width: 100, height: 40 },
    ],
    edges: [{ id: 'e', source: 'child', target: 'other' }],
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

describe('flow structure parity', () => {
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
  function mount(flow: ReturnType<typeof subflow>, children?: unknown, props: Record<string, unknown> = {}) {
    const r = mountReactive(h(Flow, { instance: flow, ...props }, children as never))
    cleanups.push(r.cleanup, () => flow.dispose())
    return r.container
  }
  const drag = (c: Element, el: Element, dx: number, dy: number) => {
    const canvas = c.querySelector<HTMLElement>('.pyreon-flow')!
    el.dispatchEvent(pev('pointerdown', 0, 0))
    canvas.dispatchEvent(pev('pointermove', dx, dy))
    canvas.dispatchEvent(pev('pointerup', dx, dy))
  }
  const transformOf = (c: Element, id: string) =>
    c.querySelector<HTMLElement>(`[data-nodeid="${id}"]`)!.style.transform

  it('a child renders at its ABSOLUTE position, after its parent in DOM order, and its edge anchors there', () => {
    // Bisect: revert the node transform to `n.position` → child at (20, 30).
    const flow = subflow()
    const c = mount(flow)
    expect(transformOf(c, 'child')).toBe('translate(120px, 230px)')
    expect(flow.getNode('child')!.position).toEqual({ x: 20, y: 30 }) // model stays relative
    const ids = [...c.querySelectorAll('[data-nodeid]')].map((n) => n.getAttribute('data-nodeid'))
    expect(ids.indexOf('group')).toBeLessThan(ids.indexOf('child'))
    const d = c.querySelector('svg.pyreon-flow-edges g > path')!.getAttribute('d')!
    // Source anchor x = child's absolute right edge (120 + 100); the y slides
    // along the side toward the target (smart handle positions).
    expect(d, d).toMatch(/^M220,2[0-9]{2}/)
  })

  it('dragging the parent carries the child (one write, relative position untouched); dragging both selected does not double-move', () => {
    // Bisect: drop the ancestor-exclusion loop in handleNodePointerDown → the
    // child ends at translate(180px, 290px) (moved twice).
    const flow = subflow()
    const c = mount(flow)
    drag(c, c.querySelector('[data-nodeid="group"]')!, 30, 30)
    expect(flow.getNode('group')!.position).toEqual({ x: 130, y: 230 })
    expect(flow.getNode('child')!.position).toEqual({ x: 20, y: 30 })
    expect(transformOf(c, 'child')).toBe('translate(150px, 260px)')
    flow.selectNodes(['group', 'child'])
    drag(c, c.querySelector('[data-nodeid="group"]')!, 10, 10)
    expect(flow.getNode('child')!.position).toEqual({ x: 20, y: 30 })
    expect(transformOf(c, 'child')).toBe('translate(160px, 270px)')
  })

  it("extent: 'parent' clamps a dragged child inside its parent; an own box clamps too", () => {
    // Bisect: drop the extent branch in the drag frame → child at (-40, 30).
    const flow = subflow()
    flow.updateNode('child', { extent: 'parent' })
    const c = mount(flow)
    drag(c, c.querySelector('[data-nodeid="child"]')!, -60, 0)
    expect(flow.getNode('child')!.position).toEqual({ x: 0, y: 30 })
    drag(c, c.querySelector('[data-nodeid="child"]')!, 1000, 1000)
    expect(flow.getNode('child')!.position).toEqual({ x: 300, y: 260 })
    const boxed = createFlow({
      nodes: [{ id: 'n', position: { x: 0, y: 0 }, data: {}, width: 10, height: 10, extent: [[0, 0], [50, 50]] }],
    })
    const c2 = mount(boxed)
    drag(c2, c2.querySelector('[data-nodeid="n"]')!, 100, -100)
    expect(boxed.getNode('n')!.position).toEqual({ x: 40, y: 0 })
  })

  it('expandParent grows the parent to contain a child dragged past its edge', () => {
    // Bisect: drop the `grow` pass → the parent stays 400×300.
    const flow = subflow()
    flow.updateNode('child', { expandParent: true })
    const c = mount(flow)
    drag(c, c.querySelector('[data-nodeid="child"]')!, 400, 300)
    expect(flow.getNode('child')!.position).toEqual({ x: 420, y: 330 })
    expect(flow.getNode('group')).toMatchObject({ width: 520, height: 370 })
  })

  it('fitView, focusNode and the rubber band use absolute positions', () => {
    const flow = subflow()
    const c = mount(flow)
    // After mount: the container ref measured happy-dom's 0×0 rect.
    flow.containerSize.set({ width: 800, height: 600 })
    flow.fitView(['child'], 0)
    // Child absolute box is (120,230)-(220,270): fitView centers on (170, 250).
    const vp = flow.viewport()
    expect(vp.x + 170 * vp.zoom).toBeCloseTo(400, 3)
    expect(vp.y + 250 * vp.zoom).toBeCloseTo(300, 3)
    flow.viewport.set({ x: 0, y: 0, zoom: 1 })
    const canvas = c.querySelector<HTMLElement>('.pyreon-flow')!
    canvas.dispatchEvent(pev('pointerdown', 110, 220, { shiftKey: true }))
    canvas.dispatchEvent(pev('pointermove', 230, 280, { shiftKey: true }))
    canvas.dispatchEvent(pev('pointerup', 230, 280, { shiftKey: true }))
    expect(flow.selectedNodes().sort()).toEqual(['child', 'group'])
  })

  it('the minimap draws children at absolute positions, pans on drag, zooms on wheel, and its pannable/zoomable opt out', () => {
    // Bisect: drop the pointer handlers on the minimap → viewport stays at 0.
    const flow = subflow()
    const c = mount(flow, h(MiniMap, {}))
    flow.containerSize.set({ width: 800, height: 600 })
    const mm = c.querySelector<HTMLElement>('.pyreon-flow-minimap')!
    const rects = [...mm.querySelectorAll('svg g rect')]
    const childRect = rects[0]!
    const groupRect = rects[1]!
    expect(Number(childRect.getAttribute('x'))).toBeGreaterThan(Number(groupRect.getAttribute('x')))
    mm.dispatchEvent(pev('pointerdown', 50, 50))
    mm.dispatchEvent(pev('pointermove', 60, 55))
    mm.dispatchEvent(pev('pointerup', 60, 55))
    expect(flow.viewport().x).toBeLessThan(0)
    expect(flow.viewport().y).toBeLessThan(0)
    const before = flow.viewport()
    mm.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 60, clientY: 55 }))
    expect(flow.viewport()).toEqual(before) // the click after a drag is swallowed
    mm.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))
    expect(flow.viewport().zoom).toBeCloseTo(1.1, 5)
    const locked = subflow()
    const c2 = mount(locked, h(MiniMap, { pannable: false, zoomable: false }))
    const mm2 = c2.querySelector<HTMLElement>('.pyreon-flow-minimap')!
    mm2.dispatchEvent(pev('pointerdown', 50, 50))
    mm2.dispatchEvent(pev('pointermove', 90, 90))
    mm2.dispatchEvent(pev('pointerup', 90, 90))
    mm2.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))
    expect(locked.viewport().zoom).toBe(1)
  })

  it('<Controls> renders its children after the built-in buttons', () => {
    const flow = subflow()
    const c = mount(flow, h(Controls, {}, h('button', { type: 'button', 'data-testid': 'extra' }, 'X')))
    const buttons = [...c.querySelectorAll('.pyreon-flow-controls button')]
    expect(buttons.at(-1)!.getAttribute('data-testid')).toBe('extra')
    expect(buttons.length).toBeGreaterThan(1)
  })

  it('colorMode renders data-color-mode and flowStyles carries the dark + system blocks', () => {
    const c = mount(subflow())
    expect(c.querySelector('.pyreon-flow')!.getAttribute('data-color-mode')).toBe('light')
    const c2 = mount(subflow(), undefined, { colorMode: 'dark' })
    expect(c2.querySelector('.pyreon-flow')!.getAttribute('data-color-mode')).toBe('dark')
    expect(flowStyles).toContain('.pyreon-flow[data-color-mode="dark"]')
    expect(flowStyles).toContain('.pyreon-flow[data-color-mode="system"]')
    expect(flowStyles).toContain('@media (prefers-color-scheme: dark)')
    // Every variable the components read has a dark value.
    for (const v of ['node-bg', 'node-color', 'edge', 'panel-bg', 'minimap-node', 'toolbar-bg', 'handle-bg', 'bg-pattern']) {
      expect(flowStyles).toMatch(new RegExp(`data-color-mode="dark"\\][^}]*--pyreon-flow-${v}:`))
    }
  })
})
