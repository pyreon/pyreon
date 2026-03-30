import type { Rule } from "../types";
import { dialogA11y } from "./accessibility/dialog-a11y";
import { overlayA11y } from "./accessibility/overlay-a11y";
// Accessibility
import { toastA11y } from "./accessibility/toast-a11y";
import { devGuardWarnings } from "./architecture/dev-guard-warnings";
// Architecture
import { noCircularImport } from "./architecture/no-circular-import";
import { noCrossLayerImport } from "./architecture/no-cross-layer-import";
import { noDeepImport } from "./architecture/no-deep-import";
import { noErrorWithoutPrefix } from "./architecture/no-error-without-prefix";
import { noSubmitWithoutValidation } from "./form/no-submit-without-validation";
// Form
import { noUnregisteredField } from "./form/no-unregistered-field";
import { preferFieldArray } from "./form/prefer-field-array";
// Hooks
import { noRawAddEventListener } from "./hooks/no-raw-addeventlistener";
import { noRawLocalStorage } from "./hooks/no-raw-localstorage";
import { noRawSetInterval } from "./hooks/no-raw-setinterval";
import { noAndConditional } from "./jsx/no-and-conditional";
import { noChildrenAccess } from "./jsx/no-children-access";
import { noClassName } from "./jsx/no-classname";
import { noHtmlFor } from "./jsx/no-htmlfor";
import { noIndexAsBy } from "./jsx/no-index-as-by";
// JSX
import { noMapInJsx } from "./jsx/no-map-in-jsx";
import { noMissingForBy } from "./jsx/no-missing-for-by";
import { noOnChange } from "./jsx/no-onchange";
import { noPropsDestructure } from "./jsx/no-props-destructure";
import { noTernaryConditional } from "./jsx/no-ternary-conditional";
import { useByNotKey } from "./jsx/use-by-not-key";
import { noDomInSetup } from "./lifecycle/no-dom-in-setup";
import { noEffectInMount } from "./lifecycle/no-effect-in-mount";
// Lifecycle
import { noMissingCleanup } from "./lifecycle/no-missing-cleanup";
import { noMountInEffect } from "./lifecycle/no-mount-in-effect";
import { noEagerImport } from "./performance/no-eager-import";
import { noEffectInFor } from "./performance/no-effect-in-for";
// Performance
import { noLargeForWithoutBy } from "./performance/no-large-for-without-by";
import { preferShowOverDisplay } from "./performance/prefer-show-over-display";
// Reactivity
import { noBareSignalInJsx } from "./reactivity/no-bare-signal-in-jsx";
import { noEffectAssignment } from "./reactivity/no-effect-assignment";
import { noNestedEffect } from "./reactivity/no-nested-effect";
import { noPeekInTracked } from "./reactivity/no-peek-in-tracked";
import { noSignalInLoop } from "./reactivity/no-signal-in-loop";
import { noSignalLeak } from "./reactivity/no-signal-leak";
import { noUnbatchedUpdates } from "./reactivity/no-unbatched-updates";
import { preferComputed } from "./reactivity/prefer-computed";
// Router
import { noHrefNavigation } from "./router/no-href-navigation";
import { noImperativeNavigateInRender } from "./router/no-imperative-navigate-in-render";
import { noMissingFallback } from "./router/no-missing-fallback";
import { preferUseIsActive } from "./router/prefer-use-is-active";
import { noMismatchRisk } from "./ssr/no-mismatch-risk";
// SSR
import { noWindowInSsr } from "./ssr/no-window-in-ssr";
import { preferRequestContext } from "./ssr/prefer-request-context";
import { noDuplicateStoreId } from "./store/no-duplicate-store-id";
import { noMutateStoreState } from "./store/no-mutate-store-state";
// Store
import { noStoreOutsideProvider } from "./store/no-store-outside-provider";
import { noDynamicStyled } from "./styling/no-dynamic-styled";
// Styling
import { noInlineStyleObject } from "./styling/no-inline-style-object";
import { noThemeOutsideProvider } from "./styling/no-theme-outside-provider";
import { preferCx } from "./styling/prefer-cx";

export const allRules: Rule[] = [
  // Reactivity (8)
  noBareSignalInJsx,
  noSignalInLoop,
  noNestedEffect,
  noPeekInTracked,
  noUnbatchedUpdates,
  preferComputed,
  noEffectAssignment,
  noSignalLeak,
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
  // Lifecycle (4)
  noMissingCleanup,
  noMountInEffect,
  noEffectInMount,
  noDomInSetup,
  // Performance (4)
  noLargeForWithoutBy,
  noEffectInFor,
  noEagerImport,
  preferShowOverDisplay,
  // SSR (3)
  noWindowInSsr,
  noMismatchRisk,
  preferRequestContext,
  // Architecture (5)
  noCircularImport,
  noDeepImport,
  noCrossLayerImport,
  devGuardWarnings,
  noErrorWithoutPrefix,
  // Store (3)
  noStoreOutsideProvider,
  noMutateStoreState,
  noDuplicateStoreId,
  // Form (3)
  noUnregisteredField,
  noSubmitWithoutValidation,
  preferFieldArray,
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
];

// Re-export all rules individually
export {
  devGuardWarnings,
  dialogA11y,
  noAndConditional,
  // Reactivity
  noBareSignalInJsx,
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
  noImperativeNavigateInRender,
  noIndexAsBy,
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
  noPropsDestructure,
  // Hooks
  noRawAddEventListener,
  noRawLocalStorage,
  noRawSetInterval,
  noSignalInLoop,
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
  // Accessibility
  toastA11y,
  useByNotKey,
};
