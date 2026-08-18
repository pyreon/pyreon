/**
 * `createSelector().subscribe()` — per-key holder teardown.
 *
 * The `.subscribe()` channel is the compiler-emitted fast path for a `<For>`
 * row's reactive class (`isSelected.subscribe(row.id, …)`), so its DISPOSE path
 * runs once per row on every list teardown. It used to be `boundSubs.get(value)`
 * + `boundSubs.delete(value)` — two hashed map operations per row. In a real-
 * Chromium CPU profile of a 1000-row `clear rows` that was the single largest
 * non-DOM item, at ~23µs against 0.9µs for tearing down the per-row signal
 * binding beside it.
 *
 * The map value is now a HOLDER the disposer closes over, so unsubscribing
 * writes one field and touches no map, and the last unsubscribe drops the whole
 * map in one `clear()`.
 *
 * That buys speed with STATE — a live count, a dead count, holders that outlive
 * their subscriber until a sweep — so these tests lock the properties that state
 * could break:
 *   1. an unsubscribed updater must become GARBAGE (it retains the row's DOM);
 *      leak class B/C.
 *   2. churn that never reaches zero live must stay BOUNDED (leak class C).
 *   3. the identity guard the removed `Map.get` used to provide must survive —
 *      a stale disposer must not unsubscribe whoever re-took its key.
 *   4. notification must still be exactly the two affected keys.
 */
import { describe, expect, it } from 'vitest'
import { createSelector } from '../createSelector'
import { signal } from '../signal'

/**
 * Give V8 a real chance to collect, then count how many of `refs` are gone.
 * Population-based for the same reason as `createSelector-key-reclamation`:
 * under vitest's fork pool a live test frame can pin any single chosen local.
 */
async function countCollected(refs: WeakRef<object>[]): Promise<number> {
  const gc = (globalThis as { gc?: () => void }).gc
  if (!gc) throw new Error('these tests require --expose-gc (see vitest.config.ts execArgv)')
  for (let i = 0; i < 10; i++) {
    gc()
    await new Promise((r) => setTimeout(r, 0))
  }
  return refs.reduce((n, r) => n + (r.deref() === undefined ? 1 : 0), 0)
}

/** An updater carrying a big payload, standing in for a row's captured DOM. */
function makeHeavyUpdater(): (m: boolean) => void {
  const payload = new Uint8Array(4096)
  const fn = (m: boolean): void => {
    if (m) payload[0] = 1
  }
  return fn
}

