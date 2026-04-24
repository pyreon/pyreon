/**
 * pyreon doctor — project-wide health check for AI-friendly development
 *
 * Runs a pipeline of checks:
 *  1. React pattern detection (imports, hooks, JSX attributes)
 *  2. Import source validation (@pyreon/* vs react/vue)
 *  3. Common Pyreon mistakes (signal without call, key vs by, etc.)
 *
 * Output modes:
 *  - Human-readable (default): colored terminal output
 *  - JSON (--json): structured output for AI agent consumption
 *  - CI (--ci): exits with code 1 on any error
 *
 * Fix mode (--fix): auto-applies safe transforms via migrateReactCode
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  auditTestEnvironment,
  type AuditRisk,
  detectReactPatterns,
  formatTestAudit,
  hasReactPatterns,
  migrateReactCode,
  type ReactDiagnostic,
} from '@pyreon/compiler'

export interface DoctorOptions {
  fix: boolean
  json: boolean
  ci: boolean
  cwd: string
  /**
   * When true, run the test-environment audit (mock-vnode pattern
   * detection) and append the result to the doctor output. Default
   * false — the audit is scoped to test files only and isn't part of
   * the React-migration check pipeline, so we gate it to avoid noise
   * in the typical "is my migration done?" call.
   */
  auditTests?: boolean | undefined
  /** Minimum risk level to include in the test-audit report. Default 'medium'. */
  auditMinRisk?: AuditRisk | undefined
}

interface FileResult {
  file: string
  diagnostics: ReactDiagnostic[]
  fixed: boolean
}

interface DoctorResult {
  passed: boolean
  files: FileResult[]
  summary: {
    filesScanned: number
    filesWithIssues: number
    totalErrors: number
    totalFixable: number
    totalFixed: number
  }
}

export async function doctor(options: DoctorOptions): Promise<number> {
  const startTime = performance.now()
  const files = collectSourceFiles(options.cwd)
  const result = runChecks(files, options)
  const elapsed = Math.round(performance.now() - startTime)

  if (options.json) {
    printJson(result)
  } else {
    printHuman(result, elapsed)
  }

  // Test-environment audit — optional follow-on pass. We run AFTER the
  // main React-migration output so a migration-focused run isn't
  // contaminated; pass `--audit-tests` to see it. The exit code is
  // unaffected since mock-vnode test risk is a "should review" signal,
  // not a "broken build" signal.
  if (options.auditTests) {
    const auditResult = auditTestEnvironment(options.cwd)
    if (options.json) {
      console.log('')
      console.log(JSON.stringify({ testAudit: auditResult }, null, 2))
    } else {
      console.log('')
      console.log(formatTestAudit(auditResult, { minRisk: options.auditMinRisk ?? 'medium' }))
      console.log('')
    }
  }

  return result.summary.totalErrors
}

// ═══════════════════════════════════════════════════════════════════════════════
// File collection
// ═══════════════════════════════════════════════════════════════════════════════

const sourceExtensions = new Set(['.tsx', '.jsx', '.ts', '.js'])
const sourceIgnoreDirs = new Set([
  'node_modules',
  'dist',
  'lib',
  '.pyreon',
  '.git',
  '.next',
  'build',
])

function shouldSkipDirEntry(entry: fs.Dirent): boolean {
  if (!entry.isDirectory()) return false
  return entry.name.startsWith('.') || sourceIgnoreDirs.has(entry.name)
}

function walkSourceFiles(dir: string, results: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (shouldSkipDirEntry(entry)) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, results)
    } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      results.push(fullPath)
    }
  }
}

function collectSourceFiles(cwd: string): string[] {
  const results: string[] = []
  walkSourceFiles(cwd, results)
  return results
}

// ═══════════════════════════════════════════════════════════════════════════════
// Check pipeline
// ═══════════════════════════════════════════════════════════════════════════════

