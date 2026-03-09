// @pyreon/core — component model, VNode types, lifecycle hooks

export type {
  VNode,
  VNodeChild,
  VNodeChildAtom,
  Props,
  ComponentFn,
  ComponentInstance,
  LifecycleHooks,
  CleanupFn,
  NativeItem,
} from "./types"
export { h, Fragment } from "./h"
export { defineComponent, runWithHooks, propagateError, dispatchToErrorBoundary } from "./component"
export { onMount, onUnmount, onUpdate, onErrorCaptured } from "./lifecycle"
export type { Context } from "./context"
export { createContext, useContext, withContext, pushContext, popContext, setContextStackProvider } from "./context"
export type { Ref } from "./ref"
export { createRef } from "./ref"
export { mapArray } from "./map-array"
export { Show, Switch, Match, MatchSymbol } from "./show"
export type { ShowProps, SwitchProps, MatchProps } from "./show"
export { For, ForSymbol } from "./for"
export type { ForProps } from "./for"
export { Portal, PortalSymbol } from "./portal"
export type { PortalProps } from "./portal"
export { Suspense } from "./suspense"
export type { LazyComponent } from "./suspense"
export { ErrorBoundary } from "./error-boundary"
export { registerErrorHandler, reportError } from "./telemetry"
export type { ErrorContext, ErrorHandler } from "./telemetry"
