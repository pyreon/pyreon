/**
 * Tree-shake fixture — simulates bundling the PUBLIC API surface: every
 * dev-tools reader retained as an export (what bundling the package entry
 * does), alongside the reactive primitives. The prod bundle of THIS entry
 * must still DCE the registry/stack-parse machinery — the readers'
 * dev-block guards (see getReactiveGraph) are what make that possible.
 */
export {
  activateReactiveDevtools,
  deactivateReactiveDevtools,
  formatUpdateCause,
  getFireSummaries,
  getReactiveFires,
  getReactiveGraph,
  getUpdateCause,
} from '../../reactive-devtools'
export { describeReactiveGraph, formatGraphDescription } from '../../reactive-describe'
export { getReactiveTrace } from '../../reactive-trace'
export { computed } from '../../computed'
export { effect } from '../../effect'
export { signal } from '../../signal'
