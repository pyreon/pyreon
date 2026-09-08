/**
 * P1 (2026-09 flow audit): a node measurement is an O(1) in-place write with
 * a forced notify — not a copy of the whole measurements Map per node — and
 * `getNode` reads the id map instead of scanning the node array.
 */
import { describe, expect, it, vi } from 'vitest'
import { createFlow } from '../flow'

describe('measurement writes', () => {
  it('keep the Map identity and still notify subscribers (set and clear)', () => {
    // Bisect: revert _setNodeMeasurement to `new Map(cur)` → identity changes.
    const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }] })
    const before = flow.measurements.peek()
    const sub = vi.fn()
    flow.measurements.subscribe(sub)
    flow._setNodeMeasurement('a', 120, 50)
    expect(flow.measurements.peek()).toBe(before)
    expect(flow.measurements.peek().get('a')).toEqual({ width: 120, height: 50 })
    expect(sub).toHaveBeenCalledTimes(1)
    flow._setNodeMeasurement('a', 120, 50) // unchanged → no notify
    expect(sub).toHaveBeenCalledTimes(1)
    flow._clearNodeMeasurement('a')
    expect(flow.measurements.peek()).toBe(before)
    expect(flow.measurements.peek().has('a')).toBe(false)
    expect(sub).toHaveBeenCalledTimes(2)
    // Geometry that read the measurement re-derives: an edge anchor moves
    // when the node's measured width lands.
    flow.addNode({ id: 'b', position: { x: 300, y: 0 }, data: {} })
    flow.addEdge({ id: 'ab', source: 'a', target: 'b' })
    const g0 = flow._edgeGeometry('ab')()!
    flow._setNodeMeasurement('a', 200, 40)
    const g1 = flow._edgeGeometry('ab')()!
    expect(g1.sourceX).toBe(200)
    expect(g0.sourceX).toBe(150)
    flow.dispose()
  })

  it('getNode resolves through the id map (live after add/remove/update)', () => {
    const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }] })
    expect(flow.getNode('a')?.id).toBe('a')
    expect(flow.getNode('zzz')).toBeUndefined()
    flow.addNode({ id: 'b', position: { x: 1, y: 1 }, data: {} })
    expect(flow.getNode('b')?.position).toEqual({ x: 1, y: 1 })
    flow.updateNode('b', { position: { x: 5, y: 5 } })
    expect(flow.getNode('b')?.position).toEqual({ x: 5, y: 5 })
    flow.removeNode('a')
    expect(flow.getNode('a')).toBeUndefined()
    flow.dispose()
  })
})
