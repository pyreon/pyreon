import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from './singleton-sentinel'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/reactivity
// instances in the same heap. See singleton-sentinel.ts for full rationale.
// Name + version are derived from this package's OWN package.json (single
// source of truth) so the diagnostic can never report a stale version: the
// build inlines the literals, dev (bun → src) reads the live package.json.
// No hardcoded version to drift on release.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export { batch, nextTick } from './batch'
export { Cell, cell } from './cell'
export { type Computed, type ComputedOptions, computed } from './computed'
export { createSelector } from './createSelector'
export { defineCrossModuleState } from './cross-module-state'
export {
  _resetSentinel,
  registerSingleton,
  withSilent,
  withSilentSync,
} from './singleton-sentinel'
export { inspectSignal, onSignalUpdate, why } from './debug'
export type {
  FireSummary,
  ReactiveEdge,
  ReactiveFire,
  ReactiveGraph,
  ReactiveNode,
  ReactiveNodeKind,
  SourceLocation,
} from './reactive-devtools'
export {
  __resetReactiveDevtoolsForTesting,
  activateReactiveDevtools,
  deactivateReactiveDevtools,
  getFireSummaries,
  getReactiveFires,
  getReactiveGraph,
  isReactiveDevtoolsActive,
} from './reactive-devtools'
// `writeLpihCache` + `startLpihPolling` ship at the `@pyreon/reactivity/lpih`
// subpath. They depend on `node:fs/promises` (Node-only) and are dev-mode
// integration utilities — separating them keeps the core main-entry bundle
// smaller AND clarifies that LPIH writes are an opt-in side-channel, not a
// core reactivity primitive. See `./lpih.ts` and `docs/docs/lpih.md`.
export type { ReactiveTraceEntry } from './reactive-trace'
export { clearReactiveTrace, getReactiveTrace } from './reactive-trace'
export {
  _bind,
  type Effect,
  effect,
  onCleanup,
  type ReactiveSnapshotCapture,
  renderEffect,
  setErrorHandler,
  setSnapshotCapture,
} from './effect'
export { reconcile } from './reconcile'
export { createResource, type Resource } from './resource'
export {
  EffectScope,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  setCurrentScope,
} from './scope'
export {
  type ReadonlySignal,
  type Signal,
  type SignalDebugInfo,
  type SignalOptions,
  signal,
} from './signal'
export { createStore, isStore, markRaw, shallowReactive } from './store'
export { runUntracked, runUntracked as untrack } from './tracking'
export { type WatchOptions, watch } from './watch'
