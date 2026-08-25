/**
 * P6 — selection-change fan-out is O(changed), not O(N)/O(N²).
 *
 * Two stacked bugs:
 *   1. Each node/edge `isSelected` thunk did `selectedNodes().includes(id)` —
 *      an O(N) array scan per thunk, O(N²) per selection change.
 *   2. Even with an O(1) Set read, the selection Set is ONE signal — every
 *      selection change still re-ran all N nodes' selected thunks (and their
 *      DOM writes). The per-id `_nodeSelected` / `_edgeSelected` computeds
 *      (`{ equals: Object.is }`, the `_nodeById` gate shape) re-notify ONLY
 *      the ids whose membership flipped.
 *   3. The rubber-band commit did `clearSelection()` + one additive
 *      `selectNode` per hit — each additive call copies the whole Set, so a
 *      K-node band was O(K²). `selectNodes(ids)` is one Set build + notify.
 *
 * Bisect: revert `isNodeSelected` to `selectedNodeIds().has(id)` (bare Set
 * read, no per-id gate) → the O(changed) fan-out spec fails (every node's
 * thunk re-runs). Revert the component to `selectedNodes().includes(id)` →
 * same failure. Remove `selectNodes` → the bulk-equivalence specs fail to
 * compile/run.
 */
import { h, type VNodeChild } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'
import type { NodeComponentProps } from '../types'

const N = 40

function makeFlow() {
  return createFlow({
    nodes: Array.from({ length: N }, (_, i) => ({
      id: 'n' + i,
      position: { x: (i % 8) * 200, y: Math.floor(i / 8) * 120 },
      data: {},
    })),
  })
}

describe('selection fan-out (P6)', () => {
  let cleanups: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanups) c()
    cleanups = []
  })

  it('a selection change re-runs O(changed) selected-thunks, not O(N)', () => {
    const flow = makeFlow()
    const runs = new Map<string, number>()
    // The custom node's text thunk reads `selected()` — the same accessor
    // every built-in class/style thunk uses. Counting its runs counts the
    // selection fan-out.
    const CountingNode = (props: NodeComponentProps): VNodeChild => {
      return h('span', {}, (() => {
        runs.set(props.id, (runs.get(props.id) ?? 0) + 1)
        return props.selected() ? 'S' : 'U'
      }) as unknown as VNodeChild)
    }
    const { cleanup } = mountReactive(
      h(Flow, { instance: flow, nodeTypes: { default: CountingNode } }),
    )
    cleanups.push(cleanup)
    runs.clear()

    flow.selectNode('n3')
    // Only n3's membership flipped → only n3's thunk re-ran.
    expect(runs.get('n3')).toBe(1)
    const others = [...runs.entries()].filter(([id]) => id !== 'n3')
    expect(others).toEqual([])

    runs.clear()
    flow.selectNode('n7') // deselects n3, selects n7
    expect(runs.get('n7')).toBe(1)
    expect(runs.get('n3')).toBe(1)
    const rest = [...runs.entries()].filter(([id]) => id !== 'n3' && id !== 'n7')
    expect(rest).toEqual([])
    flow.dispose()
  })

  it('selectNodes(ids) produces the same net state as clearSelection + additive loop', () => {
    const a = makeFlow()
    const b = makeFlow()
    const ids = ['n1', 'n5', 'n9']
    // Legacy shape
    a.selectEdge('nonexistent-edge') // ensure edge selection gets cleared too
    a.clearSelection()
    for (const id of ids) a.selectNode(id, true)
    // Bulk
    b.selectEdge('nonexistent-edge')
    b.selectNodes(ids)
    expect([...a.selectedNodes()].sort()).toEqual([...b.selectedNodes()].sort())
    expect(a.selectedEdges()).toEqual(b.selectedEdges())
    expect(b.selectedEdges()).toEqual([])
    a.dispose()
    b.dispose()
  })

  it('selectNodes additive=true merges into the existing selection', () => {
    const flow = makeFlow()
    flow.selectNode('n0')
    flow.selectNodes(['n1', 'n2'], true)
    expect([...flow.selectedNodes()].sort()).toEqual(['n0', 'n1', 'n2'])
    flow.dispose()
  })

  it('isNodeSelected / isEdgeSelected answer reactively and O(1)', () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 10, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    })
    expect(flow.isNodeSelected('a')).toBe(false)
    flow.selectNode('a')
    expect(flow.isNodeSelected('a')).toBe(true)
    expect(flow.isNodeSelected('b')).toBe(false)
    flow.selectEdge('e1')
    expect(flow.isEdgeSelected('e1')).toBe(true)
    // selectEdge (non-additive) clears node selection
    expect(flow.isNodeSelected('a')).toBe(false)
    flow.dispose()
  })
})
