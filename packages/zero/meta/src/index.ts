// ─── Store ───────────────────────────────────────────────────────────────────

export type { StoreApi, StorePlugin } from '@pyreon/store'
export {
  addStorePlugin,
  batch,
  computed,
  defineStore,
  effect,
  resetAllStores,
  resetStore,
  signal,
} from '@pyreon/store'

// ─── Form ────────────────────────────────────────────────────────────────────

export type {
  FieldRegisterProps,
  FieldState,
  FormState,
  UseFieldArrayResult,
  UseFieldResult,
  UseFormOptions,
} from '@pyreon/form'
export {
  FormProvider,
  useField,
  useFieldArray,
  useForm,
  useFormContext,
  useFormState,
  useWatch,
} from '@pyreon/form'

// ─── Validation ──────────────────────────────────────────────────────────────

export type { SchemaAdapter, ValidationIssue } from '@pyreon/validation'
export { zodField, zodSchema } from '@pyreon/validation'

// ─── Query ───────────────────────────────────────────────────────────────────

export type { UseMutationResult, UseQueryResult } from '@pyreon/query'
export {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useIsFetching,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@pyreon/query'

// ─── Table ───────────────────────────────────────────────────────────────────

export type { UseTableOptions } from '@pyreon/table'
export { flexRender, useTable } from '@pyreon/table'

// ─── Virtual ─────────────────────────────────────────────────────────────────

export type { UseVirtualizerOptions, UseVirtualizerResult } from '@pyreon/virtual'
export { useVirtualizer, useWindowVirtualizer } from '@pyreon/virtual'

// ─── i18n ────────────────────────────────────────────────────────────────────

export type { I18nInstance, I18nOptions } from '@pyreon/i18n'
export { createI18n, I18nProvider, Trans, useI18n } from '@pyreon/i18n'

// ─── Feature ─────────────────────────────────────────────────────────────────

export type { Feature, FeatureConfig } from '@pyreon/feature'
export { defineFeature, reference } from '@pyreon/feature'

// ─── Flow ────────────────────────────────────────────────────────────────────

export type { FlowConfig, FlowEdge, FlowInstance, FlowNode, NodeComponentProps } from '@pyreon/flow'
export {
  Background,
  Controls,
  computeLayout,
  createFlow,
  Flow,
  flowStyles,
  Handle,
  MiniMap,
  NodeResizer,
  NodeToolbar,
  Panel,
  Position,
} from '@pyreon/flow'

// ─── Code ────────────────────────────────────────────────────────────────────

export type { EditorConfig, EditorInstance } from '@pyreon/code'
export { CodeEditor, createEditor, DiffEditor, TabbedEditor } from '@pyreon/code'

// ─── Charts ──────────────────────────────────────────────────────────────────

export { Chart } from '@pyreon/charts'

// ─── Hotkeys ─────────────────────────────────────────────────────────────────

export { useHotkey, useHotkeyScope } from '@pyreon/hotkeys'

// ─── Storage ─────────────────────────────────────────────────────────────────

export {
  createStorage,
  useCookie,
  useIndexedDB,
  useMemoryStorage,
  useStorage,
} from '@pyreon/storage'

// ─── State Tree ──────────────────────────────────────────────────────────────

export type { ModelDefinition, ModelInstance, Snapshot } from '@pyreon/state-tree'
export {
  addMiddleware,
  applyPatch,
  applySnapshot,
  getSnapshot,
  model,
  onPatch,
  resetAllHooks,
  resetHook,
} from '@pyreon/state-tree'

// ─── Machine ─────────────────────────────────────────────────────────────────

export { createMachine } from '@pyreon/machine'

// ─── Permissions ─────────────────────────────────────────────────────────────

export { createPermissions, PermissionsProvider, usePermissions } from '@pyreon/permissions'

// ─── Styler ──────────────────────────────────────────────────────────────────

export { createGlobalStyle, css, keyframes, styled } from '@pyreon/styler'

// ─── Hooks ───────────────────────────────────────────────────────────────────

export {
  useBreakpoint,
  useClickOutside,
  useColorScheme,
  useDebouncedCallback,
  useDebouncedValue,
  useElementSize,
  useFocus,
  useFocusTrap,
  useHover,
  useIntersection,
  useInterval,
  useKeyboard,
  useMediaQuery,
  useMergedRef,
  useReducedMotion,
  useScrollLock,
  useThrottledCallback,
  useTimeout,
  useToggle,
  useWindowResize,
} from '@pyreon/hooks'

// ─── Elements ────────────────────────────────────────────────────────────────

export { Element, Iterator, List, Overlay, Portal, Text } from '@pyreon/elements'

// ─── Unistyle ────────────────────────────────────────────────────────────────

export { makeItResponsive, normalizeTheme, sortBreakpoints } from '@pyreon/unistyle'

// ─── Coolgrid ────────────────────────────────────────────────────────────────

export { Col, Container, Row } from '@pyreon/coolgrid'

// ─── Kinetic ─────────────────────────────────────────────────────────────────

export { kinetic, useAnimationEnd, useTransitionState } from '@pyreon/kinetic'

// ─── Kinetic Presets ─────────────────────────────────────────────────────────

export {
  createBlur,
  createFade,
  createRotate,
  createScale,
  createSlide,
} from '@pyreon/kinetic-presets'

// ─── Attrs ───────────────────────────────────────────────────────────────────

export { attrs } from '@pyreon/attrs'

// ─── Rocketstyle ─────────────────────────────────────────────────────────────

export { rocketstyle } from '@pyreon/rocketstyle'

// ─── Rx ──────────────────────────────────────────────────────────────────────
// Exposed as the `rx` namespace to avoid collisions with generic operator
// names (`merge` / `throttle` / `debounce`) used by other meta entries.
// Tree-shakeable via `sideEffects: false`; unused operators drop out at
// bundle time.

export type { KeyOf, ReadableSignal } from '@pyreon/rx'
export { rx } from '@pyreon/rx'

// ─── Toast ───────────────────────────────────────────────────────────────────

export type {
  Toast,
  ToasterProps,
  ToastOptions,
  ToastPosition,
  ToastPromiseOptions,
  ToastState,
  ToastType,
} from '@pyreon/toast'
export { Toaster, toast } from '@pyreon/toast'

// ─── URL State ───────────────────────────────────────────────────────────────

export type {
  ArrayFormat,
  Serializer,
  UrlRouter,
  UrlStateOptions,
  UrlStateSignal,
} from '@pyreon/url-state'
export { setUrlRouter, useUrlState } from '@pyreon/url-state'

// ─── DnD ─────────────────────────────────────────────────────────────────────

export type {
  UseDragMonitorOptions,
  UseDragMonitorResult,
  UseFileDropOptions,
  UseFileDropResult,
} from '@pyreon/dnd'
export {
  useDragMonitor,
  useDraggable,
  useDroppable,
  useFileDrop,
  useSortable,
} from '@pyreon/dnd'

// ─── Document ────────────────────────────────────────────────────────────────
// Builder + render API only. The format-renderer chunks (PDF / DOCX / XLSX /
// PPTX) are lazy-loaded INSIDE `render()` via dynamic `import()` — they do
// NOT bundle eagerly into consumers' main chunk. Document's generic JSX
// primitive names (`Text` / `List` / `Row` / `Table` / `Image` / …) are
// deliberately NOT re-exported here because they collide with `@pyreon/
// elements` / `@pyreon/coolgrid`; use the `Doc*`-named primitives from
// `@pyreon/document-primitives` (re-exported below) for JSX, or import the
// builder primitives directly from `@pyreon/document` when needed.

export type {
  DocumentBuilder,
  DocumentProps,
  DocumentRenderer,
  OutputFormat,
  PageOrientation,
  PageSize,
} from '@pyreon/document'
export {
  createDocument,
  download,
  isDocNode,
  registerRenderer,
  render,
  unregisterRenderer,
} from '@pyreon/document'

// ─── Document Primitives ─────────────────────────────────────────────────────
// The `Doc*`-prefixed JSX primitives (the rocketstyle-based components that
// render in the browser AND export to 14+ formats via `extractDocNode`).

export type {
  DocumentExport,
  DocumentExportOptions,
  DocumentTheme,
} from '@pyreon/document-primitives'
export {
  DocButton,
  DocCode,
  DocColumn,
  DocDivider,
  DocDocument,
  DocHeading,
  DocImage,
  DocLink,
  DocList,
  DocListItem,
  DocPage,
  DocPageBreak,
  DocQuote,
  DocRow,
  DocSection,
  DocSpacer,
  DocTable,
  DocText,
  DocumentPreview,
  createDocumentExport,
  documentTheme,
  extractDocNode,
} from '@pyreon/document-primitives'

// ─── Connector Document ──────────────────────────────────────────────────────
// Bridge between rocketstyle / styled UI trees and `@pyreon/document`'s node
// graph — used by export pipelines. Generic `DocChild`/`DocNode`/`NodeType`
// types are NOT re-exported here to avoid duplicate-name surfaces against
// `@pyreon/document`; import them from `@pyreon/document` directly.

export type {
  DocumentMarker,
  ExtractOptions,
  ResolvedStyles,
} from '@pyreon/connector-document'
export { extractDocumentTree, resolveStyles } from '@pyreon/connector-document'

// ─── UI Core (provider surface) ──────────────────────────────────────────────
// Only the high-value consumer-app surface: `PyreonUI` (the unified provider)
// + `useMode`. Framework-internal utilities (`init` / `compose` / `Provider`
// / `context` / `render` / generic `get`/`set`/`omit`/`pick`/`throttle`/
// `merge`) are deliberately omitted — they target ui-system authors, not
// app code, and several would collide with other meta entries.

export type {
  BreakpointKeys,
  Breakpoints,
  PyreonUIProps,
  ThemeMode,
  ThemeModeInput,
} from '@pyreon/ui-core'
export { PyreonUI, useMode } from '@pyreon/ui-core'
