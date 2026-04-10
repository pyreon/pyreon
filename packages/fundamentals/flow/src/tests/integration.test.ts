import { effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import {
  getBezierPath,
  getEdgePath,
  getHandlePosition,
  getSmartHandlePositions,
  getSmoothStepPath,
  getStepPath,
  getStraightPath,
  getWaypointPath,
} from '../edges'
import { createFlow } from '../flow'
import { computeLayout } from '../layout'
import { flowStyles } from '../styles'
import { Position } from '../types'

// ─── Graph Queries ─────────────────────────────────────────────────────────

describe('graph queries', () => {
  it('getConnectedEdges returns all edges touching a node', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
        { id: '3', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [
        { source: '1', target: '2' },
        { source: '2', target: '3' },
        { source: '1', target: '3' },
      ],
    })

    const edges = flow.getConnectedEdges('2')
    expect(edges).toHaveLength(2) // 1→2 and 2→3
  })

  it('getIncomers returns source nodes', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
        { id: '3', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [
        { source: '1', target: '3' },
        { source: '2', target: '3' },
      ],
    })

    const incomers = flow.getIncomers('3')
    expect(incomers).toHaveLength(2)
    expect(incomers.map((n) => n.id).sort()).toEqual(['1', '2'])
  })

  it('getOutgoers returns target nodes', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
        { id: '3', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [
        { source: '1', target: '2' },
        { source: '1', target: '3' },
      ],
    })

    const outgoers = flow.getOutgoers('1')
    expect(outgoers).toHaveLength(2)
    expect(outgoers.map((n) => n.id).sort()).toEqual(['2', '3'])
  })

  it('getConnectedEdges returns empty for isolated node', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    expect(flow.getConnectedEdges('1')).toHaveLength(0)
  })
})

// ─── Viewport Operations ───────────────────────────────────────────────────

describe('viewport operations', () => {
  it('zoomIn increases zoom', () => {
    const flow = createFlow()
    const initial = flow.viewport().zoom
    flow.zoomIn()
    expect(flow.viewport().zoom).toBeGreaterThan(initial)
  })

  it('zoomOut decreases zoom', () => {
    const flow = createFlow()
    const initial = flow.viewport().zoom
    flow.zoomOut()
    expect(flow.viewport().zoom).toBeLessThan(initial)
  })

  it('zoomTo sets specific zoom level', () => {
    const flow = createFlow()
    flow.zoomTo(2)
    expect(flow.viewport().zoom).toBe(2)
  })

  it('zoomTo clamps to minZoom and maxZoom', () => {
    const flow = createFlow({ minZoom: 0.5, maxZoom: 3 })

    flow.zoomTo(0.1)
    expect(flow.viewport().zoom).toBe(0.5)

    flow.zoomTo(10)
    expect(flow.viewport().zoom).toBe(3)
  })

  it('panTo changes viewport position', () => {
    const flow = createFlow()
    flow.panTo({ x: 100, y: 200 })
    expect(flow.viewport().x).toBe(-100) // inverted
    expect(flow.viewport().y).toBe(-200)
  })

  it('fitView adjusts viewport to fit all nodes', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 50, data: {} },
        { id: '2', position: { x: 500, y: 400 }, width: 100, height: 50, data: {} },
      ],
    })
    flow.fitView()
    const vp = flow.viewport()
    // Zoom should have changed from default 1
    expect(vp.zoom).not.toBe(1)
  })

  it('fitView with specific node IDs', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 50, data: {} },
        { id: '2', position: { x: 1000, y: 1000 }, width: 100, height: 50, data: {} },
      ],
    })
    flow.fitView(['1'])
    const vp = flow.viewport()
    expect(vp.zoom).not.toBe(1)
  })

  it('fitView with empty nodes does nothing', () => {
    const flow = createFlow()
    flow.fitView()
    expect(flow.viewport()).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('isNodeVisible returns true for node in viewport', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 100, y: 100 }, width: 100, height: 50, data: {} },
      ],
    })
    expect(flow.isNodeVisible('1')).toBe(true)
  })

  it('isNodeVisible returns false for missing node', () => {
    const flow = createFlow()
    expect(flow.isNodeVisible('missing')).toBe(false)
  })
})

// ─── Selection Operations ──────────────────────────────────────────────────

describe('selection — edge selection', () => {
  it('selectEdge selects an edge', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    flow.selectEdge('e1')
    expect(flow.selectedEdges()).toEqual(['e1'])
  })

  it('selectEdge clears node selection by default', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    flow.selectNode('1')
    flow.selectEdge('e1')
    expect(flow.selectedNodes()).toEqual([])
    expect(flow.selectedEdges()).toEqual(['e1'])
  })

  it('selectEdge with additive keeps previous selection', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
        { id: '3', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: '1', target: '2' },
        { id: 'e2', source: '2', target: '3' },
      ],
    })
    flow.selectEdge('e1')
    flow.selectEdge('e2', true)
    expect(flow.selectedEdges()).toEqual(expect.arrayContaining(['e1', 'e2']))
  })

  it('deselectNode removes from selection', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
    })
    flow.selectNode('1')
    flow.selectNode('2', true)
    flow.deselectNode('1')
    expect(flow.selectedNodes()).toEqual(['2'])
  })
})

// ─── Delete Selected ───────────────────────────────────────────────────────

describe('deleteSelected', () => {
  it('deletes selected nodes and connected edges', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
        { id: '3', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [
        { source: '1', target: '2' },
        { source: '2', target: '3' },
      ],
    })

    flow.selectNode('2')
    flow.deleteSelected()

    expect(flow.nodes()).toHaveLength(2)
    expect(flow.edges()).toHaveLength(0) // both edges connected to 2
    expect(flow.selectedNodes()).toEqual([])
  })

  it('deletes selected edges only', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })

    flow.selectEdge('e1')
    flow.deleteSelected()

    expect(flow.nodes()).toHaveLength(2)
    expect(flow.edges()).toHaveLength(0)
  })
})

// ─── Signal Reactivity ─────────────────────────────────────────────────────

describe('signal reactivity', () => {
  it('nodes signal is reactive in effects', () => {
    const flow = createFlow()
    const counts: number[] = []

    effect(() => {
      counts.push(flow.nodes().length)
    })

    flow.addNode({ id: '1', position: { x: 0, y: 0 }, data: {} })
    flow.addNode({ id: '2', position: { x: 100, y: 0 }, data: {} })

    expect(counts).toEqual([0, 1, 2])
  })

  it('zoom computed reflects viewport zoom', () => {
    const flow = createFlow()
    expect(flow.zoom()).toBe(1)

    flow.zoomTo(2)
    expect(flow.zoom()).toBe(2)
  })

  it('selectedNodes computed reflects selection changes', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
    })

    expect(flow.selectedNodes()).toEqual([])
    flow.selectNode('1')
    expect(flow.selectedNodes()).toEqual(['1'])
  })
})

// ─── Listener Unsubscribe ──────────────────────────────────────────────────

describe('listener unsubscribe', () => {
  it('onConnect returns unsubscribe function', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
    })

    const connections: string[] = []
    const unsub = flow.onConnect((c) => connections.push(c.source))

    flow.addEdge({ source: '1', target: '2' })
    expect(connections).toEqual(['1'])

    unsub()
    flow.addEdge({ source: '2', target: '1' })
    expect(connections).toEqual(['1']) // no second callback
  })

  it('onNodesChange returns unsubscribe function', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })

    const changes: string[] = []
    const unsub = flow.onNodesChange((c) => changes.push(c[0]!.type))

    flow.removeNode('1')
    expect(changes).toEqual(['remove'])

    unsub()
  })
})

