import type { Rule } from "../types"

// Reactivity rules (8)
import {
  noBareSignalInJsx,
  noEffectAssignment,
  noNestedEffect,
  noPeekInTracked,
  noSignalInLoop,
  noSignalLeak,
  noUnbatchedUpdates,
  preferComputed,
} from "./reactivity"

// JSX rules (11)
import {
  noAndConditional,
  noChildrenAccess,
  noClassname,
  noHtmlFor,
  noIndexAsBy,
  noMapInJsx,
  noMissingForBy,
  noOnchange,
  noPropsDestructure,
  noTernaryConditional,
  useByNotKey,
} from "./jsx"

// Lifecycle rules (4)
import { noDomInSetup, noEffectInMount, noMissingCleanup, noMountInEffect } from "./lifecycle"

// Performance rules (4)
import {
  noEagerImport,
  noEffectInFor,
  noLargeForWithoutBy,
  preferShowOverDisplay,
} from "./performance"

// SSR rules (3)
import { noMismatchRisk, noWindowInSsr, preferRequestContext } from "./ssr"

// Architecture rules (5)
import {
  devGuardWarnings,
  noCircularImport,
  noCrossLayerImport,
  noDeepImport,
  noErrorWithoutPrefix,
} from "./architecture"

// Store rules (3)
import { noDuplicateStoreId, noMutateStoreState, noStoreOutsideProvider } from "./store"

// Form rules (3)
import { noSubmitWithoutValidation, noUnregisteredField, preferFieldArray } from "./form"

// Styling rules (4)
import { noDynamicStyled, noInlineStyleObject, noThemeOutsideProvider, preferCx } from "./styling"

// Hooks rules (3)
import { noRawAddEventListener, noRawLocalStorage, noRawSetInterval } from "./hooks"

// Accessibility rules (3)
import { dialogA11y, overlayA11y, toastA11y } from "./accessibility"

/** All 51 rules in the @pyreon/lint package */
export const allRules: Rule[] = [
  // Reactivity
  noBareSignalInJsx,
  noEffectAssignment,
  noNestedEffect,
  noPeekInTracked,
  noSignalInLoop,
  noSignalLeak,
  noUnbatchedUpdates,
  preferComputed,

  // JSX
  noAndConditional,
  noChildrenAccess,
  noClassname,
  noHtmlFor,
  noIndexAsBy,
  noMapInJsx,
  noMissingForBy,
  noOnchange,
  noPropsDestructure,
  noTernaryConditional,
  useByNotKey,

  // Lifecycle
  noDomInSetup,
  noEffectInMount,
  noMissingCleanup,
  noMountInEffect,

  // Performance
  noEagerImport,
  noEffectInFor,
  noLargeForWithoutBy,
  preferShowOverDisplay,

  // SSR
  noMismatchRisk,
  noWindowInSsr,
  preferRequestContext,

  // Architecture
  devGuardWarnings,
  noCircularImport,
  noCrossLayerImport,
  noDeepImport,
  noErrorWithoutPrefix,

  // Store
  noDuplicateStoreId,
  noMutateStoreState,
  noStoreOutsideProvider,

  // Form
  noSubmitWithoutValidation,
  noUnregisteredField,
  preferFieldArray,

  // Hooks
  noRawAddEventListener,
  noRawLocalStorage,
  noRawSetInterval,

  // Accessibility
  dialogA11y,
  overlayA11y,
  toastA11y,
]

/** Rule lookup by ID */
export const ruleMap = new Map<string, Rule>(allRules.map((r) => [r.meta.id, r]))

// Re-export individual rule modules
export * from "./reactivity"
export * from "./jsx"
export * from "./lifecycle"
export * from "./performance"
export * from "./ssr"
export * from "./architecture"
export * from "./store"
export * from "./form"
export * from "./styling"
export * from "./hooks"
export * from "./accessibility"
