// Core API
export { AstCache } from './cache'
export { createIgnoreFilter } from './config/ignore'
export { loadConfig, loadConfigFromPath } from './config/loader'
export { getPreset } from './config/presets'
// CLI entry — reusable by the `pyreon-lint` bin AND `@pyreon/cli`'s `pyreon lint`.
export { runCli } from './cli'
export { lint, listRules } from './lint'
export { formatCompact, formatJSON, formatText } from './reporter'
// LSP
export { startLspServer } from './lsp/index'
// Rules
export { allRules } from './rules/index'
// Groups — the axis `RuleCategory` does not capture.
export { CATEGORY_GROUP, groupOf } from './rules/groups'
export { applyFixes, fixEdits, lintFile } from './runner'
// Types
export type {
  ConfigDiagnostic,
  Diagnostic,
  Fix,
  ImportInfo,
  LintConfig,
  LintConfigFile,
  LintFileResult,
  LintOptions,
  LintResult,
  OptionType,
  PresetName,
  Rule,
  RuleCategory,
  RuleContext,
  RuleEntry,
  RuleFix,
  RuleGroup,
  RuleMeta,
  RuleOptions,
  RuleOptionsSchema,
  Severity,
  SourceLocation,
  Span,
  VisitorCallbacks,
} from './types'
export { isPathExempt } from './utils/exempt-paths'
export { isTestFile } from './utils/file-roles'
export { isProjectDependency } from './utils/project-deps'
export {
  extractImportInfo,
  getLocalName,
  importsName,
  isPyreonImport,
  isPyreonPackage,
} from './utils/imports'
// Utilities
export { LineIndex } from './utils/source'
export { watchAndLint } from './watcher'
// Parallel driver — same results as `lint`, across a worker pool.
export { lintAsync, PARALLEL_FILE_THRESHOLD, partition, workerCountFor } from './parallel'
// "Why isn't this rule firing?" — a rule can be inert for four independent
// reasons, three of which are invisible in config.
export { explainRuleState, formatRuleState } from './why-off'
export type { OffReason, RuleState } from './why-off'
