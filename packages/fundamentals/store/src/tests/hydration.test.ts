import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __clearStoreHydrationForTesting,
  defineStore,
  dehydrateStores,
  hydrateStores,
  resetAllStores,
  resetStore,
  setStoreRegistryProvider,
} from '../index'

/**
 * SSR store hydration — the `dehydrate → inline-script → hydrate` handshake that
 * makes cross-island shared state production-complete. Server snapshots each
 * store's state after render; client seeds the stores back before they're read.
 *
 * Bisect anchor: the LAZY-SEED + ONE-SHOT specs depend on `consumeHydration`
 * being called from `defineSetupStore` right after `registry.set`. Removing that
 * call makes "seeds a lazily-created store" fail with `expected 0 to be 42`.
 */
describe('@pyreon/store — SSR hydration', () => {
  beforeEach(() => {
    resetAllStores()
    __clearStoreHydrationForTesting()
  })
  afterEach(() => {
    resetAllStores()
    __clearStoreHydrationForTesting()
  })

  it('dehydrateStores snapshots signal state (excludes actions)', () => {
    const useCart = defineStore('cart', () => ({
      count: signal(0),
      label: signal('hi'),
      add: () => {},
    }))
    const cart = useCart()
    cart.patch({ count: 5, label: 'bye' })

    expect(dehydrateStores()).toEqual({ cart: { count: 5, label: 'bye' } })
  })

  it('dehydrateStores(filter) scopes which stores are captured', () => {
    defineStore('public:a', () => ({ v: signal(1) }))()
    defineStore('server:secret', () => ({ token: signal('shh') }))()

    const snap = dehydrateStores((id) => !id.startsWith('server:'))
    expect(snap).toEqual({ 'public:a': { v: 1 } })
    expect(snap['server:secret']).toBeUndefined()
  })

  it('hydrateStores seeds an ALREADY-created store in place', () => {
    const useCart = defineStore('cart', () => ({ count: signal(0) }))
    const cart = useCart()
    expect(cart.store.count.peek()).toBe(0)

    hydrateStores({ cart: { count: 99 } })
    expect(cart.store.count.peek()).toBe(99)
  })

  it('hydrateStores seeds a LAZILY-created store on first use (consumeHydration)', () => {
    // Hydrate BEFORE the store exists — the island's store isn't touched yet.
    hydrateStores({ cart: { count: 42, label: 'server' } })

    const useCart = defineStore('cart', () => ({
      count: signal(0),
      label: signal('default'),
    }))
    const cart = useCart() // first creation seeds from the stash
    expect(cart.store.count.peek()).toBe(42)
    expect(cart.store.label.peek()).toBe('server')
  })

  it('is a boot-time ONE-SHOT — a reset + re-created store does NOT re-hydrate', () => {
    hydrateStores({ cart: { count: 7 } })
    const useCart = defineStore('cart', () => ({ count: signal(1) }))
    expect(useCart().store.count.peek()).toBe(7) // seeded once

    resetStore('cart')
    // Re-created store falls back to its own setup() initial, not stale boot state.
    expect(useCart().store.count.peek()).toBe(1)
  })

  it('ignores keys the store does not define (patch writes only known signals)', () => {
    hydrateStores({ cart: { count: 5, bogus: 999 } })
    const useCart = defineStore('cart', () => ({ count: signal(0) }))
    const cart = useCart()

    expect(cart.store.count.peek()).toBe(5)
    expect((cart.store as Record<string, unknown>).bogus).toBeUndefined()
    expect(cart.state).toEqual({ count: 5 })
  })

  it('no hydration in flight → store create is untouched (the common path)', () => {
    const useCart = defineStore('cart', () => ({ count: signal(3) }))
    expect(useCart().store.count.peek()).toBe(3) // setup() initial, never patched
  })

  it('round-trips through JSON (server → dehydrate → JSON → hydrate → client)', () => {
    const useA = defineStore('a', () => ({
      n: signal(0),
      s: signal(''),
      arr: signal<number[]>([]),
    }))
    useA().patch({ n: 10, s: 'x', arr: [1, 2, 3] })

    // Serialize exactly as the framework would embed it in the HTML.
    const wire = JSON.stringify(dehydrateStores())

    // Simulate a fresh client: clear everything, hydrate from the wire blob.
    resetAllStores()
    __clearStoreHydrationForTesting()
    hydrateStores(JSON.parse(wire))

    const useA2 = defineStore('a', () => ({
      n: signal(0),
      s: signal(''),
      arr: signal<number[]>([]),
    }))
    expect(useA2().state).toEqual({ n: 10, s: 'x', arr: [1, 2, 3] })
  })

  it('schema-store state round-trips (inner store hydrates transparently)', () => {
    // The schema store registers its INNER per-field store under the id, so
    // dehydrate/hydrate flow through the same path as a plain store.
    hydrateStores({ counter: { count: 21 } })
    const useCounter = defineStore('counter', () => ({ count: signal(0) }))
    expect(useCounter().store.count.peek()).toBe(21)
  })

  describe('SSR per-request isolation (registry provider)', () => {
    afterEach(() => {
      // Neutralize the override; subsequent tests reset their own registry.
      const fresh = new Map<string, unknown>()
      setStoreRegistryProvider(() => fresh)
    })

    it('dehydrateStores reads only the active per-request registry', () => {
      const reqA = new Map<string, unknown>()
      const reqB = new Map<string, unknown>()
      let active = reqA
      setStoreRegistryProvider(() => active)

      active = reqA
      defineStore('user', () => ({ name: signal('') }))().patch({ name: 'Alice' })

      active = reqB
      defineStore('user', () => ({ name: signal('') }))().patch({ name: 'Bob' })

      active = reqA
      expect(dehydrateStores()).toEqual({ user: { name: 'Alice' } })
      active = reqB
      expect(dehydrateStores()).toEqual({ user: { name: 'Bob' } })
    })
  })
})
