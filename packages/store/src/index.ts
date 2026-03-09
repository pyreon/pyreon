/**
 * @pyreon/store — global state management built on @pyreon/reactivity signals.
 *
 * API (Pinia-inspired composition style):
 *
 *   const useCounter = defineStore("counter", () => {
 *     const count = signal(0)
 *     const double = computed(() => count() * 2)
 *     const increment = () => count.update(n => n + 1)
 *     return { count, double, increment }
 *   })
 *
 *   // Inside a component (or anywhere):
 *   const { count, increment } = useCounter()
 *
 * Stores are singletons — the setup function runs once per store id.
 * Call `resetStore(id)` or `resetAllStores()` to clear the registry
 * (useful for testing or HMR).
 *
 * For concurrent SSR, call setStoreRegistryProvider() with an
 * AsyncLocalStorage-backed provider so each request gets isolated store state.
 */

export type { Signal } from "@pyreon/reactivity"
export { signal, computed, effect, batch } from "@pyreon/reactivity"

// ─── Registry ─────────────────────────────────────────────────────────────────

// Default: module-level singleton (CSR and single-threaded SSR).
// For concurrent SSR, @pyreon/runtime-server replaces this with an
// AsyncLocalStorage-backed provider via setStoreRegistryProvider().
const _defaultRegistry = new Map<string, unknown>()
let _registryProvider: () => Map<string, unknown> = () => _defaultRegistry

/**
 * Override the store registry provider.
 * Called by @pyreon/runtime-server to inject a per-request isolated registry,
 * preventing store state from leaking between concurrent SSR requests.
 *
 * @example
 * import { AsyncLocalStorage } from "node:async_hooks"
 * const als = new AsyncLocalStorage<Map<string, unknown>>()
 * setStoreRegistryProvider(() => als.getStore() ?? new Map())
 * // Then wrap each request: als.run(new Map(), () => renderToString(app))
 */
export function setStoreRegistryProvider(fn: () => Map<string, unknown>): void {
  _registryProvider = fn
}

function getRegistry(): Map<string, unknown> {
  return _registryProvider()
}

// ─── defineStore ─────────────────────────────────────────────────────────────

/**
 * Define a store with a unique id and a setup function.
 * Returns a `useStore` hook that returns the singleton store state.
 */
export function defineStore<T extends object>(id: string, setup: () => T): () => T {
  return function useStore(): T {
    const registry = getRegistry()
    if (registry.has(id)) return registry.get(id) as T
    const state = setup()
    registry.set(id, state)
    return state
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Destroy a store by id so next call to useStore() re-runs setup. */
export function resetStore(id: string): void {
  getRegistry().delete(id)
}

/** Destroy all stores — useful for SSR isolation and tests. */
export function resetAllStores(): void {
  getRegistry().clear()
}
