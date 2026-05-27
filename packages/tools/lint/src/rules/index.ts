import type { Rule } from '../types'
import { dialogA11y } from './accessibility/dialog-a11y'
import { overlayA11y } from './accessibility/overlay-a11y'
// Accessibility
import { toastA11y } from './accessibility/toast-a11y'
import { devGuardWarnings } from './architecture/dev-guard-warnings'
// Architecture
import { noCircularImport } from './architecture/no-circular-import'
import { noCrossLayerImport } from './architecture/no-cross-layer-import'
import { noDeepImport } from './architecture/no-deep-import'
import { noErrorWithoutPrefix } from './architecture/no-error-without-prefix'
import { noProcessDevGate } from './architecture/no-process-dev-gate'
import { noQuerySelectorCastInTest } from './architecture/no-querySelector-cast-in-test'
import { requireBrowserSmokeTest } from './architecture/require-browser-smoke-test'
import { vitestConfigUsesShared } from './architecture/vitest-config-uses-shared'
import { noSignalInFormInitialValues } from './form/no-signal-in-form-initial-values'
import { noSubmitWithoutValidation } from './form/no-submit-without-validation'
// Form
import { noUnregisteredField } from './form/no-unregistered-field'
import { preferFieldArray } from './form/prefer-field-array'
// Frontend (opt-in best-practice)
import { anchorIsValid } from './frontend/anchor-is-valid'
import { imgRequiresDimensions } from './frontend/img-requires-dimensions'
import { noAutofocus } from './frontend/no-autofocus'
import { noPositiveTabindex } from './frontend/no-positive-tabindex'
import { noRedundantRole } from './frontend/no-redundant-role'
import { preferZeroImage } from './frontend/prefer-zero-image'
import { requireImgAlt } from './frontend/require-img-alt'
// I18n (opt-in best-practice)
import { i18nPreferTransForRichJsx } from './i18n/i18n-prefer-trans-for-rich-jsx'
// Query (opt-in best-practice)
import { queryOptionsAsFunction } from './query/query-options-as-function'
// Router (opt-in best-practice)
import { preferTypedSearchParams } from './router/prefer-typed-search-params'
// Rx (opt-in best-practice)
import { rxPreferPipe } from './rx/rx-prefer-pipe'
// Storage (opt-in best-practice, dep-gated on @pyreon/storage)
import { noStorageWriteAsCall } from './storage/no-storage-write-as-call'
// Hooks
import { noRawAddEventListener } from './hooks/no-raw-addeventlistener'
import { noRawLocalStorage } from './hooks/no-raw-localstorage'
import { noRawSetInterval } from './hooks/no-raw-setinterval'
import { noAndConditional } from './jsx/no-and-conditional'
import { noChildrenAccess } from './jsx/no-children-access'
import { noClassName } from './jsx/no-classname'
import { noHtmlFor } from './jsx/no-htmlfor'
import { noIndexAsBy } from './jsx/no-index-as-by'
// JSX
import { noMapInJsx } from './jsx/no-map-in-jsx'
import { noMissingForBy } from './jsx/no-missing-for-by'
import { noOnChange } from './jsx/no-onchange'
import { noPropsDestructure } from './jsx/no-props-destructure'
import { noTernaryConditional } from './jsx/no-ternary-conditional'
import { useByNotKey } from './jsx/use-by-not-key'
import { noDomInSetup } from './lifecycle/no-dom-in-setup'
import { noEffectInMount } from './lifecycle/no-effect-in-mount'
import { initFnNeedsIdempotency } from './lifecycle/init-fn-needs-idempotency'
import { noImperativeEffectOnCreate } from './lifecycle/no-imperative-effect-on-create'
// Lifecycle
import { noMissingCleanup } from './lifecycle/no-missing-cleanup'
import { noMountInEffect } from './lifecycle/no-mount-in-effect'
import { noEagerImport } from './performance/no-eager-import'
import { noEffectInFor } from './performance/no-effect-in-for'
import { noHeavyImportOnlyInHandler } from './performance/no-heavy-import-only-in-handler'
// Performance
import { noLargeForWithoutBy } from './performance/no-large-for-without-by'
import { preferShowOverDisplay } from './performance/prefer-show-over-display'
import { promiseRaceNeedsCleartimeout } from './performance/promise-race-needs-cleartimeout'
// Reactivity
import { noAsyncEffect } from './reactivity/no-async-effect'
import { noBareSignalInJsx } from './reactivity/no-bare-signal-in-jsx'
import { noContextDestructure } from './reactivity/no-context-destructure'
import { noEffectAssignment } from './reactivity/no-effect-assignment'
import { noIterateChildrenWithoutResolve } from './reactivity/no-iterate-children-without-resolve'
import { noNestedEffect } from './reactivity/no-nested-effect'
import { noPeekInTracked } from './reactivity/no-peek-in-tracked'
import { noSignalCallWrite } from './reactivity/no-signal-call-write'
import { noSignalInLoop } from './reactivity/no-signal-in-loop'
import { noSignalInProps } from './reactivity/no-signal-in-props'
import { noSignalLeak } from './reactivity/no-signal-leak'
import { noUnbatchedUpdates } from './reactivity/no-unbatched-updates'
import { preferComputed } from './reactivity/prefer-computed'
import { storageSignalVForwarding } from './reactivity/storage-signal-v-forwarding'
// Router
import { noHrefNavigation } from './router/no-href-navigation'
import { noImperativeNavigateInRender } from './router/no-imperative-navigate-in-render'
import { noMissingFallback } from './router/no-missing-fallback'
import { preferUseIsActive } from './router/prefer-use-is-active'
// SSG (M3.5)
import { invalidLoaderExport } from './ssg/invalid-loader-export'
import { missingGetStaticPaths } from './ssg/missing-get-static-paths'
import { revalidateNotPureLiteral } from './ssg/revalidate-not-pure-literal'
import { noMismatchRisk } from './ssr/no-mismatch-risk'
// SSR
import { noWindowInSsr } from './ssr/no-window-in-ssr'
import { preferRequestContext } from './ssr/prefer-request-context'
import { noDuplicateStoreId } from './store/no-duplicate-store-id'
import { noMutateStoreState } from './store/no-mutate-store-state'
// Store
import { noStoreOutsideProvider } from './store/no-store-outside-provider'
import { noDynamicStyled } from './styling/no-dynamic-styled'
// Styling
import { noInlineStyleObject } from './styling/no-inline-style-object'
import { noThemeOutsideProvider } from './styling/no-theme-outside-provider'
import { preferCx } from './styling/prefer-cx'