// ─── Batch Operations ──────────────────────────────────────────────────────

describe('batch operations', () => {
  it('batchOp groups multiple updates', () => {
    const flow = createFlow()
    const counts: number[] = []

    effect(() => {
      counts.push(flow.nodes().length)
    })

    flow.batch(() => {
      flow.addNode({ id: '1', position: { x: 0, y: 0 }, data: {} })
      flow.addNode({ id: '2', position: { x: 100, y: 0 }, data: {} })
    })

    // Should have initial (0) and then batch result (2), not intermediate (1)
    expect(counts).toEqual([0, 2])
  })
})

// ─── Edge Path Calculations ───────────────────────────────────────────────

describe('getBezierPath', () => {
  it('creates a bezier path with default positions', () => {
    const result = getBezierPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 100,
    })
    expect(result.path).toContain('M0,0')
    expect(result.path).toContain('C')
    expect(result.path).toContain('200,100')
    expect(result.labelX).toBe(100)
    expect(result.labelY).toBe(50)
  })

  it('handles all source positions', () => {
    for (const pos of [Position.Top, Position.Right, Position.Bottom, Position.Left]) {
      const result = getBezierPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: pos,
        targetX: 200,
        targetY: 200,
      })
      expect(result.path).toContain('M0,0')
    }
  })

  it('handles all target positions', () => {
    for (const pos of [Position.Top, Position.Right, Position.Bottom, Position.Left]) {
      const result = getBezierPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 200,
        targetY: 200,
        targetPosition: pos,
      })
      expect(result.path).toContain('200,200')
    }
  })

  it('respects custom curvature', () => {
    const r1 = getBezierPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 100,
      curvature: 0,
    })
    const r2 = getBezierPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 100,
      curvature: 1,
    })
    expect(r1.path).not.toBe(r2.path)
  })
})

describe('getSmoothStepPath', () => {
  it('creates a smoothstep path with defaults', () => {
    const result = getSmoothStepPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 200,
    })
    expect(result.path).toContain('M0,0')
    expect(result.labelX).toBe(100)
    expect(result.labelY).toBe(100)
  })

  it('handles horizontal source to vertical target', () => {
    const result = getSmoothStepPath({
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Right,
      targetX: 200,
      targetY: 200,
      targetPosition: Position.Top,
    })
    expect(result.path).toContain('M0,0')
  })

  it('handles vertical source to horizontal target', () => {
    const result = getSmoothStepPath({
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Bottom,
      targetX: 200,
      targetY: 200,
      targetPosition: Position.Left,
    })
    expect(result.path).toContain('M0,0')
  })

  it('handles both horizontal positions', () => {
    const result = getSmoothStepPath({
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Right,
      targetX: 200,
      targetY: 200,
      targetPosition: Position.Left,
    })
    expect(result.path).toContain('M0,0')
  })

  it('handles both vertical positions', () => {
    const result = getSmoothStepPath({
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Bottom,
      targetX: 200,
      targetY: 200,
      targetPosition: Position.Top,
    })
    expect(result.path).toContain('M0,0')
  })

  it('handles left source position offset', () => {
    const result = getSmoothStepPath({
      sourceX: 100,
      sourceY: 100,
      sourcePosition: Position.Left,
      targetX: 0,
      targetY: 0,
      targetPosition: Position.Right,
    })
    expect(result.path).toContain('M100,100')
  })

  it('respects custom borderRadius and offset', () => {
    const result = getSmoothStepPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 200,
      borderRadius: 10,
      offset: 40,
    })
    expect(result.path).toContain('M0,0')
  })
})

describe('getStraightPath', () => {
  it('creates a straight line between two points', () => {
    const result = getStraightPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 100,
    })
    expect(result.path).toBe('M0,0 L100,100')
    expect(result.labelX).toBe(50)
    expect(result.labelY).toBe(50)
  })
})

describe('getStepPath', () => {
  it('creates a step path (smoothstep with borderRadius 0)', () => {
    const result = getStepPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 200,
    })
    expect(result.path).toContain('M0,0')
  })
})

describe('getWaypointPath', () => {
  it('creates a path through waypoints', () => {
    const result = getWaypointPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 300,
      targetY: 300,
      waypoints: [
        { x: 100, y: 0 },
        { x: 200, y: 300 },
      ],
    })
    expect(result.path).toContain('M0,0')
    expect(result.path).toContain('L100,0')
    expect(result.path).toContain('L200,300')
    expect(result.path).toContain('L300,300')
    // Label at middle waypoint (index 1)
    expect(result.labelX).toBe(200)
    expect(result.labelY).toBe(300)
  })

  it('falls back to straight path with no waypoints', () => {
    const result = getWaypointPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 100,
      waypoints: [],
    })
    expect(result.path).toBe('M0,0 L100,100')
  })

  it('handles single waypoint', () => {
    const result = getWaypointPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 200,
      waypoints: [{ x: 100, y: 50 }],
    })
    expect(result.path).toContain('L100,50')
    expect(result.labelX).toBe(100)
    expect(result.labelY).toBe(50)
  })
})

describe('getEdgePath', () => {
  it('returns bezier for default/unknown type', () => {
    const result = getEdgePath('bezier', 0, 0, Position.Bottom, 200, 200, Position.Top)
    expect(result.path).toContain('C')
  })

  it('returns smoothstep path', () => {
    const result = getEdgePath('smoothstep', 0, 0, Position.Bottom, 200, 200, Position.Top)
    expect(result.path).toContain('M0,0')
  })

  it('returns straight path', () => {
    const result = getEdgePath('straight', 0, 0, Position.Bottom, 200, 200, Position.Top)
    expect(result.path).toBe('M0,0 L200,200')
  })

  it('returns step path', () => {
    const result = getEdgePath('step', 0, 0, Position.Bottom, 200, 200, Position.Top)
    expect(result.path).toContain('M0,0')
  })

  it('falls back to bezier for unknown type', () => {
    const result = getEdgePath('unknown', 0, 0, Position.Bottom, 200, 200, Position.Top)
    expect(result.path).toContain('C')
  })
})

describe('getHandlePosition', () => {
  it('returns top handle position', () => {
    const pos = getHandlePosition(Position.Top, 0, 0, 100, 50)
    expect(pos).toEqual({ x: 50, y: 0 })
  })

  it('returns right handle position', () => {
    const pos = getHandlePosition(Position.Right, 0, 0, 100, 50)
    expect(pos).toEqual({ x: 100, y: 25 })
  })

  it('returns bottom handle position', () => {
    const pos = getHandlePosition(Position.Bottom, 0, 0, 100, 50)
    expect(pos).toEqual({ x: 50, y: 50 })
  })

  it('returns left handle position', () => {
    const pos = getHandlePosition(Position.Left, 0, 0, 100, 50)
    expect(pos).toEqual({ x: 0, y: 25 })
  })
})

