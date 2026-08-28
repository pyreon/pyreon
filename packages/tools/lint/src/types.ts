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

/**
 * What a rule attaches to a diagnostic to make it auto-fixable.
 *
 * A single edit for the common case, or an ARRAY when one fix needs edits in
 * more than one place — the dominant example being "replace this expression
 * AND add the import it now needs". With only a single span expressible, rules
 * like `prefer-isserver` could not offer a fix at all, which is a large part of
 * why the fixable ratio is low.
 *
 * Edits within one `RuleFix` must not overlap each other; overlapping edits
 * ACROSS diagnostics are detected and deferred by `applyFixes`.
 */
export type RuleFix = Fix | readonly Fix[]

export interface Diagnostic {
  ruleId: string
  severity: Severity
  message: string
  span: Span
  loc: SourceLocation
  fix?: RuleFix | undefined
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
  | 'security'
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
 * The top-level bucket a rule belongs to — the axis `RuleCategory` does not
 * capture: **what knowledge does this rule require, and does it ship?**
 *
 *  - `pyreon`   framework semantics; nothing outside Pyreon can know these.
 *  - `a11y`     accessibility, standard markup plus Pyreon's own surfaces.
 *  - `security` shapes that are exploitable, not merely untidy.
 *  - `pkg`      per-library, self-activating on a declared dependency.
 *  - `internal` encodes THIS repository; never enabled by a shipped preset.
 *
 * Categories live underneath, so a query rule is `group: 'pkg'`,
 * `category: 'query'`. There is deliberately no `js` / `ts` group: those are
 * for general JS/TS correctness rules, of which this package has none yet, and
 * an empty group would advertise coverage that does not exist.
 */
export type RuleGroup = 'pyreon' | 'a11y' | 'security' | 'pkg' | 'internal'

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
   * Which FILES this rule is about.
   *
   * Health gates scan a package's shipped source: `src/**` minus tests,
   * fixtures and `.d.ts`. That surface is right for almost every rule, and the
   * exclusions exist for a reason — detector fixtures deliberately contain
   * anti-patterns, so scoring them would produce a false grade.
   *
   * But a rule whose SUBJECT is a test file, or a package-root config, can
   * then never fire in the gate that runs it. Two shipped rules were in
   * exactly that state: `no-query-selector-cast-in-test` (2,159 test files in
   * the repo, none in scope) and `vitest-config-uses-shared` (115 configs,
   * none in scope). Both were configured at `error` and both were structurally
   * incapable of reporting anything.
   *
   * Declaring the target lets a gate collect the files a rule actually needs,
   * instead of the rule silently depending on a scan policy it cannot see.
   *
   * - `source` (default) — shipped `src/**`, tests and fixtures excluded.
   * - `test`  — `*.test.*` / `*.spec.*` and files under `tests/`. Fixtures
   *   stay excluded: they hold anti-patterns on purpose.
   * - `packageConfig` — per-package root config (`vitest.config.ts`, …).
   */
  scanTarget?: 'source' | 'test' | 'packageConfig'
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
  /**
   * Severity for a whole GROUP, in one line — `{ "a11y": "off" }` silences
   * every accessibility rule without listing 15 ids.
   *
   * Applied AFTER the preset and BEFORE per-rule entries, so an explicit rule
   * always wins over its group. `internal` can be turned on this way too,
   * which is how the Pyreon repo could opt into its own rules wholesale
   * instead of by id.
   */
  groups?: Partial<Record<RuleGroup, Severity>> | undefined
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
