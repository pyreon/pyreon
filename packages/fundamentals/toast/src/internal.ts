/**
 * `@pyreon/toast/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * It holds the test-reset helper `_reset` (clears the queue, timers and
 * defaults) and `_toasts`, the raw `Signal<Toast[]>` store. In tests, prefer
 * `@pyreon/testing/toast` (`getToasts`, `expectToast`, `clearToasts`).
 */

export { _reset, _toasts } from './toast'
