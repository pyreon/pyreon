import { effect, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { defineStore } from '../index'
import type { MutationInfo } from '../index'

/**
 * Exception safety of the `patch()` with-subscriber fast path (#2286 detach
 * path). Three throw windows are hardened:
 *
 *  1. `arg[key]` can be a GETTER (throwing property / Proxy) — the read is
 *     hoisted BEFORE `_suspendSubscriber`, so a throw leaves that field's
 *     change detector attached. Pre-fix the detector was deleted from the
 *     signal's subscriber set and never restored → subsequent DIRECT writes
 *     (`store.field.set(v)`) were silently un-notified.
 *  2. `sig.set(v)` can throw (a wrapped signal whose write side-effect fails,
 *     e.g. a storage-backed field on quota) — the suspended write runs in
 *     `try { set } finally { _resumeSubscriber }`.
 *  3. The batch DRAIN can throw (a raw `field.subscribe` listener throws
 *     straight past the effect queue — see reactivity `drainQueuesLocked`) —
 *     `patchInProgress = false` + the deferred-event merge/emit run in a
 *     `finally`, so the flag can't wedge and events for fields that WERE
 *     written are never dropped.
 *
 * See anti-patterns.md "A suspend/mutate/resume window over shared subscriber
 * state must be exception-safe".
 */

type SettableSignal = { set(v: number): void; peek(): number }

describe('@pyreon/store — patch() exception safety', () => {
  it('a throwing GETTER in the patch object leaves the field detector attached (direct writes still notify)', () => {
    // The exact audit repro: patch with a hostile getter on `b`, recover the
    // flag with a second patch, then direct-write `b`. Pre-fix: 0 notifications
    // (b's detector was suspended and never resumed).
    const use = defineStore('exc-getter-detach', () => ({ a: signal(0), b: signal(0) }))
    const api = use()
    const muts: MutationInfo[] = []
    api.subscribe((m) => muts.push(m))

    expect(() =>
      api.patch({
        a: 1,
        get b(): number {
          throw new Error('boom')
        },
      }),
    ).toThrow('boom')

    // Recovery patch (isolates the detector half from the flag half — the
    // flag reset itself is asserted in the next spec without this patch).
    api.patch({ a: 2 })
    muts.length = 0

    api.store.b.set(123)
    expect(muts).toHaveLength(1) // pre-fix: 0 — detector deleted from b's subscriber set
    expect(muts[0]!.type).toBe('direct')
    expect(muts[0]!.events).toEqual([{ key: 'b', oldValue: 0, newValue: 123 }])
    api.dispose()
  })

  it('a throwing getter cannot wedge patchInProgress — direct writes right after the throw emit (not buffered/dropped)', () => {
    const use = defineStore('exc-getter-flag', () => ({ a: signal(0), b: signal(0) }))
    const api = use()
    const muts: MutationInfo[] = []
    api.subscribe((m) => muts.push(m))

    expect(() =>
      api.patch({
        get a(): number {
          throw new Error('boom')
        },
      }),
    ).toThrow('boom')
    muts.length = 0

    // NO recovery patch. Pre-fix `patchInProgress` stayed true, so this direct
    // write's detector BUFFERED into patchEvents (0 emitted notifications, the
    // event silently deferred until an unrelated future patch).
    api.store.a.set(7)
    expect(muts).toHaveLength(1)
    expect(muts[0]!.type).toBe('direct')
    expect(muts[0]!.events).toEqual([{ key: 'a', oldValue: 0, newValue: 7 }])
    api.dispose()
  })

  it('fields written BEFORE the throw still emit one patch notification (partial patch is not silently dropped)', () => {
    const use = defineStore('exc-getter-partial', () => ({ a: signal(0), b: signal(0) }))
    const api = use()
    const muts: MutationInfo[] = []
    api.subscribe((m) => muts.push(m))

    expect(() =>
      api.patch({
        a: 1,
        get b(): number {
          throw new Error('boom')
        },
      }),
    ).toThrow('boom')

    // `a` WAS written (state changed) — subscribers must hear about it even
    // though the patch aborted on `b`.
    expect(api.store.a()).toBe(1)
    expect(muts).toHaveLength(1)
    expect(muts[0]!.type).toBe('patch')
    expect(muts[0]!.events).toEqual([{ key: 'a', oldValue: 0, newValue: 1 }])
    api.dispose()
  })

  it('a throwing sig.set() resumes the detector via finally (wrapped-signal write failure)', () => {
    const use = defineStore('exc-set-throw', () => ({ a: signal(0), b: signal(0) }))
    const api = use()
    const muts: MutationInfo[] = []
    api.subscribe((m) => muts.push(m))

    // Shadow the shared proto `set` with an own throwing property — models a
    // wrapped signal (storage-backed field) whose write side-effect throws.
    const b = api.store.b as unknown as SettableSignal & Record<string, unknown>
    const realSet = b.set
    Object.defineProperty(b, 'set', {
      value: () => {
        throw new Error('set boom')
      },
      configurable: true,
      writable: true,
    })

    expect(() => api.patch({ a: 1, b: 2 })).toThrow('set boom')

    // Restore the real set and verify the detector survived the throw.
    Object.defineProperty(b, 'set', { value: realSet, configurable: true, writable: true })
    muts.length = 0
    api.store.b.set(42)
    expect(muts).toHaveLength(1) // pre-fix: 0 — resume skipped by the throw
    expect(muts[0]!.events).toEqual([{ key: 'b', oldValue: 0, newValue: 42 }])
    api.dispose()
  })

  it('a throwing raw field.subscribe listener during the drain cannot wedge the flag or drop the patch events', () => {
    const use = defineStore('exc-drain-throw', () => ({ a: signal(0), b: signal(0) }))
    const api = use()
    const muts: MutationInfo[] = []
    api.subscribe((m) => muts.push(m))
    // A raw listener on `a` (NOT the store's detector) that throws when the
    // batch drain dispatches it — reactivity lets raw subscribe listeners
    // throw straight past the effect queue.
    const off = api.store.a.subscribe(() => {
      throw new Error('listener boom')
    })

    expect(() => api.patch({ a: 1, b: 2 })).toThrow('listener boom')
    off()

    // Both fields were written; the ONE patch notification must still have
    // been emitted (pre-fix: skipped entirely — events dropped).
    expect(api.store.a()).toBe(1)
    expect(api.store.b()).toBe(2)
    expect(muts).toHaveLength(1)
    expect(muts[0]!.type).toBe('patch')
    const byKey = Object.fromEntries(muts[0]!.events.map((ev) => [ev.key, ev.newValue]))
    expect(byKey).toEqual({ a: 1, b: 2 })

    // And the flag is unwedged: subsequent direct writes emit immediately.
    muts.length = 0
    api.store.b.set(9)
    expect(muts).toHaveLength(1) // pre-fix: 0 — patchInProgress stuck true, event buffered
    expect(muts[0]!.type).toBe('direct')
    api.dispose()
  })

  it('a throwing functional patch cannot wedge the flag either (finally on the functional path)', () => {
    const use = defineStore('exc-fn-throw', () => ({ a: signal(0) }))
    const api = use()
    const muts: MutationInfo[] = []
    api.subscribe((m) => muts.push(m))

    expect(() =>
      api.patch((s) => {
        ;(s.a as SettableSignal).set(1)
        throw new Error('fn boom')
      }),
    ).toThrow('fn boom')

    // The write before the throw was applied + its buffered event emitted.
    expect(api.store.a()).toBe(1)
    expect(muts).toHaveLength(1)
    expect(muts[0]!.type).toBe('patch')
    expect(muts[0]!.events).toEqual([{ key: 'a', oldValue: 0, newValue: 1 }])

    // Flag unwedged: direct writes notify immediately.
    muts.length = 0
    api.store.a.set(5)
    expect(muts).toHaveLength(1)
    expect(muts[0]!.type).toBe('direct')
    api.dispose()
  })

  // ── Happy-path invariants stay intact (the fix must not change semantics) ──

  it('with-subscriber patch still fires the store subscriber exactly once per patch', () => {
    const use = defineStore('exc-happy-once', () => ({ a: signal(0), b: signal(0) }))
    const api = use()
    const muts: MutationInfo[] = []
    api.subscribe((m) => muts.push(m))
    api.patch({ a: 1, b: 2 })
    expect(muts).toHaveLength(1)
    expect(muts[0]!.type).toBe('patch')
    expect(muts[0]!.events).toHaveLength(2)
    api.dispose()
  })

  it('a user effect reading two patched fields still fires exactly ONCE per patch', () => {
    const use = defineStore('exc-happy-effect', () => ({ a: signal(0), b: signal(0) }))
    const api = use()
    api.subscribe(() => {})
    let runs = 0
    const e = effect(() => {
      api.store.a()
      api.store.b()
      runs++
    })
    expect(runs).toBe(1) // mount run
    api.patch({ a: 1, b: 2 })
    expect(runs).toBe(2) // exactly one re-run for the whole patch
    e.dispose()
    api.dispose()
  })

  it('re-entrant patch writes still merge into the single notification', () => {
    const use = defineStore('exc-happy-reentrant', () => ({ a: signal(0), c: signal(0) }))
    const api = use()
    const e = effect(() => {
      const v = api.store.a()
      if (v > 0) api.store.c.set(v * 10)
    })
    const muts: MutationInfo[] = []
    api.subscribe((m) => muts.push(m))
    api.patch({ a: 5 })
    expect(api.store.c()).toBe(50)
    expect(muts).toHaveLength(1)
    const byKey = Object.fromEntries(muts[0]!.events.map((ev) => [ev.key, ev.newValue]))
    expect(byKey).toEqual({ a: 5, c: 50 })
    e.dispose()
    api.dispose()
  })
})
