// Core API

export { getPreset } from "./config/presets"
export { lint, listRules } from "./lint"
export { formatCompact, formatJSON, formatText } from "./reporter"
// Rules
export { allRules } from "./rules/index"
export { applyFixes, lintFile } from "./runner"

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
export {
  extractImportInfo,
  getLocalName,
  importsName,
  isPyreonImport,
  isPyreonPackage,
} from "./utils/imports"
// Utilities
export { LineIndex } from "./utils/source"
