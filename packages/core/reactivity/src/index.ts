import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from './singleton-sentinel'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/reactivity instances in
// the same heap. See singleton-sentinel.ts for full rationale.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export { batch, nextTick } from './batch'
export { Cell, cell } from './cell'
export { type Computed, type ComputedOptions, computed } from './computed'
export { createSelector } from './createSelector'
export { defineCrossModuleState } from './cross-module-state'
export { isClient, isServer } from './environment'
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
  CauseLink,
  ReactiveFire,
  ReactiveGraph,
  ReactiveNode,
  ReactiveNodeKind,
  SourceLocation,
  UpdateCause,
} from './reactive-devtools'
export {
  __resetReactiveDevtoolsForTesting,
  _rdNodeId,
  activateReactiveDevtools,
  deactivateReactiveDevtools,
  formatUpdateCause,
  getFireSummaries,
  getReactiveFires,
  getReactiveGraph,
  getUpdateCause,
  isReactiveDevtoolsActive,
} from './reactive-devtools'
export type {
  GraphDescription,
  GraphInsight,
  GraphInsightKind,
  NodeDescription,
} from './reactive-describe'
export { describeReactiveGraph, formatGraphDescription } from './reactive-describe'
// `writeLpihCache` + `startLpihPolling` ship at the `@pyreon/reactivity/lpih` subpath.
export type { ReactiveTraceEntry } from './reactive-trace'
export type {
  AccessorReturn,
  ComputedValue,
  MaybeAccessor,
  SignalValue,
} from './type-helpers'
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
  getContextOwner,
  getCurrentScope,
  onScopeDispose,
  runWithContextOwner,
  setContextOwner,
  setCurrentScope,
} from './scope'
export {
  _resumeSoleSubscriber,
  _resumeSubscriber,
  _suspendSoleSubscriber,
  _suspendSubscriber,
  type ReadonlySignal,
  type Signal,
  type SignalDebugInfo,
  type SignalOptions,
  signal,
} from './signal'
export { type WrapSignalOptions, wrapSignal } from './wrap-signal'
export { createStore, isStore, markRaw, shallowReactive } from './store'
export { runUntracked, runUntracked as untrack } from './tracking'
export { type WatchOptions, watch } from './watch'
