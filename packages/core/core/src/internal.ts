/**
 * `@pyreon/core/internal` — NOT public API.
 *
 * Helpers other `@pyreon/*` packages share with core (runtime-dom's mount and
 * hydration, the server's island ids, the ui-system prop forwarders) and the
 * test-reset helpers core's own tests use. Nothing here carries a semver
 * promise: it can change in any release, in lockstep with the packages that
 * import it. Application code should not import from this entry. See
 * "What counts as public API" on the stability page.
 *
 * The `_` helpers that compiled code imports (`_rp`, `_pp`, `_lc`, …) are the
 * compiler ABI and stay on the main `@pyreon/core` entry.
 */
export { _resetAsyncWarning } from './async'
export { _childText, _isStructuralChild, _isVNodeLike } from './child-text'
export { _runHooked, _takeHooks } from './component'
export { _devMarkOwnerAlias } from './context'
export { _copyProp, _mergePropsExcept, _mergePropsOmit, _pickProps } from './props'
export { _setSuspenseHydrating } from './suspense'
export { _IslandIds, _nextIslandIdPrefix, _requestIdFrame, _resetIdCounter } from './unique-id'
