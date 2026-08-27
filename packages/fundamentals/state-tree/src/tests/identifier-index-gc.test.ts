import { describe, expect, it } from 'vitest'
import { _indexEntryCount, indexLookup, indexRegister } from '../identifier-index'

/**
 * The identifier index holds each node through a `WeakRef`, so a node that is
 * dropped and collected leaves a dead entry behind. `indexLookup` must return
 * `undefined` for it — so the caller falls back to the authoritative DFS — and
 * prune it in passing, or the map grows one dead entry per collected node for
 * the lifetime of the definition (leak class C: an unbounded module-level map
 * whose eviction trigger never fires).
 *
 * This needs real GC, which is why it is its own file: the package's vitest
 * config runs it with `--expose-gc`. `it.skipIf` keeps it honest rather than
 * silently vacuous if that flag ever goes missing — a skipped spec is visible,
 * a spec that passes because `gc` was undefined is not.
 */
const gc = (globalThis as { gc?: () => void }).gc

function registerGhost(def: object): void {
  indexRegister(def, 'ghost', { id: 'ghost' })
}

async function collectGarbage(): Promise<void> {
  // Two passes with a macrotask between — the same shape as
  // charts/dispose-gc.test.tsx and runtime-dom/for-lis-scratch-release: object
  // graphs can need a second sweep after the first clears the retaining edges.
  gc!()
  await new Promise((r) => setTimeout(r, 0))
  gc!()
}

describe('identifier index — dead WeakRef entries', () => {
  it.skipIf(!gc)('returns undefined and prunes the entry once the node is collected', async () => {
    const def = {}
    const root = {}

    // Register from a helper whose frame is gone by the time we collect. An
    // inline literal can stay pinned in an interpreter register slot for the
    // life of the test body, which reads as "the prune never ran".
    registerGhost(def)

    // Loop on the PRUNE, not on the return value. `indexLookup` returns
    // `undefined` for a dead ref AND for a live-but-unknown node, so looping
    // until it returns `undefined` exits on the very first pass — before any
    // collection has happened — and the spec then passes without ever reaching
    // the branch it exists to cover. (It did, on the first draft.)
    let pruned = false
    for (let i = 0; i < 20 && !pruned; i++) {
      await collectGarbage()
      expect(
        indexLookup(def, 'ghost', 'id', root),
        'a collected node must never be returned from the index',
      ).toBeUndefined()
      pruned = _indexEntryCount(def) === 0
    }

    // The dead entry is EVICTED, not merely skipped — and this needs its own
    // observer. Deleting the prune does not change the return value: a dead
    // `WeakRef` falls through to the `meta === undefined` exit and yields
    // `undefined` anyway. The prune's only job is keeping the map from growing
    // one dead entry per collected node.
    expect(pruned, 'the dead entry must be evicted, not just skipped').toBe(true)
  })
})