describe('getSmartHandlePositions', () => {
  it('auto-detects horizontal direction (right)', () => {
    const result = getSmartHandlePositions(
      { id: '1', position: { x: 0, y: 0 }, data: {} },
      { id: '2', position: { x: 300, y: 0 }, data: {} },
    )
    expect(result.sourcePosition).toBe(Position.Right)
    expect(result.targetPosition).toBe(Position.Left)
  })

  it('auto-detects horizontal direction (left)', () => {
    const result = getSmartHandlePositions(
      { id: '1', position: { x: 300, y: 0 }, data: {} },
      { id: '2', position: { x: 0, y: 0 }, data: {} },
    )
    expect(result.sourcePosition).toBe(Position.Left)
    expect(result.targetPosition).toBe(Position.Right)
  })

  it('auto-detects vertical direction (down)', () => {
    const result = getSmartHandlePositions(
      { id: '1', position: { x: 0, y: 0 }, data: {} },
      { id: '2', position: { x: 0, y: 300 }, data: {} },
    )
    expect(result.sourcePosition).toBe(Position.Bottom)
    expect(result.targetPosition).toBe(Position.Top)
  })

  it('auto-detects vertical direction (up)', () => {
    const result = getSmartHandlePositions(
      { id: '1', position: { x: 0, y: 300 }, data: {} },
      { id: '2', position: { x: 0, y: 0 }, data: {} },
    )
    expect(result.sourcePosition).toBe(Position.Top)
    expect(result.targetPosition).toBe(Position.Bottom)
  })

  it('uses configured source handles when available', () => {
    const result = getSmartHandlePositions(
      {
        id: '1',
        position: { x: 0, y: 0 },
        data: {},
        sourceHandles: [{ type: 'source', position: Position.Left }],
      },
      { id: '2', position: { x: 300, y: 0 }, data: {} },
    )
    expect(result.sourcePosition).toBe(Position.Left)
  })

  it('uses configured target handles when available', () => {
    const result = getSmartHandlePositions(
      { id: '1', position: { x: 0, y: 0 }, data: {} },
      {
        id: '2',
        position: { x: 300, y: 0 },
        data: {},
        targetHandles: [{ type: 'target', position: Position.Right }],
      },
    )
    expect(result.targetPosition).toBe(Position.Right)
  })
})

// ─── flowStyles ───────────────────────────────────────────────────────────

describe('flowStyles', () => {
  it('exports a non-empty CSS string', () => {
    expect(typeof flowStyles).toBe('string')
    expect(flowStyles.length).toBeGreaterThan(0)
    expect(flowStyles).toContain('.pyreon-flow-edge-animated')
    expect(flowStyles).toContain('.pyreon-flow-node')
    expect(flowStyles).toContain('.pyreon-flow-handle')
  })
})

// ─── Node Operations ──────────────────────────────────────────────────────

describe('node operations', () => {
  it('getNode returns the node by id', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    })
    const node = flow.getNode('1')
    expect(node).toBeDefined()
    expect(node!.data.label).toBe('A')
  })

  it('getNode returns undefined for missing node', () => {
    const flow = createFlow()
    expect(flow.getNode('missing')).toBeUndefined()
  })

  it('updateNode modifies node properties', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    })
    flow.updateNode('1', { data: { label: 'B' } })
    expect(flow.getNode('1')!.data.label).toBe('B')
  })

  it('updateNodePosition updates position', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    flow.updateNodePosition('1', { x: 100, y: 200 })
    expect(flow.getNode('1')!.position).toEqual({ x: 100, y: 200 })
  })

  it('updateNodePosition snaps to grid', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
      snapToGrid: true,
      snapGrid: 10,
    })
    flow.updateNodePosition('1', { x: 13, y: 17 })
    expect(flow.getNode('1')!.position).toEqual({ x: 10, y: 20 })
  })

  it('updateNodePosition clamps to extent', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, width: 50, height: 50, data: {} }],
      nodeExtent: [
        [0, 0],
        [200, 200],
      ],
    })
    flow.updateNodePosition('1', { x: -50, y: 300 })
    const pos = flow.getNode('1')!.position
    expect(pos.x).toBe(0)
    expect(pos.y).toBe(150)
  })
})

// ─── Edge Operations ──────────────────────────────────────────────────────

describe('edge operations', () => {
  it('getEdge returns the edge by id', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    expect(flow.getEdge('e1')).toBeDefined()
  })

  it('getEdge returns undefined for missing edge', () => {
    const flow = createFlow()
    expect(flow.getEdge('missing')).toBeUndefined()
  })

  it('addEdge generates id when not provided', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
    })
    flow.addEdge({ source: '1', target: '2' })
    expect(flow.edges()).toHaveLength(1)
    expect(flow.edges()[0]!.id).toBeDefined()
  })

  it('addEdge does not add duplicate edges', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
    })
    flow.addEdge({ id: 'e1', source: '1', target: '2' })
    flow.addEdge({ id: 'e1', source: '1', target: '2' })
    expect(flow.edges()).toHaveLength(1)
  })

  it('addEdge applies default edge type', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      defaultEdgeType: 'smoothstep',
    })
    flow.addEdge({ source: '1', target: '2' })
    expect(flow.edges()[0]!.type).toBe('smoothstep')
  })

  it('removeEdge removes an edge', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    flow.removeEdge('e1')
    expect(flow.edges()).toHaveLength(0)
  })

  it('removeEdge cleans up selected edge ids', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    flow.selectEdge('e1')
    flow.removeEdge('e1')
    expect(flow.selectedEdges()).toEqual([])
  })
})

// ─── Connection Validation ────────────────────────────────────────────────

describe('isValidConnection', () => {
  it('returns true when no rules are configured', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
    })
    expect(flow.isValidConnection({ source: '1', target: '2' })).toBe(true)
  })

  it('validates based on connection rules', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {}, type: 'input' },
        { id: '2', position: { x: 100, y: 0 }, data: {}, type: 'output' },
        { id: '3', position: { x: 200, y: 0 }, data: {}, type: 'process' },
      ],
      connectionRules: {
        input: { outputs: ['process'] },
      },
    })
    expect(flow.isValidConnection({ source: '1', target: '3' })).toBe(true)
    expect(flow.isValidConnection({ source: '1', target: '2' })).toBe(false)
  })

  it('returns false for missing source node', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
      connectionRules: { default: { outputs: ['default'] } },
    })
    expect(flow.isValidConnection({ source: 'missing', target: '1' })).toBe(false)
  })

  it('returns false for missing target node', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
      connectionRules: { default: { outputs: ['default'] } },
    })
    expect(flow.isValidConnection({ source: '1', target: 'missing' })).toBe(false)
  })

  it('returns true when no rule exists for source type', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {}, type: 'other' },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      connectionRules: { input: { outputs: ['process'] } },
    })
    expect(flow.isValidConnection({ source: '1', target: '2' })).toBe(true)
  })
})

// ─── Selection Operations (extended) ──────────────────────────────────────

describe('selection — extended', () => {
  it('clearSelection clears both nodes and edges', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    flow.selectNode('1')
    flow.selectEdge('e1', true)
    flow.clearSelection()
    expect(flow.selectedNodes()).toEqual([])
    expect(flow.selectedEdges()).toEqual([])
  })

  it('selectAll selects all nodes', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
        { id: '3', position: { x: 200, y: 0 }, data: {} },
      ],
    })
    flow.selectAll()
    expect(flow.selectedNodes().sort()).toEqual(['1', '2', '3'])
  })
})

// ─── Copy / Paste ─────────────────────────────────────────────────────────

describe('copy and paste', () => {
  it('copies selected nodes and pastes with offset', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 100, y: 0 }, data: { label: 'B' } },
      ],
      edges: [{ source: '1', target: '2' }],
    })

    flow.selectNode('1')
    flow.selectNode('2', true)
    flow.copySelected()
    flow.paste({ x: 50, y: 50 })

    expect(flow.nodes()).toHaveLength(4)
    // Pasted nodes should be selected
    expect(flow.selectedNodes()).toHaveLength(2)
  })

  it('paste does nothing when clipboard is empty', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    flow.paste()
    expect(flow.nodes()).toHaveLength(1)
  })

  it('copySelected does nothing when nothing is selected', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    flow.copySelected()
    flow.paste()
    expect(flow.nodes()).toHaveLength(1)
  })
})