export const allRules: Rule[] = [
  // Reactivity (14)
  noAsyncEffect,
  noBareSignalInJsx,
  noContextDestructure,
  noSignalInLoop,
  noSignalInProps,
  noNestedEffect,
  noPeekInTracked,
  noUnbatchedUpdates,
  preferComputed,
  noEffectAssignment,
  noSignalLeak,
  noSignalCallWrite,
  storageSignalVForwarding,
  noIterateChildrenWithoutResolve,
  // JSX (11)
  noMapInJsx,
  useByNotKey,
  noClassName,
  noHtmlFor,
  noOnChange,
  noTernaryConditional,
  noAndConditional,
  noIndexAsBy,
  noMissingForBy,
  noPropsDestructure,
  noChildrenAccess,
  // Lifecycle (6)
  noMissingCleanup,
  noMountInEffect,
  noEffectInMount,
  noDomInSetup,
  noImperativeEffectOnCreate,
  initFnNeedsIdempotency,
  // Performance (6)
  noLargeForWithoutBy,
  noEffectInFor,
  noEagerImport,
  noHeavyImportOnlyInHandler,
  preferShowOverDisplay,
  promiseRaceNeedsCleartimeout,
  // SSR (3)
  noWindowInSsr,
  noMismatchRisk,
  preferRequestContext,
  // Architecture (7)
  noCircularImport,
  noDeepImport,
  noCrossLayerImport,
  devGuardWarnings,
  noErrorWithoutPrefix,
  noProcessDevGate,
  noQuerySelectorCastInTest,
  requireBrowserSmokeTest,
  vitestConfigUsesShared,
  // Store (3)
  noStoreOutsideProvider,
  noMutateStoreState,
  noDuplicateStoreId,
  // Form (4)
  noUnregisteredField,
  noSubmitWithoutValidation,
  preferFieldArray,
  noSignalInFormInitialValues,
  // Styling (4)
  noInlineStyleObject,
  noDynamicStyled,
  preferCx,
  noThemeOutsideProvider,
  // Hooks (3)
  noRawAddEventListener,
  noRawSetInterval,
  noRawLocalStorage,
  // Accessibility (3)
  toastA11y,
  dialogA11y,
  overlayA11y,
  // Router (4)
  noHrefNavigation,
  noImperativeNavigateInRender,
  noMissingFallback,
  preferUseIsActive,
  // SSG (3) — M3.5
  invalidLoaderExport,
  missingGetStaticPaths,
  revalidateNotPureLiteral,
  // Frontend (7) — opt-in best-practice a11y/CLS (off in standard
  // presets; enabled via the `best-practices` preset or per-rule config)
  requireImgAlt,
  imgRequiresDimensions,
  noPositiveTabindex,
  preferZeroImage,
  noAutofocus,
  noRedundantRole,
  anchorIsValid,
  // Query (1) — opt-in, auto-gated on @pyreon/query dependency
  queryOptionsAsFunction,
  // Rx (1) — opt-in, auto-gated on @pyreon/rx dependency
  rxPreferPipe,
  // I18n (1) — opt-in, auto-gated on @pyreon/i18n dependency
  i18nPreferTransForRichJsx,
  // Router opt-in (1) — auto-gated on @pyreon/router dependency
  preferTypedSearchParams,
  // Storage (1) — opt-in, auto-gated on @pyreon/storage dependency
  noStorageWriteAsCall,
]