function checkFileWithFix(
  file: string,
  relPath: string,
): { result: FileResult | null; fixCount: number } {
  let code: string
  try {
    code = fs.readFileSync(file, 'utf-8')
  } catch {
    return { result: null, fixCount: 0 }
  }

  if (!hasReactPatterns(code)) return { result: null, fixCount: 0 }

  const migrated = migrateReactCode(code, relPath)
  if (migrated.changes.length > 0) {
    fs.writeFileSync(file, migrated.code, 'utf-8')
  }
  const remaining = detectReactPatterns(migrated.code, relPath)
  if (remaining.length > 0 || migrated.changes.length > 0) {
    return {
      result: { file: relPath, diagnostics: remaining, fixed: migrated.changes.length > 0 },
      fixCount: migrated.changes.length,
    }
  }
  return { result: null, fixCount: 0 }
}

function checkFileDetectOnly(file: string, relPath: string): FileResult | null {
  let code: string
  try {
    code = fs.readFileSync(file, 'utf-8')
  } catch {
    return null
  }

  if (!hasReactPatterns(code)) return null

  const diagnostics = detectReactPatterns(code, relPath)
  if (diagnostics.length > 0) {
    return { file: relPath, diagnostics, fixed: false }
  }
  return null
}

function runChecks(files: string[], options: DoctorOptions): DoctorResult {
  const fileResults: FileResult[] = []
  let totalFixed = 0

  for (const file of files) {
    const relPath = path.relative(options.cwd, file)

    if (options.fix) {
      const { result, fixCount } = checkFileWithFix(file, relPath)
      totalFixed += fixCount
      if (result) fileResults.push(result)
    } else {
      const result = checkFileDetectOnly(file, relPath)
      if (result) fileResults.push(result)
    }
  }

  const totalErrors = fileResults.reduce((sum, f) => sum + f.diagnostics.length, 0)
  const totalFixable = fileResults.reduce(
    (sum, f) => sum + f.diagnostics.filter((d) => d.fixable).length,
    0,
  )

  return {
    passed: totalErrors === 0,
    files: fileResults,
    summary: {
      filesScanned: files.length,
      filesWithIssues: fileResults.length,
      totalErrors,
      totalFixable,
      totalFixed,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Output formatters
// ═══════════════════════════════════════════════════════════════════════════════

function printJson(result: DoctorResult): void {
  console.log(JSON.stringify(result, null, 2))
}

function printFileResult(fileResult: FileResult): void {
  if (fileResult.diagnostics.length === 0) return

  console.log(`  ${fileResult.file}${fileResult.fixed ? ' (partially fixed)' : ''}`)

  for (const diag of fileResult.diagnostics) {
    const fixTag = diag.fixable ? ' [fixable]' : ''
    console.log(`    ${diag.line}:${diag.column} — ${diag.message}${fixTag}`)
    console.log(`      Current:   ${diag.current}`)
    console.log(`      Suggested: ${diag.suggested}`)
    console.log('')
  }
}

function printSummary(summary: DoctorResult['summary']): void {
  console.log(
    `  ${summary.totalErrors} issue${summary.totalErrors === 1 ? '' : 's'} in ${summary.filesWithIssues} file${summary.filesWithIssues === 1 ? '' : 's'}`,
  )
  if (summary.totalFixable > 0) {
    console.log(`  ${summary.totalFixable} auto-fixable — run 'pyreon doctor --fix' to apply`)
  }
  console.log('')
}

function printHuman(result: DoctorResult, elapsed: number): void {
  const { summary } = result

  console.log('')
  console.log(`  Pyreon Doctor — scanned ${summary.filesScanned} files in ${elapsed}ms`)
  console.log('')

  if (result.passed && summary.totalFixed === 0) {
    console.log('  ✓ No issues found. Your code is Pyreon-native!')
    console.log('')
    return
  }

  if (summary.totalFixed > 0) {
    console.log(`  ✓ Auto-fixed ${summary.totalFixed} issue${summary.totalFixed === 1 ? '' : 's'}`)
    console.log('')
  }

  for (const fileResult of result.files) {
    printFileResult(fileResult)
  }

  printSummary(summary)
}
