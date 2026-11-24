/**
 * `@pyreon/runtime-dom/internal` — NOT public API.
 *
 * Helpers other `@pyreon/*` packages share with the DOM renderer (kinetic
 * declares the root decoration of its transition wrappers through it). Nothing
 * here carries a semver promise. See "What counts as public API" on the
 * stability page.
 *
 * The `_tpl` / `_bind*` / `_set*` / `_mount*` / `_dispose*` / `_rsCollapse*`
 * helpers that compiled code imports are the compiler ABI and stay on the main
 * `@pyreon/runtime-dom` entry.
 */
export { _declareRootDecoration } from './template'
