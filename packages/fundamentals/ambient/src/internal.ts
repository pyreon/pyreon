/**
 * `@pyreon/ambient/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear in any release (see "What counts as
 * public API" on the stability page, docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath; the supported test hooks are on `@pyreon/ambient/testing`.
 *
 * It holds the clock's test and bench probes: `_tickerStats` (live ticker and timer counts) and `_fireAll` (publish
 * the current instant to every ticker with a reader, as a tick would).
 */
export { _fireAll, _tickerStats } from './clock'
