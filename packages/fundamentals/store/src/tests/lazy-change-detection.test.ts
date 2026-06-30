import { effect, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { defineStore } from '../index'

/**
 * The per-signal change-detection subscriptions are LAZY: they exist only while
 * ≥1 store `subscribe()` callback is attached. This keeps a no-subscriber
 * store's `patch()`/`reset()` writes on the fast unsubscribed path (a subscribed
 * signal written inside a batch round-trips the reactivity pending queue ~10×
 * slower). These tests lock the activate/deactivate lifecycle AND that mutation
 * delivery is unaffected — a stale/missing subscription would silently drop
 * store-level notifications.
 */
// Reach the internal `_s` (subscriber set) to assert subscription state.
function subCount(sig: unknown): number {
  const s = (sig as { _s?: Set<unknown> | null })._s
  return s ? s.size : 0
}

describe('@pyreon/store — lazy change-detection subscription', () => {
  it('does NOT subscribe signals when the store has no subscriber', () => {
    const use = defineStore('lazy-none', () => ({ count: signal(0), label: signal('x') }))
    const api = use()
    expect(subCount(api.store.count)).toBe(0)
    expect(subCount(api.store.label)).toBe(0)
    api.dispose()
  })

  it('activates on first subscribe() and deactivates when the last unsubscribes', () => {
    const use = defineStore('lazy-cycle', () => ({ count: signal(0) }))
    const api = use()
    expect(subCount(api.store.count)).toBe(0)
    const off = api.subscribe(() => {})
    expect(subCount(api.store.count)).toBe(1) // activated
    off()
    expect(subCount(api.store.count)).toBe(0) // deactivated
    api.dispose()
  })

  it('stays active while ANY subscriber remains; deactivates only when all leave', () => {
    const use = defineStore('lazy-multi', () => ({ count: signal(0) }))
    const api = use()
    const offA = api.subscribe(() => {})
    const offB = api.subscribe(() => {})
    expect(subCount(api.store.count)).toBe(1)
    offA()
    expect(subCount(api.store.count)).toBe(1) // B still attached
    offB()
    expect(subCount(api.store.count)).toBe(0) // all gone
    api.dispose()
  })

  it('re-activates correctly on a fresh subscribe after full teardown', () => {
    const use = defineStore('lazy-reactivate', () => ({ count: signal(0) }))
    const api = use()
    api.subscribe(() => {})()
    expect(subCount(api.store.count)).toBe(0)
    const seen: number[] = []
    api.subscribe((m) => seen.push(m.events.length))
    expect(subCount(api.store.count)).toBe(1)
    api.patch({ count: 5 })
    expect(api.store.count()).toBe(5)
    expect(seen.length).toBe(1) // mutation delivered after re-activation
    api.dispose()
  })

  it('delivers patch mutations to a subscriber (lazy subscription feeds notifyDirect)', () => {
    const use = defineStore('lazy-deliver', () => ({ count: signal(0), label: signal('a') }))
    const api = use()
    const mutations: string[] = []
    api.subscribe((m) => mutations.push(m.type))
    api.patch({ count: 1, label: 'b' })
    expect(api.store.count()).toBe(1)
    expect(api.store.label()).toBe('b')
    expect(mutations).toEqual(['patch']) // exactly one coalesced patch notification
    api.dispose()
  })

  it('patch works WITHOUT a subscriber (values update; no notification)', () => {
    const use = defineStore('lazy-no-sub-patch', () => ({ count: signal(0), label: signal('a') }))
    const api = use()
    api.patch({ count: 9, label: 'z' })
    expect(api.store.count()).toBe(9)
    expect(api.store.label()).toBe('z')
    expect(subCount(api.store.count)).toBe(0) // still unsubscribed
    api.dispose()
  })

  it('external effects still react to writes regardless of store subscription', () => {
    const use = defineStore('lazy-external', () => ({ count: signal(0) }))
    const api = use()
    // A signal read in a tracking scope subscribes independently of the store's
    // change-detection — reactivity must work whether or not the store has a
    // store-level subscriber.
    let seen = -1
    const e = effect(() => {
      seen = api.store.count()
    })
    expect(seen).toBe(0)
    api.patch({ count: 7 })
    expect(seen).toBe(7)
    e.dispose()
    api.dispose()
  })
})
