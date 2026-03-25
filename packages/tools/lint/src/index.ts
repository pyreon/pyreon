/**
 * @pyreon/lint — Pyreon-specific linter
 *
 * 51 rules across 11 categories for signals, JSX, SSR, performance,
 * architecture, stores, forms, styling, hooks, and accessibility.
 *
 * @example
 * ```ts
 * import { lint, listRules } from "@pyreon/lint"
 *
 * // Lint a directory
 * const result = lint({ cwd: "./src", preset: "recommended" })
 *
 * // List all rules
 * const rules = listRules()
 * ```
 */

// Core API
export { lint, listRules } from "./lint"
export { lintFile, applyFixes } from "./runner"

// Rules
export { allRules, ruleMap } from "./rules"

// Presets
export { presets } from "./config/presets"

// Reporter
export { formatText, formatJSON, formatCompact } from "./reporter"

// Types
export type {
  Diagnostic,
  Fix,
  ImportInfo,
  LintConfig,
  LintFileResult,
  LintOptions,
  LintResult,
  PresetName,
  Rule,
  RuleCategory,
  RuleContext,
  RuleMeta,
  Severity,
  SourceLocation,
  Span,
  VisitorCallbacks,
} from "./types"

// Utilities (for writing custom rules)
export { LineIndex } from "./utils/source"
export {
  isPyreonImport,
  isPyreonPackage,
  extractImportInfo,
  importsName,
  getLocalName,
  REACTIVITY_APIS,
  LIFECYCLE_APIS,
  CONTEXT_APIS,
  JSX_COMPONENTS,
  HEAVY_PACKAGES,
  BROWSER_GLOBALS,
} from "./utils/imports"
export {
  isCallTo,
  isCallToAny,
  isMemberCallTo,
  isJSXElement,
  getJSXTagName,
  getJSXAttribute,
  hasJSXAttribute,
  isInsideFunction,
  isInsideJSX,
  isArrayMapCall,
  isFunction,
  isDestructuring,
  isDestructuringOf,
  isTernaryWithJSX,
  hasJSXChild,
  isLogicalAndWithJSX,
  isPeekCall,
  isSetCall,
  isBrowserGlobal,
  getSpan,
  isInsideDevGuard,
  isInsideOnMount,
  isInsideTypeofGuard,
} from "./utils/ast"