// ─── Undo / Redo ──────────────────────────────────────────────────────────

describe('undo and redo', () => {
  it('undo restores previous state', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    flow.pushHistory()
    flow.addNode({ id: '2', position: { x: 100, y: 0 }, data: {} })
    expect(flow.nodes()).toHaveLength(2)
    flow.undo()
    expect(flow.nodes()).toHaveLength(1)
  })

  it('redo restores undone state', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    flow.pushHistory()
    flow.addNode({ id: '2', position: { x: 100, y: 0 }, data: {} })
    flow.undo()
    expect(flow.nodes()).toHaveLength(1)
    flow.redo()
    expect(flow.nodes()).toHaveLength(2)
  })

  it('undo with empty stack does nothing', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    flow.undo()
    expect(flow.nodes()).toHaveLength(1)
  })

  it('redo with empty stack does nothing', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    flow.redo()
    expect(flow.nodes()).toHaveLength(1)
  })

  it('pushHistory clears redo stack', () => {
    const flow = createFlow()
    flow.pushHistory()
    flow.addNode({ id: '1', position: { x: 0, y: 0 }, data: {} })
    flow.undo()
    // Now push a new history — redo should be cleared
    flow.pushHistory()
    flow.addNode({ id: '2', position: { x: 0, y: 0 }, data: {} })
    flow.redo()
    // Should not redo to the old state
    expect(flow.nodes()).toHaveLength(1) // only node '2'
  })
})

// ─── Move Selected Nodes ─────────────────────────────────────────────────

describe('moveSelectedNodes', () => {
  it('moves all selected nodes by delta', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 100 }, data: {} },
        { id: '3', position: { x: 200, y: 200 }, data: {} },
      ],
    })
    flow.selectNode('1')
    flow.selectNode('2', true)
    flow.moveSelectedNodes(10, 20)

    expect(flow.getNode('1')!.position).toEqual({ x: 10, y: 20 })
    expect(flow.getNode('2')!.position).toEqual({ x: 110, y: 120 })
    expect(flow.getNode('3')!.position).toEqual({ x: 200, y: 200 }) // unselected
  })

  it('does nothing when nothing is selected', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    flow.moveSelectedNodes(10, 10)
    expect(flow.getNode('1')!.position).toEqual({ x: 0, y: 0 })
  })
})

// ─── Snap Lines ───────────────────────────────────────────────────────────

describe('getSnapLines', () => {
  it('returns null snap lines when no nearby nodes', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 50, data: {} },
        { id: '2', position: { x: 500, y: 500 }, width: 100, height: 50, data: {} },
      ],
    })
    const snap = flow.getSnapLines('1', { x: 0, y: 0 })
    expect(snap.x).toBeNull()
    expect(snap.y).toBeNull()
  })

  it('snaps to center X of nearby node', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 50, data: {} },
        { id: '2', position: { x: 2, y: 200 }, width: 100, height: 50, data: {} },
      ],
    })
    // Node 1 at x=1 has center at 51, node 2 center at 52 — within threshold 5
    const snap = flow.getSnapLines('1', { x: 1, y: 0 })
    expect(snap.x).not.toBeNull()
  })

  it('snaps to left edge of nearby node', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 50, data: {} },
        { id: '2', position: { x: 2, y: 200 }, width: 100, height: 50, data: {} },
      ],
    })
    const snap = flow.getSnapLines('1', { x: 0, y: 0 })
    expect(snap.x).not.toBeNull()
  })

  it('returns snappedPosition for missing node', () => {
    const flow = createFlow()
    const snap = flow.getSnapLines('missing', { x: 10, y: 20 })
    expect(snap.snappedPosition).toEqual({ x: 10, y: 20 })
  })
})

// ─── Sub-flows / Groups ──────────────────────────────────────────────────

describe('sub-flows and groups', () => {
  it('getChildNodes returns children of a parent', () => {
    const flow = createFlow({
      nodes: [
        { id: 'group', position: { x: 0, y: 0 }, data: {}, group: true },
        { id: 'child1', position: { x: 10, y: 10 }, data: {}, parentId: 'group' },
        { id: 'child2', position: { x: 20, y: 20 }, data: {}, parentId: 'group' },
        { id: 'other', position: { x: 100, y: 100 }, data: {} },
      ],
    })
    expect(flow.getChildNodes('group')).toHaveLength(2)
  })

  it('getAbsolutePosition resolves nested positions', () => {
    const flow = createFlow({
      nodes: [
        { id: 'parent', position: { x: 100, y: 100 }, data: {} },
        { id: 'child', position: { x: 50, y: 50 }, data: {}, parentId: 'parent' },
      ],
    })
    const absPos = flow.getAbsolutePosition('child')
    expect(absPos).toEqual({ x: 150, y: 150 })
  })

  it('getAbsolutePosition returns node position for root nodes', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 42, y: 24 }, data: {} }],
    })
    expect(flow.getAbsolutePosition('1')).toEqual({ x: 42, y: 24 })
  })

  it('getAbsolutePosition returns {0,0} for missing node', () => {
    const flow = createFlow()
    expect(flow.getAbsolutePosition('missing')).toEqual({ x: 0, y: 0 })
  })
})

// ─── Edge Waypoints ──────────────────────────────────────────────────────

describe('edge waypoints', () => {
  it('addEdgeWaypoint adds a waypoint to an edge', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 200 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    flow.addEdgeWaypoint('e1', { x: 100, y: 50 })
    expect(flow.getEdge('e1')!.waypoints).toEqual([{ x: 100, y: 50 }])
  })

  it('addEdgeWaypoint inserts at specific index', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 200 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2', waypoints: [{ x: 0, y: 0 }] }],
    })
    flow.addEdgeWaypoint('e1', { x: 100, y: 50 }, 0)
    expect(flow.getEdge('e1')!.waypoints![0]).toEqual({ x: 100, y: 50 })
  })

  it('removeEdgeWaypoint removes a waypoint', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 200 }, data: {} },
      ],
      edges: [
        {
          id: 'e1',
          source: '1',
          target: '2',
          waypoints: [
            { x: 50, y: 50 },
            { x: 100, y: 100 },
          ],
        },
      ],
    })
    flow.removeEdgeWaypoint('e1', 0)
    expect(flow.getEdge('e1')!.waypoints).toEqual([{ x: 100, y: 100 }])
  })

  it('removeEdgeWaypoint removes waypoints property when empty', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 200 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2', waypoints: [{ x: 50, y: 50 }] }],
    })
    flow.removeEdgeWaypoint('e1', 0)
    expect(flow.getEdge('e1')!.waypoints).toBeUndefined()
  })

  it('updateEdgeWaypoint updates a waypoint position', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 200 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2', waypoints: [{ x: 50, y: 50 }] }],
    })
    flow.updateEdgeWaypoint('e1', 0, { x: 99, y: 99 })
    expect(flow.getEdge('e1')!.waypoints![0]).toEqual({ x: 99, y: 99 })
  })

  it('updateEdgeWaypoint ignores out-of-bounds index', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 200 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2', waypoints: [{ x: 50, y: 50 }] }],
    })
    flow.updateEdgeWaypoint('e1', 5, { x: 99, y: 99 })
    expect(flow.getEdge('e1')!.waypoints).toEqual([{ x: 50, y: 50 }])
  })
})

