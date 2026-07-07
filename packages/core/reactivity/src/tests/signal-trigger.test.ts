/**
 * `signal.trigger()` — force subscribers to re-run WITHOUT a value change.
 *
 * Signals gate on `Object.is`, so `set(sameReference)` is a no-op — mutating a
 * held object in place never re-renders. `trigger()` is the escape hatch. These
 * lock: effect subscribers re-run, direct subscribers re-run, batching defers
 * correctly, no-subscriber is a safe no-op, and the default `set` gate is
 * untouched.
 */
import { describe, expect, it } from 'vitest'
import { batch } from '../batch'
import { effect } from '../effect'
import { signal } from '../signal'
import { wrapSignal } from '../wrap-signal'

describe('signal.trigger()', () => {
  it('re-runs effect subscribers on a same-reference mutation', () => {
    const store = signal({ count: 0 })
    let runs = 0
    let seen = -1
    effect(() => {
      runs++
      seen = store().count
    })
    expect(runs).toBe(1)

    // Mutate in place — set(sameRef) would be a no-op.
    store.peek().count = 5
    expect(store.set === store.set).toBe(true) // (sanity: set exists)
    store.set(store.peek())
    expect(runs).toBe(1) // Object.is gate: no re-run on same reference

    store.trigger()
    expect(runs).toBe(2) // trigger forces the re-run
    expect(seen).toBe(5) // and the effect observed the mutated value
  })

  it('re-runs direct subscribers (the _bindText fast path)', () => {
    const s = signal({ v: 1 })
    let hits = 0
    const dispose = s.direct(() => {
      hits++
    })
    expect(hits).toBe(0) // direct() does not run immediately

    s.trigger()
    expect(hits).toBe(1)
    s.trigger()
    expect(hits).toBe(2)
    dispose()
    s.trigger()
    expect(hits).toBe(2) // disposed — no further hits
  })

  it('is a safe no-op when nothing is subscribed', () => {
    const s = signal({ x: 1 })
    expect(() => s.trigger()).not.toThrow()
  })

  it('defers + coalesces inside a batch', () => {
    const s = signal({ n: 0 })
    const runs: number[] = []
    effect(() => {
      s()
      runs.push(1)
    })
    expect(runs).toHaveLength(1)

    batch(() => {
      s.trigger()
      s.trigger()
      s.trigger()
      // still inside the batch — effect has not re-run yet
      expect(runs).toHaveLength(1)
    })
    // one coalesced re-run after the batch closes
    expect(runs).toHaveLength(2)
  })

  it('does not change the value or the default set gate', () => {
    const obj = { a: 1 }
    const s = signal(obj)
    let runs = 0
    effect(() => {
      s()
      runs++
    })
    s.trigger()
    expect(s.peek()).toBe(obj) // value/reference unchanged
    expect(runs).toBe(2)

    // The normal Object.is gate is intact: setting the same ref is still a no-op.
    s.set(obj)
    expect(runs).toBe(2)
  })

  it('notifies multiple effect subscribers (_s.size > 1)', () => {
    const s = signal({ v: 0 })
    let a = 0
    let b = 0
    effect(() => {
      s()
      a++
    })
    effect(() => {
      s()
      b++
    })
    s.trigger()
    expect(a).toBe(2)
    expect(b).toBe(2)
  })

  it('notifies multiple direct subscribers (_d after promotion)', () => {
    const s = signal({ v: 0 })
    let a = 0
    let b = 0
    s.direct(() => a++) // first → _d1
    s.direct(() => b++) // second → promotes to _d Set
    s.trigger()
    expect(a).toBe(1)
    expect(b).toBe(1)
  })

  it('defers multiple direct subscribers inside a batch', () => {
    const s = signal({ v: 0 })
    let a = 0
    let b = 0
    s.direct(() => a++)
    s.direct(() => b++)
    batch(() => {
      s.trigger()
      expect(a).toBe(0)
      expect(b).toBe(0)
    })
    expect(a).toBe(1)
    expect(b).toBe(1)
  })

  it('is forwarded by wrapSignal to the base signal', () => {
    const base = signal({ v: 0 })
    const facade = wrapSignal(base, { set: (val) => base.set(val) })
    let runs = 0
    effect(() => {
      facade()
      runs++
    })
    expect(runs).toBe(1)
    facade.trigger() // must delegate to base.trigger() where subscribers live
    expect(runs).toBe(2)
  })
})
