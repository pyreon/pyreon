/**
 * `@pyreon/validate/internal` — NOT public API.
 *
 * The raw server-check registry seam behind `.serverCheck(key)`. Apps register
 * and remove server checks with `registerServerCheck` / `uninstallServerCheck`
 * from `@pyreon/validate/server`; these are here for tests. Nothing here
 * carries a semver promise: any export may change or disappear in any release
 * (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 */
export { getServerCheck, installServerCheck } from './core/registry'
