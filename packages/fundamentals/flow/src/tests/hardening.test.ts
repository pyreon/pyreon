/**
 * Instance-level hardening (audit 2026-09): sub-flow removal, clipboard parent
 * remapping, fromJSON validation, toJSON with non-cloneable data, the
 * gesture-only `onConnect`, per-id measurement gating, O(1) `getEdge`, the
 * no-op `updateNode` on an unknown id, and the configurable history limit.
 */
import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFlow } from '../flow'
import type { FlowEdge, FlowNode } from '../types'

const n = (id: string, x = 0, y = 0, parentId?: string): FlowNode =>
  ({ id, position: { x, y }, data: {}, ...(parentId ? { parentId } : {}) }) as FlowNode

afterEach(() => {
  vi.restoreAllMocks()
})

describe('removeNodes / deleteSelected cascade into sub-flow descendants', () => {
  function subflow() {
    return createFlow({
      nodes: [n('group'), n('child', 10, 10, 'group'), n('grand', 5, 5, 'child'), n('other', 500)],
      edges: [
        { id: 'e-grand', source: 'grand', target: 'other' },
        { id: 'e-free', source: 'other', target: 'other' },
      ],
    })
  }

  it('removing a parent removes every descendant and their edges', () => {
    const flow = subflow()
    const deleted: string[] = []
    flow.onNodesDelete((list) => deleted.push(...list.map((x) => x.id)))
    flow.removeNode('group')
    expect(flow.nodes().map((x) => x.id)).toEqual(['other'])
    expect(flow.edges().map((e) => e.id)).toEqual(['e-free'])
    expect(deleted.sort()).toEqual(['child', 'grand', 'group'])
  })

  it('deleteSelected on a parent takes its descendants too', () => {
    const flow = subflow()
    flow.selectNode('group')
    flow.deleteSelected()
    expect(flow.nodes().map((x) => x.id)).toEqual(['other'])
    expect(flow.edges().map((e) => e.id)).toEqual(['e-free'])
  })

  it('a parent cycle does not loop forever', () => {
    const flow = createFlow({ nodes: [n('a', 0, 0, 'b'), n('b', 0, 0, 'a'), n('c')] })
    flow.removeNode('a')
    expect(flow.nodes().map((x) => x.id)).toEqual(['c'])
  })
})

describe('paste remaps sub-flow parents', () => {
  it('a copied parent+child keeps the child inside the COPIED parent, offset once', () => {
    const flow = createFlow({ nodes: [n('group', 100, 100), n('child', 10, 20, 'group')] })
    flow.selectNodes(['group', 'child'])
    flow.copySelected()
    flow.paste({ x: 50, y: 50 })
    const pasted = flow.nodes().slice(2)
    const group = pasted.find((x) => x.id.startsWith('group-copy'))!
    const child = pasted.find((x) => x.id.startsWith('child-copy'))!
    expect(child.parentId).toBe(group.id)
    // Relative position is NOT offset — it moves with the offset parent.
    expect(child.position).toEqual({ x: 10, y: 20 })
    expect(group.position).toEqual({ x: 150, y: 150 })
  })

  it('a child copied without its parent keeps the original parent and is offset', () => {
    const flow = createFlow({ nodes: [n('group', 100, 100), n('child', 10, 20, 'group')] })
    flow.selectNodes(['child'])
    flow.copySelected()
    flow.paste({ x: 5, y: 5 })
    const child = flow.nodes()[2]!
    expect(child.parentId).toBe('group')
    expect(child.position).toEqual({ x: 15, y: 25 })
  })

  it('pasting is one undo step and does not fire onConnect', () => {
    const flow = createFlow({
      nodes: [n('a'), n('b', 200)],
      edges: [{ id: 'ab', source: 'a', target: 'b' }],
    })
    const connect = vi.fn()
    flow.onConnect(connect)
    flow.selectNodes(['a', 'b'])
    flow.copySelected()
    flow.paste()
    expect(flow.nodes()).toHaveLength(4)
    expect(flow.edges()).toHaveLength(2)
    expect(connect).not.toHaveBeenCalled()
    flow.undo()
    expect(flow.nodes()).toHaveLength(2)
    expect(flow.edges()).toHaveLength(1)
  })
})

describe('onConnect is a user-gesture event', () => {
  it('programmatic addEdge / addEdges do not fire onConnect', () => {
    const flow = createFlow({ nodes: [n('a'), n('b', 200)] })
    const connect = vi.fn()
    flow.onConnect(connect)
    flow.addEdge({ source: 'a', target: 'b' })
    flow.addEdges([{ source: 'b', target: 'a' }])
    expect(flow.edges()).toHaveLength(2)
    expect(connect).not.toHaveBeenCalled()
  })

  it('the renderer-side _emit.connect reaches the listeners', () => {
    const flow = createFlow({ nodes: [n('a'), n('b', 200)] })
    const connect = vi.fn()
    const off = flow.onConnect(connect)
    flow._emit.connect({ source: 'a', target: 'b' })
    expect(connect).toHaveBeenCalledWith({ source: 'a', target: 'b' })
    off()
    flow._emit.connect({ source: 'a', target: 'b' })
    expect(connect).toHaveBeenCalledTimes(1)
  })
})

