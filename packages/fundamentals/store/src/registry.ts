// ─── Registry ─────────────────────────────────────────────────────────────────

import { isServer } from '@pyreon/reactivity'

// Default: module-level singleton — correct for a browser, where one process
// serves one user. On a SERVER this module publishes `setRegistryProvider` on a
// `globalThis` seam (see the bottom of this file) and @pyreon/runtime-server
// swaps in an AsyncLocalStorage-backed provider automatically, so concurrent
// requests never share a registry. `configureStoreIsolation` remains the
// explicit override for a custom provider.
const _defaultRegistry = new Map<string, unknown>()
let _registryProvider: () => Map<string, unknown> | undefined = () => _defaultRegistry

/**
 * Override the store registry provider.
 * Called by @pyreon/runtime-server to inject a per-request isolated registry,
 * preventing store state from leaking between concurrent SSR requests.
 *
 * A provider returns `undefined` to mean "no request scope here — use the
 * process default". That is not a detail: an ALS-backed provider is out of
 * scope for every call that is not inside a render, and the obvious spelling
 * (`() => als.getStore() ?? new Map()`) fabricates a THROWAWAY map for those
 * calls, so a store written outside a render is silently dropped on the next
 * read. Returning `undefined` keeps the pre-isolation behaviour exactly where
 * isolation has nothing to say, and isolates where it does.
 *
 * @example
 * import { AsyncLocalStorage } from "node:async_hooks"
 * const als = new AsyncLocalStorage<Map<string, unknown>>()
 * setRegistryProvider(() => als.getStore()) // undefined outside a request
 * // Then wrap each request: als.run(new Map(), () => renderToString(app))
 */
export function setRegistryProvider(fn: () => Map<string, unknown> | undefined): void {
  _registryProvider = fn
}

export function getRegistry(): Map<string, unknown> {
  return _registryProvider() ?? _defaultRegistry
}

/**
 * Publish the setter on a `globalThis` seam so the SSR renderer can wire
 * per-request isolation WITHOUT anyone remembering to.
 *
 * `configureStoreIsolation` has always existed, is documented, and works — but
 * it is opt-in, and the two layers that own the server (`@pyreon/server`,
 * `@pyreon/zero`) cannot call it: neither depends on `@pyreon/store`, which is
 * the whole reason the seam takes a setter as an argument. So the only party
 * who could opt in was the application author, via a paragraph in a package
 * they never import. The default was therefore a process-global registry shared
 * by every concurrent request — a cross-user state bleed, in the primary state
 * library, reached by doing nothing.
 *
 * This is the `__PYREON_STYLER_COLLECT__` shape, for the same reason: an opt-in
 * hook that N call sites must remember to wire is a silent-hole generator, so
 * give it a safe DEFAULT at the shared choke point and keep the explicit call
 * as the override. Neither package imports the other in either direction.
 *
 * Server-only: in a browser one process serves one user, so the module-level
 * registry is correct and this costs nothing.
 */
//
// Beside the setter, a registry DISPOSER: `@pyreon/runtime-server` calls it
// with a request's registry when the request ends. Dropping the map alone was a
// leak: each store runs its setup in its OWN `effectScope`, so a setup effect
// or computed over a signal that outlives the request (module state, a shared
// cache) stayed subscribed, with that request's store state in its closure, one
// per request, forever. `dispose()` stops the scope and runs plugin cleanups;
// duck-checked like `resetStore` for a foreign registry value.
if (isServer) {
  const g = globalThis as {
    __PYREON_STORE_SET_REGISTRY_PROVIDER__?: (fn: () => Map<string, unknown> | undefined) => void
    __PYREON_STORE_DISPOSE_REGISTRY__?: (registry: Map<string, unknown>) => void
  }
  g.__PYREON_STORE_SET_REGISTRY_PROVIDER__ = setRegistryProvider
  g.__PYREON_STORE_DISPOSE_REGISTRY__ = (registry) => {
    // Snapshot: `dispose()` deletes its own entry from the registry.
    for (const api of Array.from(registry.values())) (api as { dispose?: () => void }).dispose?.()
    registry.clear()
  }
}
