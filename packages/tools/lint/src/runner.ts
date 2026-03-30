import { parseSync, Visitor } from "oxc-parser"
import type { AstCache } from "./cache"
import type {
  Diagnostic,
  LintConfig,
  LintFileResult,
  Rule,
  RuleContext,
  Severity,
  VisitorCallbacks,
} from "./types"
import { JS_EXTENSIONS } from "./utils/index"
import { LineIndex } from "./utils/source"

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".")
  return lastDot === -1 ? "" : filePath.slice(lastDot)
}

type OxcLang = "jsx" | "tsx" | "ts" | "js" | "dts"

function getLang(ext: string): OxcLang {
  if (ext === ".tsx" || ext === ".jsx") return "tsx"
  if (ext === ".ts" || ext === ".mts") return "ts"
  return "js"
}

function createRuleContext(
  rule: Rule,
  severity: Severity,
  diagnostics: Diagnostic[],
  lineIndex: LineIndex,
  sourceText: string,
  filePath: string,
): RuleContext {
  return {
    report(partial) {
      diagnostics.push({
        ruleId: rule.meta.id,
        severity,
        message: partial.message,
        span: partial.span,
        loc: lineIndex.locate(partial.span.start),
        fix: partial.fix,
      })
    },
    getSourceText() {
      return sourceText
    },
    getFilePath() {
      return filePath
    },
  }
}

function mergeCallbacks(allCallbacks: VisitorCallbacks[]): Record<string, (node: any) => void> {
  const callbacksByKey: Record<string, Array<(node: any) => void>> = {}

  for (const callbacks of allCallbacks) {
    for (const [key, fn] of Object.entries(callbacks)) {
      const existing = callbacksByKey[key]
      if (existing) {
        existing.push(fn as (node: any) => void)
      } else {
        callbacksByKey[key] = [fn as (node: any) => void]
      }
    }
  }

  const merged: Record<string, (node: any) => void> = {}
  for (const [key, fns] of Object.entries(callbacksByKey)) {
    const first = fns[0]
    if (fns.length === 1 && first) {
      merged[key] = first
    } else {
      merged[key] = (node: any) => {
        for (const fn of fns) fn(node)
      }
    }
  }
  return merged
}

/**
 * Lint a single file and return diagnostics.
 *
 * @example
 * ```ts
 * const result = lintFile("app.tsx", source, allRules, getPreset("recommended"))
 * for (const d of result.diagnostics) console.log(d.message)
 * ```
 */
export function lintFile(
  filePath: string,
  sourceText: string,
  rules: Rule[],
  config: LintConfig,
  cache?: AstCache | undefined,
): LintFileResult {
  const ext = getExtension(filePath)
  if (!JS_EXTENSIONS.has(ext)) {
    return { filePath, diagnostics: [] }
  }

  // Try cache first
  let lineIndex: LineIndex
  let program: any
  const cached = cache?.get(sourceText)
  if (cached) {
    lineIndex = cached.lineIndex
    program = cached.program
  } else {
    lineIndex = new LineIndex(sourceText)
    try {
      const result = parseSync(filePath, sourceText, {
        sourceType: "module",
        lang: getLang(ext),
      })
      program = result.program
    } catch {
      return { filePath, diagnostics: [] }
    }
    cache?.set(sourceText, { program, lineIndex })
  }

  const diagnostics: Diagnostic[] = []

  // Filter to enabled rules and create visitor callbacks
  const allCallbacks: VisitorCallbacks[] = []
  for (const rule of rules) {
    const severity = config.rules[rule.meta.id]
    if (severity === undefined || severity === "off") continue
    const ctx = createRuleContext(rule, severity, diagnostics, lineIndex, sourceText, filePath)
    allCallbacks.push(rule.create(ctx))
  }

  // Walk the AST
  const visitor = new Visitor(mergeCallbacks(allCallbacks))
  visitor.visit(program)

  diagnostics.sort((a, b) => a.span.start - b.span.start)
  return { filePath, diagnostics }
}

/**
 * Apply all auto-fixes to a source text.
 * Fixes are applied in reverse order to maintain correct offsets.
 */
export function applyFixes(sourceText: string, diagnostics: Diagnostic[]): string {
  const fixable = diagnostics.filter((d) => d.fix !== undefined)
  if (fixable.length === 0) return sourceText

  // Sort by start position descending (apply from end to start)
  const sorted = [...fixable].sort((a, b) => {
    const aFix = a.fix
    const bFix = b.fix
    if (!aFix || !bFix) return 0
    return bFix.span.start - aFix.span.start
  })

  let result = sourceText
  for (const diag of sorted) {
    const fix = diag.fix
    if (!fix) continue
    result = result.slice(0, fix.span.start) + fix.replacement + result.slice(fix.span.end)
  }

  return result
}
