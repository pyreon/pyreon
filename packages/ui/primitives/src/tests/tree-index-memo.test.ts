import { describe, expect, it } from 'vitest'
import type { TreeNode, TreeState } from '../TreeBase'
import { TreeBase } from '../TreeBase'

function mountTree(data: TreeNode[], defaultExpanded: string[] = []): TreeState {
  let captured: TreeState | undefined
  TreeBase({
    data,
    defaultExpanded,
    children: (state: TreeState) => {
      captured = state
      return null
    },
  })
  return captured!
}

const DATA: TreeNode[] = [
  { id: 'a', label: 'A', children: [{ id: 'a1', label: 'A1' }, { id: 'a2', label: 'A2' }] },
  { id: 'b', label: 'B', children: [{ id: 'b1', label: 'B1' }] },
]

/**
 * Perf + correctness lock for the `computed`-backed `visibleNodes` / `nodeIndex`
 * refactor. The perf claim is MEMOIZATION: `visibleNodes()` and the index must
 * return the SAME reference until `data()`/`expanded()` actually change — the
 * old plain functions re-walked the tree and allocated a fresh array on EVERY
 * call (per keystroke + per rendered row → O(n²)). Bisect: reverting to the
 * plain functions makes each call a fresh array, so the identity asserts fail.
 */
describe('TreeBase — memoized visibleNodes / nodeIndex', () => {
  it('visibleNodes() is memoized (same reference until a dep changes)', () => {
    const s = mountTree(DATA, ['a'])
    const first = s.visibleNodes()
    const second = s.visibleNodes()
    expect(second).toBe(first) // memoized — the plain function returned a fresh array here
    // sanity: expanded 'a' → a, a1, a2, b visible (b collapsed)
    expect(first.map((v) => v.node.id)).toEqual(['a', 'a1', 'a2', 'b'])
  })

  it('visibleNodes() recomputes (new reference) after an expansion change', () => {
    const s = mountTree(DATA, ['a'])
    const before = s.visibleNodes()
    s.toggleExpand('b') // expand b
    const after = s.visibleNodes()
    expect(after).not.toBe(before) // dep changed → recomputed
    expect(after.map((v) => v.node.id)).toEqual(['a', 'a1', 'a2', 'b', 'b1'])
    s.toggleExpand('a') // collapse a
    const collapsed = s.visibleNodes()
    expect(collapsed).not.toBe(after)
    expect(collapsed.map((v) => v.node.id)).toEqual(['a', 'b', 'b1'])
  })

  it('depth is preserved by the memoized walk', () => {
    const s = mountTree(DATA, ['a', 'b'])
    const vis = s.visibleNodes()
    expect(vis.find((v) => v.node.id === 'a')!.depth).toBe(0)
    expect(vis.find((v) => v.node.id === 'a1')!.depth).toBe(1)
  })
})
