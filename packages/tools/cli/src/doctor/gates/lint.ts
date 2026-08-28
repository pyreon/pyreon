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

import * as path from 'node:path'

import { lint, allRules } from '@pyreon/lint'

import type { Severity as LintSeverity } from '@pyreon/lint'

import type {
  Finding,
  FindingCategory,
  GateResult,
  Severity,
} from '../types'
import { emptyScanResult } from '../utils/empty-scan'
import {
  collectAuditableSourceFiles,
  collectFilesMatching,
  isPackageConfigFile,
  isTestSourceFile,
} from '../utils/walk'
import {
  resolveWorkspaceRoots,
  type WorkspaceRoots,
} from '../utils/workspace-roots'

/**
 * Map a `@pyreon/lint` severity string to the doctor's `Severity` type.
 * Returns null for 'off' (or any unknown string), which the gate
 * runner treats as "skip this diagnostic". Exported for unit testing.
 */
export const _mapLintSeverity = (s: string): Severity | null => {
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
    // Opt-in best-practice rules (`meta.optIn`) route to the ADVISORY
    // `best-practices` doctor category regardless of their lint
    // category — so a project that enables them gets the findings
    // surfaced WITHOUT tanking correctness/architecture or failing
    // `--ci` (opinionated best practices ≠ a broken codebase).
    const cat: FindingCategory = rule.meta.optIn
      ? 'best-practices'
      : mapLintCategory(rule.meta.category)
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
  /**
   * Pre-resolved workspace roots (the orchestrator resolves once and
   * shares). Absent → resolved from `cwd`.
   */
  workspace?: WorkspaceRoots | undefined
}

export const runLintGate = async (
  opts: LintGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []

  // Objective scope: lint the workspace's OWN declared package roots
  // (per-package `src/**` when present), not example apps, e2e/docs/
  // scripts, or detector test-fixtures. `@pyreon/lint` still layers
  // the project's `.pyreonlintrc.json` config + `exemptPaths` on top —
  // `lint()` accepts an explicit file list (gatherFiles' isFile
  // branch), so the curated config is unchanged; only the surface is.
  const ws = opts.workspace ?? resolveWorkspaceRoots(opts.cwd)
  const files = collectAuditableSourceFiles(ws)
  // Feeding lint an empty path list would silently lint NOTHING and
  // report a clean pass — skip loudly instead (workspace-roots fix).
  if (files.length === 0) {
    return emptyScanResult('lint', 'correctness', ws, start)
  }
  const result = await lint({
    paths: files,
    fix: opts.fix ?? false,
  })

  // A rule whose SUBJECT is a test file or a package-root config can never
  // fire against the source scan above — those paths are excluded from it by
  // design. Two shipped rules were in that state, both configured at `error`
  // and both structurally unable to report: `no-query-selector-cast-in-test`
  // (2,159 test files, none in scope) and `vitest-config-uses-shared` (115
  // configs, none in scope). A gate that cannot fail is worse than no gate —
  // it advertises protection it does not provide.
  //
  // So each extra target gets its OWN pass over its OWN files, with every
  // other rule turned off. Running the full rule set over tests instead would
  // reintroduce precisely the noise the source-scan exclusions exist to avoid.
  const extraScans: Array<{
    target: 'test' | 'packageConfig'
    predicate: (relPath: string) => boolean
  }> = [
    { target: 'test', predicate: isTestSourceFile },
    { target: 'packageConfig', predicate: isPackageConfigFile },
  ]

  const fileResults = [...result.files]
  const configDiagnostics = [...result.configDiagnostics]
  // Reported as `scanned`, so it must count every file actually linted —
  // under-reporting here would hide the extra surface this loop exists to add.
  let scanned = result.files.length

  for (const scan of extraScans) {
    const targetRuleIds = allRules
      .filter((r) => r.meta.scanTarget === scan.target)
      .map((r) => r.meta.id)
    if (targetRuleIds.length === 0) continue

    const targetFiles = collectFilesMatching(ws, scan.predicate)
    if (targetFiles.length === 0) continue

    // Everything EXCEPT the target rules is forced off. The target rules are
    // omitted from the overrides so they keep whatever severity the project's
    // config gave them — including `off`, which must stay off.
    const off: Record<string, LintSeverity> = {}
    const targeted = new Set(targetRuleIds)
    for (const r of allRules) if (!targeted.has(r.meta.id)) off[r.meta.id] = 'off'

    const extra = await lint({
      paths: targetFiles,
      fix: opts.fix ?? false,
      ruleOverrides: off,
    })
    scanned += extra.files.length
    for (const fr of extra.files) if (fr.diagnostics.length > 0) fileResults.push(fr)
  }

  for (const fileResult of fileResults) {
    for (const diag of fileResult.diagnostics) {
      const severity = _mapLintSeverity(diag.severity)
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
          relPath: path.relative(ws.repoRoot, fileResult.filePath),
          line: diag.loc.line,
          column: diag.loc.column,
        },
        fixable: diag.fix !== undefined,
      })
    }
  }

  // Surface config-level diagnostics as architecture errors — they
  // mean the user's `.pyreonlintrc.json` has malformed rule options.
  for (const cd of configDiagnostics) {
    const severity = _mapLintSeverity(cd.severity)
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
      scanned,
      elapsedMs: Date.now() - start,
    },
  }
}
