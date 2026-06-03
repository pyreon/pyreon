import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/core
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton('@pyreon/core', '0.24.6', import.meta.url)

export { defineComponent, dispatchToErrorBoundary, propagateError, runWithHooks } from './component'
export { isNativeCompat, NATIVE_COMPAT_MARKER, nativeCompat } from './compat-marker'
// Re-exported from @pyreon/reactivity so existing imports from @pyreon/core
// keep working AND every package below core in the dep chain can still reach
// it directly via @pyreon/reactivity. See `cross-module-state.ts` in
// @pyreon/reactivity for the full module-duplication rationale.
export { defineCrossModuleState } from '@pyreon/reactivity'
export { mapCompatDomProps, shallowEqualProps } from './compat-shared'
export type { Context, ContextSnapshot, ReactiveContext } from './context'
export {
  captureContextStack,
  createContext,
  createReactiveContext,
  getContextStackLength,
  popContext,
  provide,
  pushContext,
  removeContextFrame,
  restoreContextStack,
  setContextStackProvider,
  useContext,
  withContext,
} from './context'
export type { DynamicProps } from './dynamic'
export { Dynamic } from './dynamic'
export { ErrorBoundary } from './error-boundary'
export type { ForProps } from './for'
export { For, ForSymbol } from './for'
export { EMPTY_PROPS, Fragment, h } from './h'
export type {
  AnchorAttributes,
  ButtonAttributes,
  ChangeEvent,
  ClipboardEvent,
  CSSProperties,
  DragEvent,
  FocusEvent,
  FormAttributes,
  FormEvent,
  ImgAttributes,
  InputAttributes,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  PyreonHTMLAttributes,
  SelectAttributes,
  StyleValue,
  SvgAttributes,
  TargetedEvent,
  TextareaAttributes,
  TouchEvent,
  WheelEvent,
} from './jsx-runtime'
export type { DeferProps } from './defer'
export { Defer } from './defer'
export { lazy } from './lazy'
export { onErrorCaptured, onMount, onUnmount, onUpdate } from './lifecycle'
export { mapArray } from './map-array'
export type { PortalProps } from './portal'
export { Portal, PortalSymbol } from './portal'
export {
  _rp,
  _wrapSpread,
  createUniqueId,
  makeReactiveProps,
  mergeProps,
  REACTIVE_PROP,
  splitProps,
} from './props'
export type { Ref, RefCallback, RefProp } from './ref'
export { createRef } from './ref'
export type { MatchProps, ShowProps, SwitchProps } from './show'
export { Match, MatchSymbol, Show, Switch } from './show'
export type { ClassValue } from './style'
export { CSS_UNITLESS, cx, normalizeStyleValue, toKebabCase } from './style'
export type { LazyComponent } from './suspense'
export { Suspense } from './suspense'
export { isSafeImageDataUri, UNSAFE_URL_RE, URL_ATTRS } from './url-guard'
export type { ErrorContext, ErrorHandler, ReactiveTraceEntry } from './telemetry'
export { registerErrorHandler, reportError } from './telemetry'
export type {
  CleanupFn,
  ComponentFn,
  ComponentInstance,
  ExtractProps,
  HigherOrderComponent,
  LifecycleHooks,
  NativeItem,
  Props,
  VNode,
  VNodeChild,
  VNodeChildAccessor,
  VNodeChildAtom,
} from './types'