// ─── Edge Reconnecting ──────────────────────────────────────────────────

describe('reconnectEdge', () => {
  it('reconnects edge source', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
        { id: '3', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    flow.reconnectEdge('e1', { source: '3' })
    expect(flow.getEdge('e1')!.source).toBe('3')
  })

  it('reconnects edge target', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
        { id: '3', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    flow.reconnectEdge('e1', { target: '3' })
    expect(flow.getEdge('e1')!.target).toBe('3')
  })

  it('reconnects with handle ids', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    flow.reconnectEdge('e1', { sourceHandle: 'output-1', targetHandle: 'input-1' })
    expect(flow.getEdge('e1')!.sourceHandle).toBe('output-1')
    expect(flow.getEdge('e1')!.targetHandle).toBe('input-1')
  })
})

// ─── Proximity Connect ──────────────────────────────────────────────────

describe('getProximityConnection', () => {
  it('finds nearest unconnected node', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 50, height: 50, data: {} },
        { id: '2', position: { x: 30, y: 0 }, width: 50, height: 50, data: {} },
      ],
    })
    const conn = flow.getProximityConnection('1', 100)
    expect(conn).not.toBeNull()
    expect(conn!.target).toBe('2')
  })

  it('returns null when all nodes are too far', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 1000, y: 1000 }, data: {} },
      ],
    })
    expect(flow.getProximityConnection('1', 50)).toBeNull()
  })

  it('returns null for missing node', () => {
    const flow = createFlow()
    expect(flow.getProximityConnection('missing')).toBeNull()
  })

  it('skips already connected nodes', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 50, height: 50, data: {} },
        { id: '2', position: { x: 30, y: 0 }, width: 50, height: 50, data: {} },
      ],
      edges: [{ source: '1', target: '2' }],
    })
    expect(flow.getProximityConnection('1', 100)).toBeNull()
  })

  it('validates connection against rules', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 50, height: 50, data: {}, type: 'a' },
        { id: '2', position: { x: 30, y: 0 }, width: 50, height: 50, data: {}, type: 'b' },
      ],
      connectionRules: { a: { outputs: ['c'] } },
    })
    expect(flow.getProximityConnection('1', 100)).toBeNull()
  })
})

// ─── Collision Detection ────────────────────────────────────────────────

describe('collision detection', () => {
  it('getOverlappingNodes detects overlapping nodes', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 50, data: {} },
        { id: '2', position: { x: 50, y: 25 }, width: 100, height: 50, data: {} },
        { id: '3', position: { x: 500, y: 500 }, width: 100, height: 50, data: {} },
      ],
    })
    const overlapping = flow.getOverlappingNodes('1')
    expect(overlapping).toHaveLength(1)
    expect(overlapping[0]!.id).toBe('2')
  })

  it('getOverlappingNodes returns empty for non-overlapping', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 50, height: 50, data: {} },
        { id: '2', position: { x: 200, y: 200 }, width: 50, height: 50, data: {} },
      ],
    })
    expect(flow.getOverlappingNodes('1')).toHaveLength(0)
  })

  it('getOverlappingNodes returns empty for missing node', () => {
    const flow = createFlow()
    expect(flow.getOverlappingNodes('missing')).toEqual([])
  })

  it('resolveCollisions pushes overlapping nodes apart', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 50, data: {} },
        { id: '2', position: { x: 50, y: 25 }, width: 100, height: 50, data: {} },
      ],
    })
    const origPos = { ...flow.getNode('2')!.position }
    flow.resolveCollisions('1')
    const n2 = flow.getNode('2')!
    // Node 2 should have been pushed away in some direction
    const moved = n2.position.x !== origPos.x || n2.position.y !== origPos.y
    expect(moved).toBe(true)
  })

  it('resolveCollisions pushes in Y when overlap is greater in X', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 100, data: {} },
        { id: '2', position: { x: 10, y: 50 }, width: 100, height: 100, data: {} },
      ],
    })
    flow.resolveCollisions('1')
    // Should have moved in Y direction (less overlap)
    const n2 = flow.getNode('2')!
    expect(n2.position.y).not.toBe(50)
  })

  it('resolveCollisions does nothing when no overlap', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 50, height: 50, data: {} },
        { id: '2', position: { x: 200, y: 200 }, width: 50, height: 50, data: {} },
      ],
    })
    flow.resolveCollisions('1')
    expect(flow.getNode('2')!.position).toEqual({ x: 200, y: 200 })
  })

  it('resolveCollisions does nothing for missing node', () => {
    const flow = createFlow()
    // Should not throw
    flow.resolveCollisions('missing')
  })
})

// ─── Node Extent ─────────────────────────────────────────────────────────

describe('node extent', () => {
  it('clampToExtent clamps position within bounds', () => {
    const flow = createFlow({
      nodeExtent: [
        [0, 0],
        [500, 500],
      ],
    })
    const clamped = flow.clampToExtent({ x: -100, y: 600 }, 100, 50)
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBe(450) // 500 - 50
  })

  it('clampToExtent returns original when no extent', () => {
    const flow = createFlow()
    const pos = { x: -100, y: 600 }
    expect(flow.clampToExtent(pos)).toEqual(pos)
  })

  it('setNodeExtent changes clamping behavior', () => {
    const flow = createFlow()
    flow.setNodeExtent([
      [0, 0],
      [200, 200],
    ])
    const clamped = flow.clampToExtent({ x: 300, y: 300 }, 50, 50)
    expect(clamped.x).toBe(150)
    expect(clamped.y).toBe(150)
  })

  it('setNodeExtent(null) removes clamping', () => {
    const flow = createFlow({
      nodeExtent: [
        [0, 0],
        [100, 100],
      ],
    })
    flow.setNodeExtent(null)
    const pos = { x: 500, y: 500 }
    expect(flow.clampToExtent(pos)).toEqual(pos)
  })
})

// ─── Search / Filter ─────────────────────────────────────────────────────

describe('search and filter', () => {
  it('findNodes returns matching nodes', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {}, type: 'input' },
        { id: '2', position: { x: 100, y: 0 }, data: {}, type: 'output' },
        { id: '3', position: { x: 200, y: 0 }, data: {}, type: 'input' },
      ],
    })
    const inputs = flow.findNodes((n) => n.type === 'input')
    expect(inputs).toHaveLength(2)
  })

  it('searchNodes finds by label', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start Node' } },
        { id: '2', position: { x: 100, y: 0 }, data: { label: 'End Node' } },
        { id: '3', position: { x: 200, y: 0 }, data: { label: 'Process' } },
      ],
    })
    const results = flow.searchNodes('node')
    expect(results).toHaveLength(2)
  })

  it('searchNodes falls back to id when no label', () => {
    const flow = createFlow({
      nodes: [{ id: 'alpha', position: { x: 0, y: 0 }, data: {} }],
    })
    expect(flow.searchNodes('alpha')).toHaveLength(1)
  })
})

// ─── Export / Import ────────────────────────────────────────────────────

