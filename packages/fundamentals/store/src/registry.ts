// ─── Registry ─────────────────────────────────────────────────────────────────

// Default: module-level singleton (CSR and single-threaded SSR).
// For concurrent SSR, @pyreon/runtime-server replaces this with an
// AsyncLocalStorage-backed provider via setRegistryProvider().
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
 * setRegistryProvider(() => als.getStore() ?? new Map())
 * // Then wrap each request: als.run(new Map(), () => renderToString(app))
 */
export function setRegistryProvider(fn: () => Map<string, unknown>): void {
  _registryProvider = fn
}

export function getRegistry(): Map<string, unknown> {
  return _registryProvider()
}
