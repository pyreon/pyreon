import type { Program } from "@oxc-project/types"

/** Severity level for a lint diagnostic */
export type Severity = "error" | "warn" | "info" | "off"

/** Location of a diagnostic within source code */
export interface SourceLocation {
  /** 1-based line number */
  line: number
  /** 0-based column offset */
  column: number
}

/** Span within the source text (byte offsets) */
export interface Span {
  start: number
  end: number
}

/** A single lint diagnostic reported by a rule */
export interface Diagnostic {
  /** Rule ID (e.g., "pyreon/no-bare-signal-in-jsx") */
  ruleId: string
  /** Severity of this diagnostic */
  severity: Severity
  /** Human-readable message */
  message: string
  /** Source location */
  loc: SourceLocation
  /** Byte span in source text */
  span: Span
  /** Optional fix suggestion */
  fix?: Fix
}

/** An auto-fixable replacement */
export interface Fix {
  /** Byte range to replace */
  span: Span
  /** Replacement text */
  replacement: string
}

/** Rule category for organization */
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

/** Metadata for a lint rule */
export interface RuleMeta {
  /** Unique rule ID (e.g., "pyreon/no-bare-signal-in-jsx") */
  id: string
  /** Short description for --list output */
  description: string
  /** Category for grouping */
  category: RuleCategory
  /** Default severity */
  defaultSeverity: Severity
  /** Whether this rule provides auto-fix */
  fixable: boolean
  /** Documentation URL */
  docs?: string
}

/** Context passed to rule visitors */
export interface RuleContext {
  /** Report a diagnostic */
  report(diagnostic: Omit<Diagnostic, "ruleId" | "severity">): void
  /** The source text being linted */
  sourceText: string
  /** The filename being linted */
  filename: string
  /** Get the line/column for a byte offset */
  getLocation(offset: number): SourceLocation
  /** Get the source text for a span */
  getSourceText(span: Span): string
}

/** Visitor callback map — keys are AST node types */
export type VisitorCallbacks = Record<string, (node: any) => void>

/** A lint rule definition */
export interface Rule {
  /** Rule metadata */
  meta: RuleMeta
  /** Create visitor callbacks for this rule */
  create(context: RuleContext): VisitorCallbacks
}

/** Configuration for a lint run */
export interface LintConfig {
  /** Rules to enable/disable with optional severity override */
  rules: Record<string, Severity>
  /** Glob patterns to include */
  include?: string[]
  /** Glob patterns to exclude */
  exclude?: string[]
}

/** Preset configuration name */
export type PresetName = "recommended" | "strict" | "app" | "lib"

/** Result of linting a single file */
export interface LintFileResult {
  /** Absolute file path */
  filePath: string
  /** Diagnostics found */
  diagnostics: Diagnostic[]
  /** Parse errors (if any) */
  parseErrors: string[]
}

/** Result of a complete lint run */
export interface LintResult {
  /** Per-file results */
  files: LintFileResult[]
  /** Total diagnostic count by severity */
  counts: Record<Severity, number>
  /** Total number of files linted */
  fileCount: number
  /** Duration in milliseconds */
  durationMs: number
}

/** Options for the programmatic API */
export interface LintOptions {
  /** Working directory */
  cwd?: string
  /** Preset to use */
  preset?: PresetName
  /** Rule overrides */
  rules?: Record<string, Severity>
  /** File glob patterns to include */
  include?: string[]
  /** File glob patterns to exclude */
  exclude?: string[]
  /** Whether to apply auto-fixes */
  fix?: boolean
  /** Output format */
  format?: "text" | "json" | "compact"
  /** Quiet mode — only show errors */
  quiet?: boolean
}

/** Import information extracted from AST */
export interface ImportInfo {
  /** The import source (e.g., "@pyreon/reactivity") */
  source: string
  /** Named imports */
  specifiers: Array<{
    imported: string
    local: string
  }>
  /** Whether this is a default import */
  hasDefault: boolean
  /** Whether this is a namespace import */
  hasNamespace: boolean
}