describe('export and import', () => {
  it('toJSON serializes state', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 42, y: 24 }, data: { label: 'test' } }],
      edges: [{ id: 'e1', source: '1', target: '1' }],
    })
    flow.zoomTo(2)
    const json = flow.toJSON()
    expect(json.nodes).toHaveLength(1)
    expect(json.edges).toHaveLength(1)
    expect(json.viewport.zoom).toBe(2)
  })

  it('fromJSON restores state', () => {
    const flow = createFlow()
    flow.fromJSON({
      nodes: [
        { id: 'a', position: { x: 10, y: 20 }, data: {} },
        { id: 'b', position: { x: 30, y: 40 }, data: {} },
      ],
      edges: [{ source: 'a', target: 'b' }],
      viewport: { x: 5, y: 10, zoom: 1.5 },
    })
    expect(flow.nodes()).toHaveLength(2)
    expect(flow.edges()).toHaveLength(1)
    expect(flow.viewport().zoom).toBe(1.5)
  })

  it('fromJSON without viewport preserves current viewport', () => {
    const flow = createFlow()
    flow.zoomTo(2)
    flow.fromJSON({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    })
    expect(flow.viewport().zoom).toBe(2)
  })
})

// ─── Listeners (extended) ────────────────────────────────────────────────

describe('listeners — extended', () => {
  it('onEdgeClick returns unsubscribe', () => {
    const flow = createFlow()
    const clicks: string[] = []
    const unsub = flow.onEdgeClick((e) => clicks.push(e.source))
    unsub()
    // No crash
  })

  it('onNodeClick returns unsubscribe', () => {
    const flow = createFlow()
    const clicks: string[] = []
    const unsub = flow.onNodeClick((n) => clicks.push(n.id))
    unsub()
  })

  it('onNodeDragStart and onNodeDragEnd return unsubscribe', () => {
    const flow = createFlow()
    const unsub1 = flow.onNodeDragStart(() => {})
    const unsub2 = flow.onNodeDragEnd(() => {})
    unsub1()
    unsub2()
  })

  it('onNodeDoubleClick returns unsubscribe', () => {
    const flow = createFlow()
    const unsub = flow.onNodeDoubleClick(() => {})
    unsub()
  })

  it('_emit fires nodeClick listener', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    const clicks: string[] = []
    flow.onNodeClick((n) => clicks.push(n.id))
    flow._emit.nodeClick(flow.getNode('1')!)
    expect(clicks).toEqual(['1'])
  })

  it('_emit fires edgeClick listener', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    const clicks: string[] = []
    flow.onEdgeClick((e) => clicks.push(e.id!))
    flow._emit.edgeClick(flow.getEdge('e1')!)
    expect(clicks).toEqual(['e1'])
  })

  it('_emit fires nodeDragStart and nodeDragEnd listeners', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    const starts: string[] = []
    const ends: string[] = []
    flow.onNodeDragStart((n) => starts.push(n.id))
    flow.onNodeDragEnd((n) => ends.push(n.id))
    flow._emit.nodeDragStart(flow.getNode('1')!)
    flow._emit.nodeDragEnd(flow.getNode('1')!)
    expect(starts).toEqual(['1'])
    expect(ends).toEqual(['1'])
  })

  it('_emit fires nodeDoubleClick listener', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
    })
    const clicks: string[] = []
    flow.onNodeDoubleClick((n) => clicks.push(n.id))
    flow._emit.nodeDoubleClick(flow.getNode('1')!)
    expect(clicks).toEqual(['1'])
  })
})

// ─── Dispose ──────────────────────────────────────────────────────────────

describe('dispose', () => {
  it('clears all listeners', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
    })
    const connections: string[] = []
    flow.onConnect((c) => connections.push(c.source))
    flow.dispose()
    flow.addEdge({ source: '1', target: '2' })
    expect(connections).toEqual([]) // listener was cleared
  })
})

// ─── Config options ──────────────────────────────────────────────────────

describe('config options', () => {
  it('fitView on init adjusts viewport', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, width: 100, height: 50, data: {} },
        { id: '2', position: { x: 500, y: 400 }, width: 100, height: 50, data: {} },
      ],
      fitView: true,
    })
    expect(flow.viewport().zoom).not.toBe(1)
  })

  it('edge handles are included in edge id generation', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 100, y: 0 }, data: {} },
      ],
    })
    flow.addEdge({ source: '1', target: '2', sourceHandle: 'a', targetHandle: 'b' })
    const edge = flow.edges()[0]!
    expect(edge.id).toContain('-a-')
    expect(edge.id).toContain('-b')
  })
})

// ─── focusNode ──────────────────────────────────────────────────────────

describe('focusNode', () => {
  it('selects the focused node', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 100, y: 100 }, width: 100, height: 50, data: {} }],
    })
    flow.focusNode('1')
    expect(flow.selectedNodes()).toEqual(['1'])
  })

  it('does nothing for missing node', () => {
    const flow = createFlow()
    flow.focusNode('missing') // should not throw
  })
})

// ─── Layout (with elkjs mock) ─────────────────────────────────────────────

vi.mock('elkjs/lib/elk.bundled.js', () => {
  const layout = vi.fn(async (graph: any) => ({
    children: graph.children.map((c: any, i: number) => ({
      id: c.id,
      x: i * 100,
      y: i * 50,
    })),
  }))

  return {
    default: class MockELK {
      layout = layout
    },
  }
})

