/**
 * ORDER-DEPENDENT detector wiring: a field read by an effect BEFORE the first
 * `api.subscribe()` call.
 *
 * `activateSignalSubs()` is lazy — the per-field change detectors are wired on
 * the FIRST `api.subscribe()`, not at store creation. So a component that reads
 * `store.count()` inside an effect occupies that field signal's tracked channel
 * first, and the detector arrives second.
 *
 * That ordering is what makes `signal.subscribe()`'s promotion out of the
 * two-tier inline slot (`tracking.ts:SubscriberHost`) load-bearing: if a raw
 * listener could sit in `_s` while a tracked effect sat in `_s1`, the write path
 * dispatches the inline slot and NEVER reaches the Set — the store's subscribe
 * callback would silently stop firing for exactly the fields the UI is watching.
 * Every other store spec subscribes before (or without) any tracked read, so
 * none of them can observe it.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { defineStore, effect, type MutationInfo, resetAllStores, signal } from '../index'

afterEach(() => resetAllStores())

describe('subscribe() after a tracked read of the same field', () => {
  test('the mutation listener still fires when an EFFECT tracked the field first', () => {
    const useStore = defineStore('order-dep-1', () => ({ count: signal(0) }))
    const api = useStore()

    // 1. Tracked read FIRST — the component/binding case.
    let effectRuns = 0
    let seen = -1
    const fx = effect(() => {
      seen = api.store.count()
      effectRuns++
    })
    expect(effectRuns).toBe(1)

    // 2. Detector wired SECOND (lazy `activateSignalSubs`).
    const mutations: MutationInfo[] = []
    const off = api.subscribe((m) => mutations.push(m))

    api.store.count.set(5)

    // BOTH channels must fire.
    expect(seen).toBe(5)
    expect(effectRuns).toBe(2)
    expect(mutations.flatMap((m) => m.events.map((e) => e.key))).toEqual(['count'])
    expect(mutations[0]?.events[0]?.newValue).toBe(5)

    off()
    fx.dispose()
  })

  test('still fires when the tracked read lands BETWEEN two subscribe windows', () => {
    // The last subscriber leaving deactivates the detectors, so they are torn
    // down and re-wired. A tracked read taken during that gap must not shadow
    // the re-wired detector.
    const useStore = defineStore('order-dep-2', () => ({ count: signal(0) }))
    const api = useStore()

    const first: MutationInfo[] = []
    const off1 = api.subscribe((m) => first.push(m))
    api.store.count.set(1)
    expect(first.flatMap((m) => m.events.map((e) => e.key))).toEqual(['count'])
    off1() // detectors deactivated

    let effectRuns = 0
    const fx = effect(() => {
      void api.store.count()
      effectRuns++
    })

    const second: MutationInfo[] = []
    const off2 = api.subscribe((m) => second.push(m))
    api.store.count.set(2)

    expect(second.flatMap((m) => m.events.map((e) => e.key))).toEqual(['count'])
    expect(effectRuns).toBe(2)

    off2()
    fx.dispose()
  })

  test('patch() still emits one event per changed field under the same ordering', () => {
    const useStore = defineStore('order-dep-3', () => ({
      a: signal(0),
      b: signal(0),
    }))
    const api = useStore()

    const fx = effect(() => {
      void api.store.a()
      void api.store.b()
    })

    const mutations: MutationInfo[] = []
    const off = api.subscribe((m) => mutations.push(m))

    api.patch({ a: 1, b: 2 })

    expect(mutations.flatMap((m) => m.events.map((e) => e.key)).sort()).toEqual(['a', 'b'])

    off()
    fx.dispose()
  })
})
