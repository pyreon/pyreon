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
  | 'ssg'
  // Best-practice categories. Rules in these default to `severity: 'off'`
  // (opt-in) and library-scoped ones auto-activate only when the project
  // depends on the library (see `utils/project-deps`).
  | 'frontend'
  | 'query'
  | 'rx'
  | 'i18n'
  | 'storage'
  | 'http'

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
  /**
   * Opt-in best-practice rule. When `true`, the standard presets
   * (`recommended` / `strict` / `app` / `lib`) force this rule OFF so
   * it never adds noise or a score penalty unless the user wants it.
   * The `best-practices` preset enables it at `meta.severity`. Explicit
   * per-rule config in `.pyreonlintrc.json` always overrides both.
   *
   * Library-scoped opt-in rules ALSO self-gate on the project's
   * declared dependencies (see `utils/project-deps:isProjectDependency`)
   * so even when enabled they stay silent in projects that don't use
   * the library.
   */
  optIn?: boolean
  /**
   * Who the rule is FOR.
   *
   * `'framework'` (the default) — a rule about Pyreon itself, valid in any
   * consumer project.
   *
   * `'monorepo'` — a rule that encodes THIS repository's conventions: its
   * layer order, its private internal packages (`@pyreon/vitest-config`,
   * `@pyreon/test-utils`), its `[Pyreon]` error prefix. These are valuable
   * here and meaningless in a user's app, so every SHIPPED preset forces them
   * off and this repo re-enables them by id in its own `.pyreonlintrc.json` —
   * which makes the dependency visible in config instead of hidden inside a
   * preset that a consumer also selects.
   *
   * The split is drawn by measurement, not taste: these are exactly the rules
   * whose source hardcodes an `@pyreon/*` specifier or a `packages/<layer>/`
   * path. `dev-guard-warnings` hardcodes neither and is therefore a genuine
   * library-author rule, so it stays in the shipped presets.
   */
  scope?: 'framework' | 'monorepo'
  /**
   * The package this rule is ABOUT. When set, the rule self-suppresses in a
   * project that does not declare that dependency — a project with no
   * `@pyreon/query` never sees query rules, even with the rule enabled.
   *
   * The gate itself lives in the rule body (`isProjectDependency(...)`); this
   * field DECLARES it so tooling can explain it. Without the declaration the
   * gate is invisible: `--why-off` could only say "the rule ran and reported
   * nothing", which is indistinguishable from "your code is clean".
   *
   * `rule-registry.test.ts` asserts the declaration matches the gate the rule
   * source actually performs, so the two cannot drift.
   */
  requiresDependency?: string
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

/**
 * Visitor callback. oxc's walker only passes the current node — it does NOT
 * pass `parent`. Rules that need parent context must track it via
 * enter/exit depth counters or pre-mark child nodes via WeakSet on the way
 * in. An earlier `parent?: any` signature here was a false promise that
 * silently disabled `parent.type === '…'` checks across multiple rules.
 */
export type VisitorCallback = (node: any) => void

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

export type PresetName =
  | 'recommended'
  | 'strict'
  | 'app'
  | 'lib'
  | 'best-practices'

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
