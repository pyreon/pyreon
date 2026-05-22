// ─── Registry ─────────────────────────────────────────────────────────────────

import { defineCrossModuleState } from '@pyreon/reactivity'

// Default: module-level singleton (CSR and single-threaded SSR).
// For concurrent SSR, @pyreon/runtime-server replaces this with an
// AsyncLocalStorage-backed provider via setRegistryProvider().
//
// Hosted on globalThis so duplicate `@pyreon/store` instances share the
// SAME registry — without this, a `defineStore('foo', ...)` resolved
// against one instance is invisible to a `useStore('foo')` resolved
// against another, producing silently-orphaned store instances.
interface RegistryState {
  defaultRegistry: Map<string, unknown>
  provider: () => Map<string, unknown>
}
const _state = defineCrossModuleState<RegistryState>(
  'pyreon-store/registry-state',
  () => {
    const defaultRegistry = new Map<string, unknown>()
    return { defaultRegistry, provider: () => defaultRegistry }
  },
)

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
  _state.provider = fn
}

export function getRegistry(): Map<string, unknown> {
  return _state.provider()
}
