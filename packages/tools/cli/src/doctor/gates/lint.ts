/**
 * lint gate — wraps `@pyreon/lint:lint`.
 *
 * Runs the project's configured Pyreon lint rules across the source
 * tree. Per-finding category is derived from the rule ID's prefix
 * (the lint rule categories: reactivity, jsx, lifecycle, performance,
 * ssr, architecture, store, form, styling, hooks, accessibility,
 * router, ssg) — `performance` rules emit `category: 'performance'`,
 * `architecture` rules emit `category: 'architecture'`, the rest fold
 * to `'correctness'` since they're all "your code is broken in some
 * way" findings from the doctor's perspective.
 *
 * Severity passes through as-is from lint's `Diagnostic.severity`
 * ('error' | 'warning' | 'info' all map 1:1 to the doctor severity
 * shape).
 */

import { lint, allRules } from '@pyreon/lint'

import type {
  Finding,
  FindingCategory,
  GateResult,
  Severity,
} from '../types'

const mapLintSeverity = (s: string): Severity | null => {
  if (s === 'error') return 'error'
  if (s === 'warn') return 'warning'
  if (s === 'info') return 'info'
  return null // 'off'
}

// Build a rule-id → category lookup once at module load. The lint
// rule registry is the source of truth for which category a rule
// belongs to; this map mirrors the doctor's 5-bucket vocabulary.
const RULE_CATEGORY = (() => {
  const map = new Map<string, FindingCategory>()
  for (const rule of allRules) {
    const cat = mapLintCategory(rule.meta.category)
    map.set(rule.meta.id, cat)
  }
  return map
})()

function mapLintCategory(c: string): FindingCategory {
  switch (c) {
    case 'performance':
      return 'performance'
    case 'architecture':
    case 'ssr':
    case 'ssg':
    case 'router':
      return 'architecture'
    case 'styling':
    case 'accessibility':
      return 'architecture'
    default:
      // reactivity, jsx, lifecycle, store, form, hooks → all
      // user-code correctness from the doctor's vocabulary.
      return 'correctness'
  }
}

export interface LintGateOptions {
  cwd: string
  /** Apply lint auto-fixes during the run. */
  fix?: boolean | undefined
}

export const runLintGate = async (
  opts: LintGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []

  const result = await lint({
    paths: [opts.cwd],
    fix: opts.fix ?? false,
  })

  for (const fileResult of result.files) {
    for (const diag of fileResult.diagnostics) {
      const severity = mapLintSeverity(diag.severity)
      if (severity === null) continue
      const category = RULE_CATEGORY.get(diag.ruleId) ?? 'correctness'
      findings.push({
        category,
        severity,
        code: `lint/${diag.ruleId}`,
        gate: 'lint',
        message: diag.message,
        location: {
          path: fileResult.filePath,
          relPath: fileResult.filePath,
          line: diag.loc.line,
          column: diag.loc.column,
        },
        fixable: diag.fix !== undefined,
      })
    }
  }

  // Surface config-level diagnostics as architecture errors — they
  // mean the user's `.pyreonlintrc.json` has malformed rule options.
  for (const cd of result.configDiagnostics) {
    const severity = mapLintSeverity(cd.severity)
    if (severity === null) continue
    findings.push({
      category: 'architecture',
      severity,
      code: `lint/config-${cd.ruleId}`,
      gate: 'lint',
      message: cd.message,
    })
  }

  return {
    gate: 'lint',
    category: 'correctness',
    findings,
    meta: {
      scanned: result.files.length,
      elapsedMs: Date.now() - start,
    },
  }
}
