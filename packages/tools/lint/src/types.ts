// ── Severity & Diagnostics ──────────────────────────────────────────────────

export type Severity = "error" | "warn" | "info" | "off"

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
  | "reactivity"
  | "jsx"
  | "lifecycle"
  | "performance"
  | "ssr"
  | "architecture"
  | "store"
  | "form"
  | "styling"
  | "hooks"
  | "accessibility"
  | "router"

export interface RuleMeta {
  id: string
  category: RuleCategory
  description: string
  severity: Severity
  fixable: boolean
}

// ── Rule Context & Visitor ──────────────────────────────────────────────────

export interface RuleContext {
  report(diagnostic: Omit<Diagnostic, "ruleId" | "severity" | "loc">): void
  getSourceText(): string
  getFilePath(): string
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

export interface LintConfig {
  rules: Record<string, Severity>
  include?: string[] | undefined
  exclude?: string[] | undefined
}

export interface LintConfigFile {
  preset?: PresetName | undefined
  rules?: Record<string, Severity> | undefined
  include?: string[] | undefined
  exclude?: string[] | undefined
}

export type PresetName = "recommended" | "strict" | "app" | "lib"

// ── Results ─────────────────────────────────────────────────────────────────

export interface LintFileResult {
  filePath: string
  diagnostics: Diagnostic[]
  fixedSource?: string | undefined
}

export interface LintResult {
  files: LintFileResult[]
  totalErrors: number
  totalWarnings: number
  totalInfos: number
}

// ── Lint Options ────────────────────────────────────────────────────────────

export interface LintOptions {
  paths: string[]
  preset?: PresetName | undefined
  fix?: boolean | undefined
  quiet?: boolean | undefined
  ruleOverrides?: Record<string, Severity> | undefined
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
