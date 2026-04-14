// ── Severity & Diagnostics ──────────────────────────────────────────────────

export type Severity = 'error' | 'warn' | 'info' | 'off'

export interface SourceLocation {
  line: number
  column: number
}

export interface Span {
  start: number
  end: number
}

export interface Fix {
  span: Span
  replacement: string
}

export interface Diagnostic {
  ruleId: string
  severity: Severity
  message: string
  span: Span
  loc: SourceLocation
  fix?: Fix | undefined
}

// ── Rule Metadata ───────────────────────────────────────────────────────────

export type RuleCategory =
  | 'reactivity'
  | 'jsx'
  | 'lifecycle'
  | 'performance'
  | 'ssr'
  | 'architecture'
  | 'store'
  | 'form'
  | 'styling'
  | 'hooks'
  | 'accessibility'
  | 'router'

/**
 * Declared type of an option slot. Minimal on purpose — sufficient for
 * the exemption patterns we actually use. Extend when a rule needs more.
 */
export type OptionType = 'string' | 'string[]' | 'number' | 'boolean'

/**
 * Schema for a rule's options bag — keys are option names, values are
 * their declared types. Unknown keys in user config emit a warning;
 * wrong-typed values disable the rule and emit an error. Rules with no
 * schema accept any options (no validation).
 */
export type RuleOptionsSchema = Record<string, OptionType>

export interface RuleMeta {
  id: string
  category: RuleCategory
  description: string
  severity: Severity
  fixable: boolean
  /**
   * Declared options shape. Validated once when a config enables the rule;
   * bad options either get reported (unknown key → warn, wrong type →
   * error + rule disabled for that run).
   */
  schema?: RuleOptionsSchema
}

// ── Rule Options ────────────────────────────────────────────────────────────
//
// Rules can be configured with an options object in addition to severity.
// This lets users opt files out of a rule without hardcoding paths in the
// rule source (which would ship to every consuming project).
//
// Convention: rules that support path-based exemption read
// `options.exemptPaths: string[]` — each entry is a substring matched
// against the file path. See `utils/exempt-paths.ts` for the helper.

export type RuleOptions = Record<string, unknown>

// ── Rule Context & Visitor ──────────────────────────────────────────────────

export interface RuleContext {
  report(diagnostic: Omit<Diagnostic, 'ruleId' | 'severity' | 'loc'>): void
  getSourceText(): string
  getFilePath(): string
  /** Options passed via config (tuple form: `[severity, options]`). */
  getOptions(): RuleOptions
}

export type VisitorCallback = (node: any, parent?: any) => void

export interface VisitorCallbacks {
  [nodeType: string]: VisitorCallback
}

// ── Rule Definition ─────────────────────────────────────────────────────────

export interface Rule {
  meta: RuleMeta
  create(context: RuleContext): VisitorCallbacks
}

// ── Configuration ───────────────────────────────────────────────────────────

/**
 * A rule entry is either a bare severity (`"error"`, `"warn"`, `"info"`,
 * `"off"`) or a tuple `[severity, options]`. The tuple form lets consumers
 * pass per-rule options without a bespoke API per rule.
 *
 *   "pyreon/no-window-in-ssr": "error"
 *   "pyreon/no-window-in-ssr": ["error", { "exemptPaths": ["packages/core/runtime-dom/"] }]
 */
export type RuleEntry = Severity | readonly [Severity, RuleOptions]

export interface LintConfig {
  rules: Record<string, RuleEntry>
  include?: string[] | undefined
  exclude?: string[] | undefined
}

export interface LintConfigFile {
  preset?: PresetName | undefined
  rules?: Record<string, RuleEntry> | undefined
  include?: string[] | undefined
  exclude?: string[] | undefined
}

export type PresetName = 'recommended' | 'strict' | 'app' | 'lib'

// ── Results ─────────────────────────────────────────────────────────────────

export interface LintFileResult {
  filePath: string
  diagnostics: Diagnostic[]
  fixedSource?: string | undefined
}

/**
 * Config-level diagnostic — emitted by `validateRuleOptions` when a rule's
 * configured options don't match its declared `schema`. Not tied to a
 * source file; lives on `LintResult.configDiagnostics` so programmatic
 * consumers (CI, LSP, JSON reporters) surface them alongside file diags.
 */
export interface ConfigDiagnostic {
  ruleId: string
  severity: 'error' | 'warn'
  message: string
}

export interface LintResult {
  files: LintFileResult[]
  totalErrors: number
  totalWarnings: number
  totalInfos: number
  /** Config-level diagnostics (malformed rule options, etc.). */
  configDiagnostics: ConfigDiagnostic[]
}

// ── Lint Options ────────────────────────────────────────────────────────────

export interface LintOptions {
  paths: string[]
  preset?: PresetName | undefined
  fix?: boolean | undefined
  quiet?: boolean | undefined
  ruleOverrides?: Record<string, Severity> | undefined
  /**
   * Per-rule options overrides — typically populated from the
   * `--rule-options id='{json}'` CLI flag. Merged on top of any
   * options coming from the config file's tuple form.
   */
  ruleOptionsOverrides?: Record<string, RuleOptions> | undefined
  config?: string | undefined
  ignore?: string | undefined
}

// ── Import Info ─────────────────────────────────────────────────────────────

export interface ImportInfo {
  source: string
  specifiers: Array<{ imported: string; local: string }>
  isDefault: boolean
  isNamespace: boolean
}
