/**
 * `@pyreon/hotkeys/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * It holds `_resetHotkeys`, the test-reset helper that drops every
 * registration and detaches the window listener.
 */

export { _resetHotkeys } from './registry'
