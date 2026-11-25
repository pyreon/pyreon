/**
 * `@pyreon/storage/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * It holds the test-reset helpers: `_resetDBCache` (IndexedDB connection
 * cache), `_resetRegistry` (every storage signal) and `_resetStorageListener`
 * (the cross-tab listener and its refcount).
 */

export { _resetDBCache } from './indexed-db'
export { _resetStorageListener } from './local'
export { _resetRegistry } from './registry'
