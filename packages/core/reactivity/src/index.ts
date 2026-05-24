// @pyreon/reactivity — signals-based reactive primitives

import { registerSingleton } from './singleton-sentinel'

// Singleton sentinel — fail-loud if two instances of @pyreon/reactivity
// are loaded in the same heap. See singleton-sentinel.ts for full rationale.
// Hardcoded version string is acceptable here; the package.json is the
// source of truth, this is a diagnostic aid only.
registerSingleton('@pyreon/reactivity', '0.21.3', import.meta.url)

export { batch, nextTick } from './batch'
export { Cell, cell } from './cell'
export { type Computed, type ComputedOptions, computed } from './computed'
export { createSelector } from './createSelector'
export { defineCrossModuleState } from './cross-module-state'
export { _resetSentinel, registerSingleton } from './singleton-sentinel'
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
