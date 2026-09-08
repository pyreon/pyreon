/**
 * Portaled overlay layers (W5b of the 2026-09 flow audit): `<EdgeLabelRenderer>`
 * (HTML edge labels inside the viewport) and the portaled `<NodeToolbar
 * nodeId>` (unscaled, follows pan/zoom and the node, above every node).
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EdgeLabelRenderer } from '../components/edge-label-renderer'
import { Flow, type EdgeComponentProps } from '../components/flow-component'
import { NodeToolbar } from '../components/node-toolbar'
import { createFlow } from '../flow'
import type { NodeComponentProps } from '../types'

function pev(type: string, x: number, y: number) {
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
  } as PointerEventInit)
}

function LabeledEdge(props: EdgeComponentProps) {
  return [
    h('path', { d: 'M0,0 L10,10', style: 'fill: none; stroke: #999;' }),
    h(EdgeLabelRenderer, {}, [
      h(
        'div',
        {
          class: 'html-label nopan',
          style: () => `position: absolute; transform: translate(${props.labelX()}px, ${props.labelY()}px);`,
        },
        () => `${props.edge.source}→${props.edge.target}`,
      ),
    ]),
  ]
}

function ToolbarNode(props: NodeComponentProps) {
  return h('div', { style: 'width: 150px; height: 40px;' }, [
    h(NodeToolbar, { nodeId: props.id, selected: props.selected }, [
      h('button', { type: 'button', class: 'tb-btn' }, 'Edit'),
    ]),
    h('span', {}, () => props.id),
  ])
}

function InlineToolbarNode(props: NodeComponentProps) {
  return h('div', {}, [h(NodeToolbar, { selected: props.selected }, [h('button', {}, 'x')])])
}

describe('portaled layers', () => {
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

  it('EdgeLabelRenderer portals HTML into the viewport label layer and follows the edge label anchor', () => {
    // Bisect: make EdgeLabelRenderer return its children inline → the label
    // lands inside the <svg> (invalid HTML-in-SVG) and the layer is empty.
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {}, width: 100, height: 40 },
        { id: 'b', position: { x: 300, y: 0 }, data: {}, width: 100, height: 40 },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b', type: 'html' }],
    })
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow, edgeTypes: { html: LabeledEdge } }))
    cleanups.push(cleanup, () => flow.dispose())
    const layer = container.querySelector<HTMLElement>('.pyreon-flow-viewport > .pyreon-flow-edge-labels')!
    expect(layer).toBeTruthy()
    const label = layer.querySelector<HTMLElement>('.html-label')!
    expect(label.textContent).toBe('a→b')
    expect(container.querySelector('svg .html-label')).toBeNull()
    const before = label.style.transform
    expect(before).toMatch(/translate\(200px, 20px\)/)
    flow.updateNode('b', { position: { x: 500, y: 100 } })
    expect(label.style.transform).not.toBe(before)
    expect(label.style.transform).toMatch(/translate\(300px, 70px\)/)
    cleanup()
    expect(document.querySelector('.html-label')).toBeNull()
  })

  it('NodeToolbar with nodeId renders in the container toolbar layer (not in the node), unscaled, tracking pan/zoom and drags', () => {
    // Bisect: drop the portaled branch in NodeToolbar → the toolbar renders
    // inside [data-nodeid="a"] and the layer stays empty.
    const flow = createFlow({
      nodes: [{ id: 'a', type: 't', position: { x: 100, y: 200 }, data: {}, width: 150, height: 40 }],
    })
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow, nodeTypes: { t: ToolbarNode } }))
    cleanups.push(cleanup, () => flow.dispose())
    const layer = container.querySelector<HTMLElement>('.pyreon-flow > .pyreon-flow-toolbars')!
    expect(layer).toBeTruthy()
    expect(layer.querySelector('.pyreon-flow-node-toolbar')).toBeNull() // showOnSelect, not selected yet
    flow.selectNode('a')
    const tb = layer.querySelector<HTMLElement>('.pyreon-flow-node-toolbar')!
    expect(tb).toBeTruthy()
    expect(container.querySelector('[data-nodeid="a"] .pyreon-flow-node-toolbar')).toBeNull()
    // top placement, centered: left = x + w/2, top = y - offset(8)
    expect(tb.style.left).toBe('175px')
    expect(tb.style.top).toBe('192px')
    expect(tb.style.transform).toContain('translate(-50%, -100%)')
    flow.viewport.set({ x: 10, y: 20, zoom: 2 })
    expect(tb.style.left).toBe(`${100 * 2 + 10 + 150}px`)
    expect(tb.style.top).toBe(`${200 * 2 + 20 - 8}px`)
    flow.viewport.set({ x: 0, y: 0, zoom: 1 })
    flow.updateNode('a', { position: { x: 300, y: 300 } })
    expect(tb.style.left).toBe('375px')
    flow.clearSelection()
    expect(layer.querySelector('.pyreon-flow-node-toolbar')).toBeNull()
  })

  it('pointerdown on a portaled toolbar does not start a canvas pan; clicking its button works', () => {
    const flow = createFlow({
      nodes: [{ id: 'a', type: 't', position: { x: 100, y: 200 }, data: {}, width: 150, height: 40 }],
    })
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow, nodeTypes: { t: ToolbarNode } }))
    cleanups.push(cleanup, () => flow.dispose())
    flow.selectNode('a')
    const btn = container.querySelector<HTMLElement>('.pyreon-flow-toolbars .tb-btn')!
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    btn.dispatchEvent(pev('pointerdown', 175, 180))
    canvas.dispatchEvent(pev('pointermove', 275, 280))
    canvas.dispatchEvent(pev('pointerup', 275, 280))
    expect(flow.viewport()).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(flow.selectedNodes()).toEqual(['a']) // the pan path would have cleared it
  })

  it('without nodeId (or outside a Flow) NodeToolbar keeps the inline form', () => {
    const flow = createFlow({
      nodes: [{ id: 'a', type: 't', position: { x: 0, y: 0 }, data: {} }],
    })
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow, nodeTypes: { t: InlineToolbarNode } }))
    cleanups.push(cleanup, () => flow.dispose())
    flow.selectNode('a')
    expect(container.querySelector('[data-nodeid="a"] .pyreon-flow-node-toolbar')).toBeTruthy()
    expect(container.querySelector('.pyreon-flow-toolbars .pyreon-flow-node-toolbar')).toBeNull()
  })
})
