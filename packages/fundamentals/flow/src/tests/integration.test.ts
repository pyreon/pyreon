import { effect } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { createFlow } from '../flow'

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
