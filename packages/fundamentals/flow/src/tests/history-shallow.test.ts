/**
 * P7 — history snapshots are SHALLOW array copies, not `structuredClone`.
 *
 * `pushHistory()` runs INSIDE pointerdown (it is the first thing a node grab
 * does), and deep-cloning the whole graph there measured ~1.1ms per grab at
 * 1000 nodes — visible grab jank. The shallow snapshot is CORRECT because
 * every write path in this package is immutable by discipline (changed
 * node/edge objects are replaced via spread; arrays rebuilt via map/filter —
 * the invariant the per-id `{ equals: Object.is }` computeds already depend
 * on), so a captured object can never be mutated after the snapshot.
 *
 * Bisect: revert `historySnapshot` to the structuredClone form →
 *   • "does not deep-clone" fails (clone count 2, not 0)
 *   • "function-valued node data" fails with DataCloneError
 * Restore → all pass.
 */
import { describe, expect, it } from 'vitest'
import { createFlow } from '../flow'

describe('pushHistory shallow snapshots (P7)', () => {
  it('does not deep-clone the graph (zero structuredClone calls)', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'a' } }],
      edges: [],
    })
    const orig = globalThis.structuredClone
    let clones = 0
    globalThis.structuredClone = ((v: unknown) => {
      clones++
      return orig(v as never)
    }) as typeof structuredClone
    try {
      flow.pushHistory()
      flow.undo()
      flow.redo()
    } finally {
      globalThis.structuredClone = orig
    }
    expect(clones).toBe(0)
    flow.dispose()
  })

  it('undo restores positions after an immutable drag-shaped update', () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 10, y: 20 }, data: {} },
        { id: '2', position: { x: 100, y: 200 }, data: {} },
      ],
    })
    flow.pushHistory()
    // Exactly what the drag handler does per frame: replace CHANGED nodes.
    flow.nodes.update((nds) =>
      nds.map((n) => (n.id === '1' ? { ...n, position: { x: 55, y: 66 } } : n)),
    )
    expect(flow.getNode('1')!.position).toEqual({ x: 55, y: 66 })
    flow.undo()
    expect(flow.getNode('1')!.position).toEqual({ x: 10, y: 20 })
    expect(flow.getNode('2')!.position).toEqual({ x: 100, y: 200 })
    flow.redo()
    expect(flow.getNode('1')!.position).toEqual({ x: 55, y: 66 })
    flow.dispose()
  })

  it('history works with FUNCTION-valued node data (structuredClone threw DataCloneError)', () => {
    const onPick = () => 'picked'
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { onPick } }],
    })
    expect(() => flow.pushHistory()).not.toThrow()
    flow.updateNode('1', { position: { x: 9, y: 9 } })
    expect(() => flow.undo()).not.toThrow()
    expect(flow.getNode('1')!.position).toEqual({ x: 0, y: 0 })
    // The data object (and its function) survive by REFERENCE.
    expect((flow.getNode('1')!.data as { onPick: () => string }).onPick).toBe(onPick)
    flow.dispose()
  })

  it('a post-snapshot updateNode cannot corrupt the snapshot (immutable-update discipline)', () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 1, y: 2 }, data: { label: 'orig' } }],
    })
    flow.pushHistory()
    flow.updateNode('1', { data: { label: 'changed' }, position: { x: 7, y: 8 } })
    flow.undo()
    const restored = flow.getNode('1')!
    expect(restored.position).toEqual({ x: 1, y: 2 })
    expect((restored.data as { label: string }).label).toBe('orig')
    flow.dispose()
  })
})
