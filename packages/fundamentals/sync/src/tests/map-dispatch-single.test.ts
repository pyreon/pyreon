import { describe, expect, it } from 'vitest'
import { FakeCrdtDoc } from '../crdt/fake-adapter'
import { observeMapKey } from '../crdt/map-dispatch'

/**
 * Locks the single-handler fast path in `observeMapKey`'s dispatch loop.
 *
 * The dominant shape is exactly one handler per map key (one `syncedSignal`
 * bound to a key), and dispatch runs once per committed transaction — the
 * hottest per-update path in sync. The fast path skips the `[...set]` snapshot
 * array in that case but must preserve the snapshot's exact semantics: fire
 * EXACTLY the handlers present at dispatch start, once each, regardless of what
 * a handler does to the set mid-dispatch. These specs pin that a naive bare
 * `for (const h of set) h()` (which would fire a sibling re-registered
 * mid-dispatch) is NOT what ships.
 */
describe('observeMapKey — single-handler dispatch parity', () => {
  it('fires the sole handler exactly once per key change', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    let fired = 0
    observeMapKey(map, 'k', () => fired++)
    doc.transact(() => map.set('k', 1))
    expect(fired).toBe(1)
    doc.transact(() => map.set('k', 2))
    expect(fired).toBe(2)
  })

  it('a sole handler that RE-REGISTERS a sibling for its own key does NOT fire the new sibling in the same dispatch', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    let a = 0
    let b = 0
    // `a` registers a sibling `b` for the SAME key while it is dispatching.
    // Snapshot semantics: the dispatch fired the handlers present at start, so
    // `b` fires only on the NEXT change, not this one. A bare `for..of set`
    // over the live Set would visit `b` immediately (size grows 1→2) — this
    // spec fails against that shape.
    const stop = observeMapKey(map, 'k', () => {
      a++
      if (a === 1) observeMapKey(map, 'k', () => b++)
    })
    doc.transact(() => map.set('k', 1))
    expect(a).toBe(1)
    expect(b).toBe(0) // sibling registered mid-dispatch must not fire this round
    doc.transact(() => map.set('k', 2))
    expect(a).toBe(2)
    expect(b).toBe(1) // now it fires
    stop()
  })

  it('a sole handler that disposes itself mid-dispatch fires exactly once', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    let fired = 0
    let stop: () => void
    stop = observeMapKey(map, 'k', () => {
      fired++
      stop()
    })
    doc.transact(() => map.set('k', 1))
    expect(fired).toBe(1)
    // After self-dispose, a later change fires nothing.
    doc.transact(() => map.set('k', 2))
    expect(fired).toBe(1)
  })

  it('two handlers (snapshot path): one disposing the sibling mid-dispatch still fires both', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    let a = 0
    let b = 0
    let stopB: () => void
    observeMapKey(map, 'k', () => {
      a++
      stopB() // dispose the sibling mid-dispatch
    })
    stopB = observeMapKey(map, 'k', () => b++)
    doc.transact(() => map.set('k', 1))
    expect(a).toBe(1)
    expect(b).toBe(1) // snapshot fired b once even though a disposed it
  })
})
