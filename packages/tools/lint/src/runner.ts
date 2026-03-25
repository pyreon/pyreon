import { Visitor, parseSync } from "oxc-parser"
import type { Diagnostic, LintConfig, LintFileResult, Rule, RuleContext } from "./types"
import { LineIndex } from "./utils/source"

/**
 * Lint a single file against a set of rules.
 *
 * Uses oxc-parser for fast ESTree/TS-ESTree parsing,
 * then walks the AST with merged visitor callbacks from all active rules.
 */
export function lintFile(
  filePath: string,
  sourceText: string,
  rules: Rule[],
  config: LintConfig,
): LintFileResult {
  const diagnostics: Diagnostic[] = []
  const parseErrors: string[] = []

  // Determine language from extension
  const lang = getLang(filePath)
  if (!lang) {
    return { filePath, diagnostics, parseErrors }
  }

  // Parse with oxc-parser
  const result = parseSync(filePath, sourceText, {
    sourceType: "module",
    lang,
  })

  // Collect parse errors
  for (const err of result.errors) {
    parseErrors.push(err.message ?? String(err))
  }

  // Don't run rules if parse failed completely
  if (!result.program) {
    return { filePath, diagnostics, parseErrors }
  }

  // Build line index for fast offset->location lookups
  const lineIndex = new LineIndex(sourceText)

  // Collect all visitor callbacks from active rules
  const mergedCallbacks: Record<string, Array<(node: any) => void>> = {}

  for (const rule of rules) {
    const severity = config.rules[rule.meta.id] ?? rule.meta.defaultSeverity
    if (severity === "off") continue

    const context: RuleContext = {
      sourceText,
      filename: filePath,
      getLocation: (offset) => lineIndex.getLocation(offset),
      getSourceText: (span) => lineIndex.getSourceText(sourceText, span),
      report(partial) {
        diagnostics.push({
          ruleId: rule.meta.id,
          severity,
          message: partial.message,
          loc: partial.loc,
          span: partial.span,
          fix: partial.fix,
        })
      },
    }

    const callbacks = rule.create(context)
    for (const [nodeType, callback] of Object.entries(callbacks)) {
      if (!mergedCallbacks[nodeType]) {
        mergedCallbacks[nodeType] = []
      }
      mergedCallbacks[nodeType].push(callback)
    }
  }

  // Build a single visitor that dispatches to all registered callbacks
  const visitorMap: Record<string, (node: any) => void> = {}
  for (const [nodeType, callbacks] of Object.entries(mergedCallbacks)) {
    if (callbacks.length === 1) {
      visitorMap[nodeType] = callbacks[0]
    } else {
      visitorMap[nodeType] = (node: any) => {
        for (const cb of callbacks) {
          cb(node)
        }
      }
    }
  }

  // Walk the AST
  const visitor = new Visitor(visitorMap)
  visitor.visit(result.program)

  // Sort diagnostics by position
  diagnostics.sort((a, b) => a.span.start - b.span.start)

  return { filePath, diagnostics, parseErrors }
}

/** Determine oxc-parser lang from file extension */
function getLang(filePath: string): "js" | "jsx" | "ts" | "tsx" | undefined {
  if (filePath.endsWith(".tsx")) return "tsx"
  if (filePath.endsWith(".ts") && !filePath.endsWith(".d.ts")) return "ts"
  if (filePath.endsWith(".jsx")) return "jsx"
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs"))
    return "js"
  return undefined
}

/**
 * Apply auto-fixes to source text.
 * Fixes are applied in reverse order (end->start) to preserve byte offsets.
 */
export function applyFixes(sourceText: string, diagnostics: Diagnostic[]): string {
  const fixable = diagnostics
    .filter((d) => d.fix)
    .sort((a, b) => b.fix!.span.start - a.fix!.span.start)

  let result = sourceText
  for (const diag of fixable) {
    const fix = diag.fix!
    result = result.slice(0, fix.span.start) + fix.replacement + result.slice(fix.span.end)
  }

  return result
}