describe('computeLayout', () => {
  it('computes positions for nodes using layered algorithm', async () => {
    const positions = await computeLayout(
      [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 0, y: 0 }, data: {} },
      ],
      [{ source: '1', target: '2' }],
      'layered',
    )
    expect(positions).toHaveLength(2)
    expect(positions[0]!.id).toBe('1')
    expect(positions[1]!.id).toBe('2')
  })

  it('supports direction option', async () => {
    const positions = await computeLayout(
      [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
      [],
      'layered',
      { direction: 'RIGHT' },
    )
    expect(positions).toHaveLength(1)
  })

  it('supports nodeSpacing option', async () => {
    const positions = await computeLayout(
      [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
      [],
      'layered',
      { nodeSpacing: 50 },
    )
    expect(positions).toHaveLength(1)
  })

  it('supports layerSpacing option', async () => {
    const positions = await computeLayout(
      [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
      [],
      'layered',
      { layerSpacing: 100 },
    )
    expect(positions).toHaveLength(1)
  })

  it('supports edgeRouting option', async () => {
    for (const routing of ['orthogonal', 'splines', 'polyline'] as const) {
      const positions = await computeLayout(
        [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
        [],
        'layered',
        { edgeRouting: routing },
      )
      expect(positions).toHaveLength(1)
    }
  })

  it('supports different algorithms', async () => {
    for (const algo of ['force', 'stress', 'tree', 'radial', 'box', 'rectpacking'] as const) {
      const positions = await computeLayout(
        [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
        [],
        algo,
      )
      expect(positions).toHaveLength(1)
    }
  })

  it('uses node width/height or defaults', async () => {
    const positions = await computeLayout(
      [
        { id: '1', position: { x: 0, y: 0 }, width: 200, height: 100, data: {} },
        { id: '2', position: { x: 0, y: 0 }, data: {} }, // defaults
      ],
      [],
    )
    expect(positions).toHaveLength(2)
  })

  it('uses edge id or generates one', async () => {
    const positions = await computeLayout(
      [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 0, y: 0 }, data: {} },
      ],
      [
        { id: 'e1', source: '1', target: '2' },
        { source: '2', target: '1' }, // no id
      ],
    )
    expect(positions).toHaveLength(2)
  })
})

describe('computeLayout — silent-option dev warnings', () => {
  // Verifies the runtime warning for `LayoutOptions` fields that ELK
  // namespaces under specific algorithms (`direction`, `layerSpacing`,
  // `edgeRouting`). The empirically-verified applicability table:
  //
  //                  layered tree  force stress radial box rectpacking
  //   direction        ✅    ✅    ❌    ❌      ❌    ❌    ❌
  //   nodeSpacing      ✅    ✅    ✅    ✅      ✅    ✅    ✅
  //   layerSpacing     ✅    ❌    ❌    ❌      ❌    ❌    ❌
  //   edgeRouting      ✅    ❌    ❌    ❌      ❌    ❌    ❌
  //
  // The dev warning catches mistakes that would otherwise be silent —
  // a user setting `direction: 'RIGHT'` on a force layout currently
  // gets a layout that ignores their direction without any feedback.

  const node = { id: '1', position: { x: 0, y: 0 }, data: {} }

  it('warns when direction is set on a force layout', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await computeLayout([node], [], 'force', { direction: 'RIGHT' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/direction.*silently ignored.*force/)
    expect(warn.mock.calls[0]?.[0]).toMatch(/layered.*tree/)
    warn.mockRestore()
  })

  it('warns when layerSpacing is set on a tree layout (tree only respects nodeSpacing)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await computeLayout([node], [], 'tree', { layerSpacing: 100 })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/layerSpacing.*silently ignored.*tree/)
    warn.mockRestore()
  })

  it('warns when edgeRouting is set on a radial layout', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await computeLayout([node], [], 'radial', { edgeRouting: 'splines' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/edgeRouting.*silently ignored.*radial/)
    warn.mockRestore()
  })

  it('does NOT warn when direction is set on a layered layout (it applies)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await computeLayout([node], [], 'layered', { direction: 'RIGHT' })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does NOT warn when direction is set on a tree layout (it applies)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await computeLayout([node], [], 'tree', { direction: 'DOWN' })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does NOT warn when nodeSpacing is set on any algorithm (universally applies)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const algo of [
      'layered',
      'tree',
      'force',
      'stress',
      'radial',
      'box',
      'rectpacking',
    ] as const) {
      await computeLayout([node], [], algo, { nodeSpacing: 100 })
    }
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('emits multiple warnings if multiple ignored options are set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await computeLayout([node], [], 'force', {
      direction: 'RIGHT',
      layerSpacing: 100,
      edgeRouting: 'splines',
    })
    expect(warn).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })

  it('does NOT warn when an ignored option is undefined (only set values are checked)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await computeLayout([node], [], 'force', { nodeSpacing: 50 })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('warnIgnoredOptions — gate pattern regression', () => {
  // The whole reason `warnIgnoredOptions` exists is to fire IN A
  // BROWSER VITE DEV BUILD where users actually call `flow.layout()`.
  //
  // The first attempt at this gate used `typeof process !==
  // 'undefined' && process.env.NODE_ENV !== 'production'` — which
  // works in vitest (where `process` exists) but is **dead code in
  // a real browser bundle** because Vite does not polyfill
  // `process`. The bug was invisible: the unit tests passed (vitest
  // has `process`), but in production users got no warning at all.
  //
  // The fix uses `import.meta.env.DEV` — the Vite/Rolldown standard,
  // literal-replaced at build time, independent of `process`. The
  // bundler folds the gate to a literal in prod and tree-shakes the
  // warning helper to zero bytes; in dev it stays live.
  //
  // We can't write a runtime test that simulates "browser without
  // process" because vitest's own `import.meta.env` implementation
  // depends on `process` (deleting `process` breaks the FIXED gate
  // too — not because the gate is wrong, but because vitest can't
  // resolve `import.meta.env` after `process` is gone). So this
  // suite tests the property at TWO levels:
  //
  //   1. Source-pattern level: assert that the `warnIgnoredOptions`
  //      function uses `import.meta.env.DEV` and does NOT contain
  //      `typeof process` in its body. Catches a regression where
  //      someone "matches the rest of the codebase" and switches
  //      back to the broken pattern.
  //
  //   2. Bundle level: feed `layout.ts` to esbuild with the same
  //      defines Vite uses, and assert the prod bundle has the
  //      warning text tree-shaken out. Catches a regression where
  //      the gate is rewritten in a way that the minifier can't
  //      fold to a literal.

  it('warnIgnoredOptions function source uses import.meta.env.DEV, not typeof process', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')

    const layoutPath = path.resolve(import.meta.dirname, '../layout.ts')
    const source = fs.readFileSync(layoutPath, 'utf-8')

    // Extract the warnIgnoredOptions function body. The function
    // declaration plus everything up to and including its closing
    // brace at column 0.
    const fnMatch = source.match(
      /function warnIgnoredOptions\([^)]*\): void \{[\s\S]*?^\}/m,
    )
    expect(fnMatch, 'warnIgnoredOptions function should exist in layout.ts').toBeTruthy()
    const rawFnBody = fnMatch![0]

    // Strip comments before pattern-matching — the explanatory
    // comment legitimately mentions `typeof process` to document
    // why we don't use that pattern, and we don't want a comment
    // to make the test pass or fail. Only the executable code
    // should be checked.
    const fnCode = rawFnBody
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/^\s*\/\/.*$/gm, '') // line comments

    // The gate MUST use Vite's `import.meta.env.DEV`, which is
    // literal-replaced at build time and fires in real browser
    // bundles.
    expect(fnCode, 'warnIgnoredOptions must gate on import.meta.env.DEV').toMatch(
      /import\.meta\.env\??\.DEV/,
    )

    // The gate MUST NOT contain `typeof process`, which is dead
    // code in a Vite browser bundle (Vite does not polyfill
    // `process`). If this assertion fails, someone reverted the
    // gate and the warning is silent in production browsers.
    expect(fnCode, 'warnIgnoredOptions gate must not depend on `process`').not.toMatch(
      /typeof\s+process\s*!==\s*['"]undefined['"]/,
    )
    expect(fnCode, 'warnIgnoredOptions gate must not use `process.env`').not.toMatch(
      /process\.env/,
    )
  })

  it('layout.ts produces a tree-shaken prod bundle (esbuild + Vite-realistic defines)', async () => {
    // Bundle layout.ts via esbuild — the same transformer Vite
    // uses internally — with the defines a real Vite production
    // build would inject. Assert the warning text is gone from the
    // output and the prod bundle is smaller than the dev bundle
    // (proves the dead-code elimination worked).
    const esbuild = await import('esbuild')
    const fs = await import('node:fs')
    const path = await import('node:path')

    const layoutPath = path.resolve(import.meta.dirname, '../layout.ts')
    const layoutSource = fs.readFileSync(layoutPath, 'utf-8')

    // Stub the elkjs dynamic import so the bundle is self-contained.
    const harness = layoutSource.replace(
      "import('elkjs/lib/elk.bundled.js')",
      "Promise.resolve({ default: class { layout(g){ return Promise.resolve({children:[]}) } } })",
    )

    async function bundle(mode: 'dev' | 'prod') {
      const result = await esbuild.build({
        stdin: { contents: harness, loader: 'ts', resolveDir: path.dirname(layoutPath) },
        bundle: true,
        format: 'esm',
        write: false,
        minify: true, // Vite prod minifies — match its behaviour
        treeShaking: true,
        define: {
          'import.meta.env.DEV': mode === 'dev' ? 'true' : 'false',
          'process.env.NODE_ENV': mode === 'dev' ? '"development"' : '"production"',
        },
      })
      return result.outputFiles[0]!.text
    }

    const prodCode = await bundle('prod')
    const devCode = await bundle('dev')

    // PROD: warning must be tree-shaken to nothing.
    expect(prodCode).not.toContain('silently ignored')
    expect(prodCode).not.toContain('[Pyreon] flow.layout')

    // DEV: warning must be present and reachable.
    expect(devCode).toContain('silently ignored')
    expect(devCode).toContain('[Pyreon] flow.layout')

    // Sanity: the dev bundle is bigger because it carries the
    // warning helper code. If they're the same size, something is
    // off (e.g. esbuild not honouring the define and folding both
    // sides to the same output).
    expect(devCode.length).toBeGreaterThan(prodCode.length)
  })
})

