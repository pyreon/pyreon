/**
 * `@pyreon/store/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * It holds the store's test-reset helper (`__clearStoreHydrationForTesting`,
 * which drops pending SSR hydration state) and `_notifyChange`, the signal the
 * store runtime sends to `@pyreon/store/devtools` listeners.
 */

export { _notifyChange } from './devtools-bus'
export { __clearStoreHydrationForTesting } from './hydration'
