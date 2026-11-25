/**
 * `@pyreon/document/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * It holds `_resetRenderers`, the test-reset helper that restores the
 * built-in renderer registry.
 */

export { _resetRenderers } from './render'
