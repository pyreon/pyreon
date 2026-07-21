import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { Handle } from '../components/handle'
import { createFlow } from '../flow'
import type { FlowInstance, NodeComponentProps } from '../types'
import { Position } from '../types'

// Real-Chromium specs for the handle-anchored edge geometry:
//
//  1. The NodeLayer measurement pass records every <Handle> dot's CENTER
//     (node-relative, unscaled) into `instance.measurements()`.
//  2. `edge.sourceHandle` / `targetHandle` anchor the edge path at the
//     MEASURED dot — the arrow touches the dot the consumer's CSS placed,
//     not a phantom side-midpoint.
//
// happy-dom cannot cover either: it has no layout, so offsetWidth is 0 and
// getBoundingClientRect returns zero rects — the measurement pass is
// structurally client-only. Only a real browser exercises it.

// A fixed-size custom node with TWO source dots (right + bottom) and one
// target dot (left). 220×90 so the measured box provably differs from the
// 150×40 fallback.
function MultiHandleNode(props: NodeComponentProps) {
  return (
    <div style="position: relative; width: 220px; height: 90px; background: #eee;">
      <Handle type="target" position={Position.Left} id="in" />
      {() => ((props.data() as { label?: string })?.label ?? props.id)}
      <Handle type="source" position={Position.Right} id="out-right" />
      <Handle type="source" position={Position.Bottom} id="out-bottom" />
    </div>
  )
}

async function waitForHandles(flow: FlowInstance<any>, nodeId: string) {
  // The per-node ResizeObserver delivers asynchronously — poll a few frames.
  for (let i = 0; i < 40; i++) {
    await flush()
    if (flow.measurements().get(nodeId)?.handles?.length) return
  }
}

describe('handle-anchored edges in real browser', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('measures the node size AND every <Handle> dot center (node-relative, unscaled)', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', type: 'multi', position: { x: 40, y: 40 }, data: { label: 'A' } },
        { id: 'b', position: { x: 500, y: 400 }, data: { label: 'B' } },
      ],
    })
    const { unmount } = mountInBrowser(
      h(Flow, { instance: flow, nodeTypes: { multi: MultiHandleNode } }),
    )
    await waitForHandles(flow, 'a')

    const m = flow.measurements().get('a')
    expect(m).toBeDefined()
    expect(m!.width).toBe(220)
    expect(m!.height).toBe(90)

    const handles = m!.handles!
    expect(handles).toHaveLength(3)

    const right = handles.find((hd) => hd.id === 'out-right')!
    const bottom = handles.find((hd) => hd.id === 'out-bottom')!
    const target = handles.find((hd) => hd.id === 'in')!

    // Handle dots are 8px + 2px border, centered on the edge via a −4px
    // offset of the CONTENT box — the visual center (incl. border) sits
    // ~2px outside the node edge. Assert within that tolerance.
    expect(right.type).toBe('source')
    expect(right.position).toBe(Position.Right)
    expect(Math.abs(right.x - 220)).toBeLessThanOrEqual(4)
    expect(Math.abs(right.y - 45)).toBeLessThanOrEqual(4)

    expect(bottom.position).toBe(Position.Bottom)
    expect(Math.abs(bottom.x - 110)).toBeLessThanOrEqual(4)
    expect(Math.abs(bottom.y - 90)).toBeLessThanOrEqual(4)

    expect(target.type).toBe('target')
    expect(Math.abs(target.x - 0)).toBeLessThanOrEqual(4)
    expect(Math.abs(target.y - 45)).toBeLessThanOrEqual(4)

    unmount()
  })

  it('edge.sourceHandle anchors the path start at the MEASURED dot, not a side midpoint', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', type: 'multi', position: { x: 40, y: 40 }, data: { label: 'A' } },
        { id: 'b', position: { x: 500, y: 400 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'out-bottom' }],
    })
    const { container, unmount } = mountInBrowser(
      h(Flow, { instance: flow, nodeTypes: { multi: MultiHandleNode } }),
    )
    await waitForHandles(flow, 'a')
    await flush()

    const path = container.querySelector('.pyreon-flow-edges path') as SVGPathElement
    expect(path).not.toBeNull()
    const d = path.getAttribute('d')!
    const m = /^M(-?[\d.]+),(-?[\d.]+)/.exec(d)!
    const startX = Number(m[1])
    const startY = Number(m[2])

    // The bottom dot's center in flow space: node position (40,40) + measured
    // dot offset (~110, ~90). A side-midpoint/floating anchor would start at
    // the RIGHT edge (~x=260) instead — assert the bottom-dot anchor.
    expect(Math.abs(startX - 150)).toBeLessThanOrEqual(6)
    expect(Math.abs(startY - 130)).toBeLessThanOrEqual(6)

    // And the path must depart DOWNWARD (bottom tangent), not sideways.
    expect(startY).toBeGreaterThan(120)

    unmount()
  })

  it('a node with <Handle> dots but NO edge.sourceHandle anchors at its first source dot', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', type: 'multi', position: { x: 40, y: 40 }, data: { label: 'A' } },
        { id: 'b', position: { x: 500, y: 400 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    })
    const { container, unmount } = mountInBrowser(
      h(Flow, { instance: flow, nodeTypes: { multi: MultiHandleNode } }),
    )
    await waitForHandles(flow, 'a')
    await flush()

    const path = container.querySelector('.pyreon-flow-edges path') as SVGPathElement
    const d = path.getAttribute('d')!
    const m = /^M(-?[\d.]+),(-?[\d.]+)/.exec(d)!
    // First source dot in DOM order is out-right at ~(40+220, 40+45).
    expect(Math.abs(Number(m[1]) - 260)).toBeLessThanOrEqual(6)
    expect(Math.abs(Number(m[2]) - 85)).toBeLessThanOrEqual(6)

    unmount()
  })
})
