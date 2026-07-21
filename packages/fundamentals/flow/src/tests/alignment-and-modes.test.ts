import { effect } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  getBezierPath,
  getEdgePath,
  getEffectiveDimensions,
  getSmoothStepPath,
  resolveHandleAnchor,
} from '../edges'
import { createFlow } from '../flow'
import type { FlowNode, NodeMeasurement } from '../types'
import { MarkerType, Position } from '../types'

// ─── Effective dimensions (the ONE precedence rule) ─────────────────────────

describe('getEffectiveDimensions', () => {
  const node = (over: Partial<FlowNode> = {}): FlowNode => ({
    id: 'n1',
    position: { x: 10, y: 20 },
    data: {},
    ...over,
  })

  it('falls back to the 150×40 default with no explicit size and no measurement', () => {
    expect(getEffectiveDimensions(node())).toEqual({
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    })
  })

  it('uses the measured DOM size when the node has no explicit size', () => {
    expect(getEffectiveDimensions(node(), { width: 220, height: 90 })).toEqual({
      width: 220,
      height: 90,
    })
  })

  it('explicit node.width/height beat the measurement (deliberate consumer override)', () => {
    expect(
      getEffectiveDimensions(node({ width: 300, height: 120 }), { width: 220, height: 90 }),
    ).toEqual({ width: 300, height: 120 })
  })

  it('mixes per-axis: explicit width + measured height', () => {
    expect(getEffectiveDimensions(node({ width: 300 }), { width: 220, height: 90 })).toEqual({
      width: 300,
      height: 90,
    })
  })
})

// ─── Handle-anchor resolution ───────────────────────────────────────────────

describe('resolveHandleAnchor', () => {
  const dims = { width: 200, height: 100 }
  const node = (over: Partial<FlowNode> = {}): FlowNode => ({
    id: 'n1',
    position: { x: 1000, y: 500 },
    data: {},
    ...over,
  })

  const measurement: NodeMeasurement = {
    width: 200,
    height: 100,
    handles: [
      { id: 'out-a', type: 'source', position: Position.Right, x: 200, y: 25 },
      { id: 'out-b', type: 'source', position: Position.Bottom, x: 120, y: 100 },
      { id: 'in', type: 'target', position: Position.Left, x: 0, y: 50 },
    ],
  }

  it('resolves a handleId to the MEASURED dot center (node-relative → flow-space)', () => {
    expect(resolveHandleAnchor(node(), 'out-b', 'source', dims, measurement)).toEqual({
      x: 1120,
      y: 600,
      position: Position.Bottom,
    })
  })

  it('filters measured handles by type — a target id never matches a source lookup', () => {
    // 'in' exists but is a target handle; source lookup falls to the first
    // measured SOURCE handle.
    expect(resolveHandleAnchor(node(), 'in', 'source', dims, measurement)).toEqual({
      x: 1200,
      y: 525,
      position: Position.Right,
    })
  })

  it('falls back to a CONFIG handle side-midpoint when un-measured', () => {
    const n = node({
      sourceHandles: [{ id: 'cfg', type: 'source', position: Position.Top }],
    })
    expect(resolveHandleAnchor(n, 'cfg', 'source', dims, undefined)).toEqual({
      x: 1100, // x + width/2
      y: 500, // top
      position: Position.Top,
    })
  })

  it('no handleId → first measured handle of the type', () => {
    expect(resolveHandleAnchor(node(), undefined, 'source', dims, measurement)).toEqual({
      x: 1200,
      y: 525,
      position: Position.Right,
    })
    expect(resolveHandleAnchor(node(), undefined, 'target', dims, measurement)).toEqual({
      x: 1000,
      y: 550,
      position: Position.Left,
    })
  })

  it('no handleId, no measurement → first config handle side-midpoint', () => {
    const n = node({
      targetHandles: [{ id: 'in', type: 'target', position: Position.Left }],
    })
    expect(resolveHandleAnchor(n, undefined, 'target', dims, undefined)).toEqual({
      x: 1000,
      y: 550,
      position: Position.Left,
    })
  })

  it('unknown id falls through to the first handle of the type (never a dead edge)', () => {
    expect(resolveHandleAnchor(node(), 'typo', 'source', dims, measurement)).toEqual({
      x: 1200,
      y: 525,
      position: Position.Right,
    })
  })

  it('returns null when the node has no handles at all (caller uses floating endpoints)', () => {
    expect(resolveHandleAnchor(node(), undefined, 'source', dims, undefined)).toBeNull()
    expect(resolveHandleAnchor(node(), 'anything', 'source', dims, { width: 1, height: 1 })).toBeNull()
  })
})