describe('fromJSON validates and normalizes', () => {
  it('drops duplicate node ids, dangling edges and duplicate edge ids, defaults a missing position', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flow = createFlow({})
    flow.fromJSON({
      nodes: [
        n('a'),
        { ...n('a', 99, 99) },
        { id: 'nopos', data: {} } as unknown as FlowNode,
        n('b', 200),
      ],
      edges: [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'ab', source: 'b', target: 'a' },
        { id: 'dangle', source: 'a', target: 'ghost' },
      ],
    })
    expect(flow.nodes().map((x) => x.id)).toEqual(['a', 'nopos', 'b'])
    expect(flow.getNode('a')!.position).toEqual({ x: 0, y: 0 })
    expect(flow.getNode('nopos')!.position).toEqual({ x: 0, y: 0 })
    expect(flow.edges().map((e) => `${e.id}:${e.source}->${e.target}`)).toEqual(['ab:a->b'])
    const messages = warn.mock.calls.map((c) => String(c[0]))
    expect(messages.some((m) => m.startsWith('[Pyreon]') && m.includes('"a"'))).toBe(true)
    expect(messages.some((m) => m.includes('ghost'))).toBe(true)
    expect(messages.some((m) => m.includes('nopos'))).toBe(true)
    // fitView must not crash on the normalized graph.
    flow.containerSize.set({ width: 800, height: 600 })
    expect(() => flow.fitView()).not.toThrow()
    expect(Number.isFinite(flow.viewport().x)).toBe(true)
  })

  it('tolerates a payload with missing arrays', () => {
    const flow = createFlow({ nodes: [n('a')] })
    flow.fromJSON({} as never)
    expect(flow.nodes()).toEqual([])
    expect(flow.edges()).toEqual([])
  })
})

describe('toJSON with non-cloneable data', () => {
  it('does not throw on a function in node or edge data, and copies the containers', () => {
    const onClick = () => 1
    const flow = createFlow({
      nodes: [{ id: 'a', position: { x: 1, y: 2 }, data: { onClick } }, n('b')] as FlowNode[],
      edges: [{ id: 'ab', source: 'a', target: 'b', data: { fn: onClick } } as FlowEdge],
    })
    const json = flow.toJSON()
    expect(json.nodes[0]!.data).toEqual({ onClick })
    expect(json.nodes[0]).not.toBe(flow.getNode('a'))
    json.nodes[0]!.position.x = 500
    expect(flow.getNode('a')!.position.x).toBe(1)
    expect(json.edges[0]).not.toBe(flow.getEdge('ab'))
  })
})

describe('measurement gating', () => {
  it('measuring one node does not re-derive the geometry of an unrelated edge', () => {
    const flow = createFlow({
      nodes: [n('a'), n('b', 200), n('c', 0, 200), n('d', 200, 200)],
      edges: [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'cd', source: 'c', target: 'd' },
      ],
    })
    let runs = 0
    const e = effect(() => {
      flow._edgeGeometry('cd')()
      runs++
    })
    expect(runs).toBe(1)
    flow._setNodeMeasurement('a', 120, 60)
    flow._setNodeMeasurement('b', 120, 60)
    expect(runs).toBe(1)
    flow._setNodeMeasurement('c', 120, 60)
    expect(runs).toBe(2)
    flow._clearNodeMeasurement('a')
    expect(runs).toBe(2)
    e.dispose()
  })
})

describe('edge / node lookups', () => {
  it('getEdge resolves through the id map', () => {
    const flow = createFlow({
      nodes: [n('a'), n('b', 200)],
      edges: [{ id: 'ab', source: 'a', target: 'b' }],
    })
    expect(flow.getEdge('ab')!.source).toBe('a')
    expect(flow.getEdge('missing')).toBeUndefined()
  })

  it('updateNode patches only the target index and is a no-op for an unknown id', () => {
    const flow = createFlow({ nodes: [n('a'), n('b', 200)] })
    const before = flow.nodes()
    const bNode = before[1]
    flow.updateNode('ghost', { position: { x: 9, y: 9 } })
    expect(flow.nodes()).toBe(before)
    flow.updateNode('a', { position: { x: 9, y: 9 } })
    expect(flow.nodes()).not.toBe(before)
    expect(flow.getNode('a')!.position).toEqual({ x: 9, y: 9 })
    expect(flow.nodes()[1]).toBe(bNode)
  })
})

describe('historyLimit', () => {
  it('defaults to 50 and honors a configured limit', () => {
    const small = createFlow({ nodes: [], historyLimit: 3 })
    for (let i = 0; i < 6; i++) small.addNode(n(`n${i}`))
    for (let i = 0; i < 10; i++) small.undo()
    // 3 checkpoints kept → 3 of the 6 additions undone.
    expect(small.nodes()).toHaveLength(3)

    const dflt = createFlow({ nodes: [] })
    for (let i = 0; i < 60; i++) dflt.addNode(n(`n${i}`))
    for (let i = 0; i < 100; i++) dflt.undo()
    expect(dflt.nodes()).toHaveLength(10)
  })
})