// Re-export all rules individually
export {
  devGuardWarnings,
  dialogA11y,
  initFnNeedsIdempotency,
  noAndConditional,
  // Reactivity
  noAsyncEffect,
  noBareSignalInJsx,
  noContextDestructure,
  noChildrenAccess,
  // Architecture
  noCircularImport,
  noClassName,
  noCrossLayerImport,
  noDeepImport,
  noDomInSetup,
  noDuplicateStoreId,
  noDynamicStyled,
  noEagerImport,
  noEffectAssignment,
  noEffectInFor,
  noEffectInMount,
  noErrorWithoutPrefix,
  noHrefNavigation,
  noHtmlFor,
  noHeavyImportOnlyInHandler,
  noImperativeEffectOnCreate,
  noImperativeNavigateInRender,
  noIndexAsBy,
  noIterateChildrenWithoutResolve,
  // Styling
  noInlineStyleObject,
  // Performance
  noLargeForWithoutBy,
  // JSX
  noMapInJsx,
  noMismatchRisk,
  // Lifecycle
  noMissingCleanup,
  noMissingFallback,
  noMissingForBy,
  noMountInEffect,
  noMutateStoreState,
  noNestedEffect,
  noOnChange,
  noPeekInTracked,
  noProcessDevGate,
  noPropsDestructure,
  noQuerySelectorCastInTest,
  noSignalCallWrite,
  requireBrowserSmokeTest,
  vitestConfigUsesShared,
  // Hooks
  noRawAddEventListener,
  noRawLocalStorage,
  noRawSetInterval,
  noSignalInLoop,
  noSignalInProps,
  noSignalLeak,
  // Store
  noStoreOutsideProvider,
  noSubmitWithoutValidation,
  noTernaryConditional,
  noThemeOutsideProvider,
  noUnbatchedUpdates,
  // Form
  noUnregisteredField,
  // SSR
  noWindowInSsr,
  overlayA11y,
  preferComputed,
  preferCx,
  preferFieldArray,
  preferRequestContext,
  preferShowOverDisplay,
  preferUseIsActive,
  promiseRaceNeedsCleartimeout,
  // SSG (M3.5)
  invalidLoaderExport,
  missingGetStaticPaths,
  revalidateNotPureLiteral,
  // Accessibility
  toastA11y,
  useByNotKey,
}