describe('flow.layout', () => {
  it('applies layout without animation', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [{ source: '1', target: '2' }],
    })
    await flow.layout('layered', { animate: false })
    // Positions should have been updated
    const n1 = flow.getNode('1')!
    const n2 = flow.getNode('2')!
    expect(n1.position.x !== n2.position.x || n1.position.y !== n2.position.y).toBe(true)
  })
})

// ─── resolveCollisions X-branch ──────────────────────────────────────────

describe('collision detection — default dimensions', () => {
  it('getOverlappingNodes uses default width/height when not specified', () => {
    // Nodes without width/height should default to 150x40
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} }, // default 150x40
        { id: '2', position: { x: 100, y: 20 }, data: {} }, // overlaps with default dims
      ],
    })
    const overlapping = flow.getOverlappingNodes('1')
    expect(overlapping).toHaveLength(1)
  })

  it('resolveCollisions uses default width/height for node and other', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} }, // no explicit width/height
        { id: '2', position: { x: 100, y: 20 }, data: {} }, // overlapping
      ],
    })
    flow.resolveCollisions('1')
    // Should not throw, node 2 should have moved
    const n2 = flow.getNode('2')!
    expect(n2.position.x !== 100 || n2.position.y !== 20).toBe(true)
  })
})

describe('resolveCollisions — X overlap branch with node to the right', () => {
  it('pushes in X when node.x > other.x and overlapX < overlapY', () => {
    // node 1 is to the RIGHT of node 2, overlap is primarily horizontal
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 80, y: 0 }, width: 100, height: 200, data: {} },
        { id: '2', position: { x: 0, y: 0 }, width: 100, height: 200, data: {} },
      ],
    })
    const origX = flow.getNode('2')!.position.x
    flow.resolveCollisions('1')
    // Node 2 should be pushed left (since node 1 is to the right)
    expect(flow.getNode('2')!.position.x).not.toBe(origX)
  })
})

// ─── SmoothStep edge branches ────────────────────────────────────────────

describe('getSmoothStepPath — branch coverage', () => {
  it('handles source=Left (negative offset) to target=Top', () => {
    const result = getSmoothStepPath({
      sourceX: 200,
      sourceY: 100,
      sourcePosition: Position.Left,
      targetX: 0,
      targetY: 0,
      targetPosition: Position.Top,
    })
    expect(result.path).toContain('M200,100')
  })

  it('handles source=Top to target=Right (cornerY < sY)', () => {
    const result = getSmoothStepPath({
      sourceX: 0,
      sourceY: 200,
      sourcePosition: Position.Right,
      targetX: 200,
      targetY: 0,
      targetPosition: Position.Top,
    })
    expect(result.path).toContain('M0,200')
  })

  it('handles source=Bottom to target=Left (cornerX < sX)', () => {
    const result = getSmoothStepPath({
      sourceX: 200,
      sourceY: 0,
      sourcePosition: Position.Bottom,
      targetX: 0,
      targetY: 200,
      targetPosition: Position.Left,
    })
    expect(result.path).toContain('M200,0')
  })

  it('horizontal to vertical with tX < sX', () => {
    const result = getSmoothStepPath({
      sourceX: 200,
      sourceY: 100,
      sourcePosition: Position.Right,
      targetX: 0,
      targetY: 200,
      targetPosition: Position.Bottom,
    })
    expect(result.path).toContain('M200,100')
  })

  it('vertical to horizontal with tY < sY', () => {
    const result = getSmoothStepPath({
      sourceX: 100,
      sourceY: 200,
      sourcePosition: Position.Bottom,
      targetX: 200,
      targetY: 0,
      targetPosition: Position.Right,
    })
    expect(result.path).toContain('M100,200')
  })

  it('source=Top position gives negative sourceOffsetY', () => {
    const result = getSmoothStepPath({
      sourceX: 100,
      sourceY: 100,
      sourcePosition: Position.Top,
      targetX: 200,
      targetY: 200,
      targetPosition: Position.Bottom,
    })
    expect(result.path).toContain('M100,100')
  })

  it('target=Bottom gives positive targetOffsetY', () => {
    const result = getSmoothStepPath({
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Right,
      targetX: 200,
      targetY: 200,
      targetPosition: Position.Bottom,
    })
    expect(result.path).toContain('M0,0')
  })

  it('target=Right gives positive targetOffsetX', () => {
    const result = getSmoothStepPath({
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Bottom,
      targetX: 200,
      targetY: 200,
      targetPosition: Position.Right,
    })
    expect(result.path).toContain('M0,0')
  })
})

// ─── Layout animated path ────────────────────────────────────────────────

describe('focusNode — branch coverage', () => {
  it('uses custom zoom when provided', () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0)

    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 100, y: 100 }, data: {} }], // no width/height → defaults
    })
    flow.focusNode('1', 2)
    expect(flow.selectedNodes()).toEqual(['1'])

    vi.restoreAllMocks()
  })

  it('uses explicit width/height when set', () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0)

    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, width: 200, height: 100, data: {} }],
    })
    flow.focusNode('1')
    expect(flow.selectedNodes()).toEqual(['1'])

    vi.restoreAllMocks()
  })
})

describe('animateViewport — branch coverage', () => {
  it('animates viewport with partial target (only zoom)', () => {
    const rafCalls: FrameRequestCallback[] = []
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCalls.push(cb)
      return rafCalls.length
    })

    const flow = createFlow()
    flow.animateViewport({ zoom: 2 })
    expect(rafCalls.length).toBeGreaterThanOrEqual(1)

    // Execute frame at t=1 (complete)
    if (rafCalls[0]) {
      rafCalls[0](performance.now() + 500)
    }

    vi.restoreAllMocks()
  })

  it('animates viewport and continues when t < 1', () => {
    const rafCalls: FrameRequestCallback[] = []
    const startTime = performance.now()

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCalls.push(cb)
      return rafCalls.length
    })

    const flow = createFlow()
    flow.animateViewport({ x: 100, y: 100, zoom: 2 }, 1000)

    // First frame at t=0 (incomplete — should trigger another rAF)
    if (rafCalls[0]) {
      rafCalls[0](startTime) // t=0, will request another frame
    }
    // Should have added another rAF call
    expect(rafCalls.length).toBeGreaterThanOrEqual(2)

    vi.restoreAllMocks()
  })
})

describe('flow.layout — animated path', () => {
  it('triggers requestAnimationFrame for animated layout', async () => {
    const rafCalls: FrameRequestCallback[] = []
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCalls.push(cb)
      return rafCalls.length
    })

    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [{ source: '1', target: '2' }],
    })

    await flow.layout('layered', { animate: true, animationDuration: 100 })

    // Should have called requestAnimationFrame at least once
    expect(rafCalls.length).toBeGreaterThanOrEqual(1)

    // Execute the first frame callback to exercise the animation code
    if (rafCalls[0]) {
      rafCalls[0](performance.now() + 200) // simulate time past duration
    }

    vi.restoreAllMocks()
  })
})
