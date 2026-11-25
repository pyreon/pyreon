/**
 * `@pyreon/http/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * It holds two test hooks: `_resetRequestSource` (detach the ambient-request
 * accessor `@pyreon/http/server` registers) and `_setSourceTextSupport` (force
 * the lossless JSON parser's layer). Both live in client-safe modules, so this
 * entry imports no `node:*` module.
 */

export { _setSourceTextSupport } from './json-lossless'
export { _resetRequestSource } from './request-context'
