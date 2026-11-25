/**
 * `@pyreon/solid-compat/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * It holds `_STORE_SIGNAL_CACHE`, the symbol tests use to read a store's
 * per-path signal cache.
 */

export { _STORE_SIGNAL_CACHE } from './store-signal-cache'