// ─── Per-edge path options ──────────────────────────────────────────────────

describe('getEdgePath pathOptions threading', () => {
  const args = [0, 0, Position.Right, 200, 100, Position.Left] as const

  it('bezier honors curvature (0 collapses control points onto the endpoints)', () => {
    const dflt = getEdgePath('bezier', ...args)
    const flat = getEdgePath('bezier', ...args, { curvature: 0 })
    const bowed = getEdgePath('bezier', ...args, { curvature: 0.9 })
    expect(flat.path).toBe('M0,0 C0,0 200,100 200,100')
    expect(dflt.path).not.toBe(flat.path)
    expect(bowed.path).not.toBe(dflt.path)
    // Direct builder agrees with the dispatcher
    expect(getBezierPath({ sourceX: 0, sourceY: 0, sourcePosition: Position.Right, targetX: 200, targetY: 100, targetPosition: Position.Left, curvature: 0.9 }).path).toBe(bowed.path)
  })

  it('smoothstep honors borderRadius + offset', () => {
    const dflt = getEdgePath('smoothstep', ...args)
    const tuned = getEdgePath('smoothstep', ...args, { borderRadius: 12, offset: 40 })
    expect(tuned.path).not.toBe(dflt.path)
    expect(tuned.path).toBe(
      getSmoothStepPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Right,
        targetX: 200,
        targetY: 100,
        targetPosition: Position.Left,
        borderRadius: 12,
        offset: 40,
      }).path,
    )
  })

  it('step keeps square corners but honors offset', () => {
    const dflt = getEdgePath('step', ...args)
    const tuned = getEdgePath('step', ...args, { offset: 60, borderRadius: 99 })
    expect(tuned.path).not.toBe(dflt.path)
    // borderRadius must stay locked to 0 for `step` — no `Q` (arc) segments.
    expect(tuned.path).not.toContain('Q0.5')
  })

  it('straight ignores pathOptions', () => {
    expect(getEdgePath('straight', ...args, { curvature: 0.9, offset: 60 }).path).toBe(
      getEdgePath('straight', ...args).path,
    )
  })
})

// ─── defaultEdgeOptions merge ───────────────────────────────────────────────

describe('config.defaultEdgeOptions', () => {
  it('applies to initial edges and addEdge, with per-edge values winning', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 0 }, data: {} },
        { id: '3', position: { x: 400, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: '1', target: '2' },
        { id: 'e2', source: '2', target: '3', animated: false, type: 'bezier' },
      ],
      defaultEdgeOptions: {
        type: 'smoothstep',
        animated: true,
        pathOptions: { borderRadius: 10 },
      },
    })

    const e1 = flow.getEdge('e1')!
    expect(e1.type).toBe('smoothstep')
    expect(e1.animated).toBe(true)
    expect(e1.pathOptions).toEqual({ borderRadius: 10 })

    // Per-edge explicit values win over the defaults
    const e2 = flow.getEdge('e2')!
    expect(e2.type).toBe('bezier')
    expect(e2.animated).toBe(false)

    flow.addEdge({ id: 'e3', source: '1', target: '3' })
    const e3 = flow.getEdge('e3')!
    expect(e3.type).toBe('smoothstep')
    expect(e3.animated).toBe(true)
    expect(e3.pathOptions).toEqual({ borderRadius: 10 })
  })

  it('an explicit per-edge `markerEnd: null` survives the merge (key present wins)', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2', markerEnd: null }],
      defaultEdgeOptions: { markerEnd: { type: MarkerType.Arrow } },
    })
    expect(flow.getEdge('e1')!.markerEnd).toBeNull()
  })

  it('type resolution chain: edge.type → defaultEdgeOptions.type → defaultEdgeType', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 0 }, data: {} },
      ],
      defaultEdgeType: 'straight',
    })
    flow.addEdge({ id: 'a', source: '1', target: '2' })
    expect(flow.getEdge('a')!.type).toBe('straight')

    const flow2 = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 0 }, data: {} },
      ],
      defaultEdgeType: 'straight',
      defaultEdgeOptions: { type: 'step' },
    })
    flow2.addEdge({ id: 'a', source: '1', target: '2' })
    expect(flow2.getEdge('a')!.type).toBe('step')
  })
})

