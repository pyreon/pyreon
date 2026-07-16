/**
 * `@pyreon/testing/store` — test-isolation helpers for `@pyreon/store`.
 *
 * `defineStore` stores are SINGLETONS by id — state written in one test leaks
 * into the next unless the registry is reset between tests. These helpers
 * compose `@pyreon/store`'s own `resetStore` / `resetAllStores` (which
 * dispose the store — stop its effectScope, run plugin cleanups — before
 * dropping the registry entry):
 *
 *   installStoreReset() — one call in a test file (or a setup file) registers
 *   `afterEach(resetAllStores)`: every test starts with a clean registry.
 *
 *   withFreshStore(useCart, (store) => { ... }) — scoped isolation: forces a
 *   FRESH instance for the callback and disposes it after, without touching
 *   other stores.
 *
 * Requires the optional peer `@pyreon/store` (and `vitest` for
 * `installStoreReset`).
 */
import { resetAllStores, resetStore } from '@pyreon/store'
import { afterEach } from 'vitest'

// Re-exported so store tests have one import site.
export { resetAllStores, resetStore }

/**
 * Register `afterEach(resetAllStores)` for the CURRENT test file — every
 * store singleton is disposed + dropped between tests, so no state (or
 * setup-scope effect) leaks across tests. Call once at the top of a test
 * file, or from a vitest `setupFiles` module to apply suite-wide.
 *
 * @example
 *   installStoreReset()
 *   test('a', () => { useCart().store.add(item) })   // sees a fresh cart
 *   test('b', () => { expect(useCart().state.items) }) // also fresh
 */
export function installStoreReset(): void {
  afterEach(() => {
    resetAllStores()
  })
}

/** Minimal duck-shape `withFreshStore` needs from a `StoreApi`. */
export interface FreshStoreLike {
  id: string
}

/**
 * Run `fn` against a GUARANTEED-FRESH instance of a store, then dispose it.
 * Any pre-existing instance with the same id is disposed first (its state —
 * possibly dirtied by earlier code — never reaches `fn`), and the fresh
 * instance is disposed afterwards even if `fn` throws. Async-aware: when
 * `fn` returns a promise, disposal happens after it settles.
 *
 * @example
 *   const useCart = defineStore('cart', () => ({ items: signal([]) }))
 *   await withFreshStore(useCart, async (cart) => {
 *     cart.store.items.set([item])
 *     expect(cart.state.items).toHaveLength(1)
 *   }) // cart disposed — next useCart() rebuilds from setup()
 */
export function withFreshStore<TStore extends FreshStoreLike, TReturn>(
  useStore: () => TStore,
  fn: (store: TStore) => TReturn,
): TReturn {
  // Drop any pre-existing instance (probe → reset by id). The probe CREATES
  // the store when absent — harmless: it is disposed in the same tick, before
  // any test code observes it.
  const probe = useStore()
  resetStore(probe.id)
  const store = useStore()

  let result: TReturn
  try {
    result = fn(store)
  } catch (err) {
    resetStore(store.id)
    throw err
  }
  if (result instanceof Promise) {
    return result.finally(() => {
      resetStore(store.id)
    }) as TReturn
  }
  resetStore(store.id)
  return result
}
