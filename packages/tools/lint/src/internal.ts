/**
 * `@pyreon/lint/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * It holds `_workerEntry`, the resolver for the parallel driver's worker file.
 * The driver itself does not need it exported (it resolves the worker through
 * the package's own `./lint-worker` export); it is here so the package's tests
 * can check the BUILT resolution from outside the bundle.
 */

export { _workerEntry } from './parallel'