describe('createSelector().subscribe() — holder teardown', () => {
  it('RELEASES every bound updater once unsubscribed (whole-list teardown)', async () => {
    const selected = signal<number | null>(null)
    const isSelected = createSelector(selected)

    const ROWS = 2000
    const refs: WeakRef<object>[] = []
    const disposers: (() => void)[] = []
    for (let i = 0; i < ROWS; i++) {
      const updater = makeHeavyUpdater()
      refs.push(new WeakRef(updater))
      disposers.push(isSelected.subscribe(i, updater))
    }
    // Nothing collectable while subscribed — proves the refs are real.
    expect(await countCollected(refs)).toBe(0)

    for (const d of disposers) d()
    disposers.length = 0

    // Effectively all must be unreachable. Not `=== ROWS`: under vitest's fork
    // pool the live test frame can pin one or two individual locals (the same
    // reason `createSelector-key-reclamation` counts a population). The
    // discriminating fact is the ORDER OF MAGNITUDE — a retained channel
    // releases ~none, not 99.9%.
    expect(await countCollected(refs)).toBeGreaterThan(ROWS * 0.99)
  })

  it('stays BOUNDED under churn that never reaches zero live subscribers', async () => {
    // The whole-map `clear()` only fires when the live count hits 0. A list that
    // always keeps at least one row alive never takes that path, so dead holders
    // must instead be reclaimed by the insertion-time sweep — otherwise this is
    // leak class C with extra steps.
    //
    // The WeakRefs are on the KEYS, not the updaters: `h.fn = null` releases the
    // updater whether or not the sweep ever runs, so watching updaters cannot
    // see this bug at all (verified — with the sweep disabled, an
    // updater-watching version of this test still passed). What an unswept map
    // retains is the KEY and its dead holder, so an OBJECT key is the observable
    // that discriminates. Same instrument `createSelector-key-reclamation` uses
    // for the tracked channel.
    const selected = signal<object | null>(null)
    const isSelected = createSelector(selected)

    // One permanently-live subscriber, so live never reaches 0 and the
    // whole-map drop can never be what reclaims these keys.
    const keepAlive = isSelected.subscribe({ id: 'keep' }, () => {})

    const refs: WeakRef<object>[] = []
    for (let i = 0; i < 4000; i++) {
      const key = { id: i } // fresh key every time — the infinite-scroll shape
      refs.push(new WeakRef(key))
      isSelected.subscribe(key, () => {})()
    }

    // The contract is BOUNDED, not "released immediately": reclamation is
    // amortised at the sweep floor, so up to one floor's worth of dead holders
    // is expected to still be there. Without the sweep, retention is the full
    // 4000 — so this discriminates by an order of magnitude, not by a margin.
    const retained = refs.length - (await countCollected(refs))
    expect(retained).toBeLessThan(1000)
    keepAlive()
  })

  it('a STALE disposer does not unsubscribe whoever re-took its key', () => {
    // The removed `boundSubs.get(value) === updater` check was doing real work:
    // it made a second (or late) dispose a no-op instead of deleting a live
    // registration. The holder's `h.fn === updater` guard must preserve that.
    const selected = signal<number | null>(null)
    const isSelected = createSelector(selected)

    const seenA: boolean[] = []
    const seenB: boolean[] = []
    const disposeA = isSelected.subscribe(7, (m) => seenA.push(m))
    seenA.length = 0 // drop `subscribe`'s inline initial call
    disposeA()

    isSelected.subscribe(7, (m) => seenB.push(m))
    seenB.length = 0

    disposeA() // stale — must NOT remove B
    disposeA() // and must stay a no-op however many times it runs

    selected.set(7)
    expect(seenB).toEqual([true])
    expect(seenA).toEqual([]) // A really is gone
  })

  it('REVIVES a key that was unsubscribed and subscribed again', () => {
    const selected = signal<number | null>(null)
    const isSelected = createSelector(selected)

    const seen: boolean[] = []
    isSelected.subscribe(3, () => {})()
    isSelected.subscribe(3, (m) => seen.push(m))
    seen.length = 0

    selected.set(3)
    selected.set(4)
    expect(seen).toEqual([true, false])
  })

  it('notifies exactly the two affected keys, with multiple subscribers per key', () => {
    const selected = signal<number | null>(null)
    const isSelected = createSelector(selected)

    const calls: string[] = []
    isSelected.subscribe(1, (m) => calls.push(`1:${m}`))
    const disposeSecond = isSelected.subscribe(1, (m) => calls.push(`1b:${m}`))
    isSelected.subscribe(2, (m) => calls.push(`2:${m}`))
    isSelected.subscribe(3, (m) => calls.push(`3:${m}`))
    calls.length = 0

    selected.set(1)
    expect(calls.sort()).toEqual(['1:true', '1b:true'])
    calls.length = 0

    selected.set(2)
    expect(calls.sort()).toEqual(['1:false', '1b:false', '2:true'])
    calls.length = 0

    // Dropping one of a promoted key's two subscribers leaves the other live.
    disposeSecond()
    selected.set(1)
    expect(calls.sort()).toEqual(['1:true', '2:false'])
  })

  it('RELEASES a promoted (multi-subscriber) key once its last subscriber leaves', async () => {
    const selected = signal<number | null>(null)
    const isSelected = createSelector(selected)

    const refs: WeakRef<object>[] = []
    const disposers: (() => void)[] = []
    for (let i = 0; i < 500; i++) {
      const a = makeHeavyUpdater()
      const b = makeHeavyUpdater()
      refs.push(new WeakRef(a), new WeakRef(b))
      disposers.push(isSelected.subscribe(i, a), isSelected.subscribe(i, b))
    }
    expect(await countCollected(refs)).toBe(0)

    for (const d of disposers) d()
    disposers.length = 0
    expect(await countCollected(refs)).toBeGreaterThan(refs.length * 0.99)
  })

  it('survives row disposers that run AFTER selector.dispose()', () => {
    // Ordinary unmount order: a component disposes its selector, and its `<For>`
    // tears rows down afterwards. Those disposers still hold live holders, so
    // they decrement a count `dispose()` already zeroed — the release path must
    // absorb that rather than leave the count permanently negative.
    const selected = signal<number | null>(null)
    const isSelected = createSelector(selected)

    const ds = [1, 2, 3].map((k) => isSelected.subscribe(k, () => {}))
    isSelected.dispose()
    for (const d of ds) d()
    for (const d of ds) d() // and again, idempotently

    // Still honours the documented post-dispose contract.
    const seen: boolean[] = []
    const after = isSelected.subscribe(2, (m) => seen.push(m))
    expect(seen).toEqual([false]) // last-known result, called once inline
    after()
    expect(() => selected.set(2)).not.toThrow()
  })

  it('keeps working after every key has been torn down and the map dropped', () => {
    // The `liveBound === 0` branch wipes `boundSubs` wholesale. A selector must
    // be perfectly usable afterwards.
    const selected = signal<number | null>(null)
    const isSelected = createSelector(selected)

    for (let round = 0; round < 3; round++) {
      selected.set(null) // rounds must not inherit the previous selection
      const calls: boolean[] = []
      const ds = [10, 11, 12].map((k) => isSelected.subscribe(k, (m) => calls.push(m)))
      calls.length = 0
      selected.set(11)
      expect(calls).toEqual([true])
      selected.set(null)
      calls.length = 0
      for (const d of ds) d()
      // torn all the way down; next round re-subscribes the same keys
      selected.set(11)
      expect(calls).toEqual([])
    }
  })
})