// ─── Measured dimensions drive the instance geometry ────────────────────────

describe('measured dimensions in instance geometry', () => {
  const twoNodes = () => [
    { id: 'a', position: { x: 0, y: 0 }, data: {} },
    { id: 'b', position: { x: 400, y: 300 }, data: {} },
  ]

  it('getNodeDimensions: explicit → measured → default', () => {
    const flow = createFlow({ nodes: twoNodes() })
    expect(flow.getNodeDimensions('a')).toEqual({
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    })

    flow._setNodeMeasurement('a', 220, 90)
    expect(flow.getNodeDimensions('a')).toEqual({ width: 220, height: 90 })

    flow.updateNode('a', { width: 300, height: 120 })
    expect(flow.getNodeDimensions('a')).toEqual({ width: 300, height: 120 })

    expect(flow.getNodeDimensions('missing')).toEqual({ width: 0, height: 0 })
  })

  it('fitView uses the MEASURED box, not the 150×40 phantom', () => {
    const flow = createFlow({ nodes: twoNodes() })
    flow.containerSize.set({ width: 800, height: 600 })

    flow.fitView()
    const before = flow.viewport.peek()

    // Make node b much larger than the phantom — the graph bounds grow, so a
    // correct fit must zoom OUT relative to the phantom fit.
    flow._setNodeMeasurement('b', 600, 500)
    flow.fitView()
    const after = flow.viewport.peek()

    expect(after.zoom).toBeLessThan(before.zoom)
  })

  it('snap lines align to the MEASURED edges of other nodes', () => {
    const flow = createFlow({ nodes: twoNodes() })
    // Node a measured 220 wide → its RIGHT edge is at x=220 (not the phantom 150).
    flow._setNodeMeasurement('a', 220, 90)
    // Drag b (default 150 wide) so its right edge (x+150) is within threshold
    // of a's MEASURED right edge (220): x=68 → right=218 → snaps to 220.
    const snap = flow.getSnapLines('b', { x: 68, y: 300 }, 5)
    expect(snap.x).toBe(220)
    expect(snap.snappedPosition.x).toBe(70) // 220 − 150
    // Against the phantom (un-measured) box this must NOT snap: a's right
    // would be 150, and |218 − 150| is far outside the threshold.
    flow._setNodeMeasurement('a', 150, 40)
    const phantom = flow.getSnapLines('b', { x: 68, y: 300 }, 5)
    expect(phantom.x).toBeNull()
  })

  it('layout() feeds EFFECTIVE (measured) sizes to the layout engine', async () => {
    vi.resetModules()
    const computeLayoutSpy = vi.fn(async (nodes: FlowNode[]) =>
      nodes.map((n) => ({ id: n.id, position: { x: 0, y: 0 } })),
    )
    vi.doMock('../layout', () => ({ computeLayout: computeLayoutSpy }))
    const { createFlow: createFlowMocked } = await import('../flow')

    const flow = createFlowMocked({ nodes: twoNodes() })
    flow._setNodeMeasurement('a', 220, 90)
    await flow.layout('layered', { animate: false })

    const passed = computeLayoutSpy.mock.calls[0]![0] as FlowNode[]
    expect(passed.find((n) => n.id === 'a')).toMatchObject({ width: 220, height: 90 })
    // Un-measured node falls back to the default box
    expect(passed.find((n) => n.id === 'b')).toMatchObject({
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    })
    vi.doUnmock('../layout')
    vi.resetModules()
  })

  it('_setNodeMeasurement no-ops when size AND handles are unchanged, fires on handle change', () => {
    const flow = createFlow({ nodes: twoNodes() })
    let fires = 0
    effect(() => {
      flow.measurements()
      fires++
    })
    expect(fires).toBe(1)

    const handles = [
      { id: 'out', type: 'source' as const, position: Position.Right, x: 220, y: 45 },
    ]
    flow._setNodeMeasurement('a', 220, 90, handles)
    expect(fires).toBe(2)

    // Identical geometry (fresh array, same values) → no notify
    flow._setNodeMeasurement('a', 220, 90, [{ ...handles[0]! }])
    expect(fires).toBe(2)

    // A moved dot → notify
    flow._setNodeMeasurement('a', 220, 90, [{ ...handles[0]!, y: 60 }])
    expect(fires).toBe(3)

    // Handles removed → notify
    flow._setNodeMeasurement('a', 220, 90)
    expect(fires).toBe(4)
  })
})
