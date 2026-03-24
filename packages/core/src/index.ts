// @pyreon/core — component model, VNode types, lifecycle hooks

export { defineComponent, dispatchToErrorBoundary, propagateError, runWithHooks } from "./component"
export type { Context } from "./context"
export {
  createContext,
  popContext,
  provide,
  pushContext,
  setContextStackProvider,
  useContext,
  withContext,
} from "./context"
export type { DynamicProps } from "./dynamic"
export { Dynamic } from "./dynamic"
export { ErrorBoundary } from "./error-boundary"
export type { ForProps } from "./for"
export { For, ForSymbol } from "./for"
export { EMPTY_PROPS, Fragment, h } from "./h"
export type {
  AnchorAttributes,
  ButtonAttributes,
  CSSProperties,
  FormAttributes,
  ImgAttributes,
  InputAttributes,
  PyreonHTMLAttributes,
  SelectAttributes,
  StyleValue,
  SvgAttributes,
  TextareaAttributes,
} from "./jsx-runtime"
export { lazy } from "./lazy"
export { onErrorCaptured, onMount, onUnmount, onUpdate } from "./lifecycle"
export { mapArray } from "./map-array"
export type { PortalProps } from "./portal"
export { Portal, PortalSymbol } from "./portal"
export type { Ref } from "./ref"
export { createRef } from "./ref"
export type { MatchProps, ShowProps, SwitchProps } from "./show"
export { Match, MatchSymbol, Show, Switch } from "./show"
export { CSS_UNITLESS, normalizeStyleValue, toKebabCase } from "./style"
export type { LazyComponent } from "./suspense"
export { Suspense } from "./suspense"
export type { ErrorContext, ErrorHandler } from "./telemetry"
export { registerErrorHandler, reportError } from "./telemetry"
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
  VNodeChildAtom,
} from "./types"
