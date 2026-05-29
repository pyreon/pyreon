#!/usr/bin/env bun
// Type-mapper / compiler coverage gate against real-world Pyreon TSX.
//
// Per the Phase 0 roadmap (#797) PR 6: ≥90% of existing Pyreon source
// should compile to Swift without manual annotations. This script
// measures coverage by walking every `.tsx` file under `examples/`
// and `packages/` (excluding tests + node_modules) and reporting:
//
//   1. transform(swift) succeeded (no throw)
//   2. transform produced zero warnings
//   3. emitted Swift passes `swiftc -parse`
//
// Output: JSON when --json, human-readable otherwise. Exit codes:
//   0 — coverage ≥ threshold
//   1 — coverage < threshold
//
// Threshold is opt-in via `--threshold=N`; defaults to a Phase 0
// floor of 10% (low intentionally — the goal of this script
// initially is REPORTING + baseline tracking, not gating).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from '../src/index'
import { isSwiftcAvailable, validateSwift } from '../src/validate'

interface FileResult {
  path: string
  parsed: boolean
  warningCount: number
  swiftValid: boolean | null // null when swiftc unavailable
  error?: string
}

interface CoverageReport {
  totalFiles: number
  parsed: number
  parsedClean: number
  swiftValid: number
  swiftcAvailable: boolean
  files: FileResult[]
}

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..')

// Roots to walk for Pyreon TSX content. examples/ has the most JSX
// surface; packages/ has fewer + mostly test fixtures.
const ROOTS = [join(REPO_ROOT, 'examples'), join(REPO_ROOT, 'packages')]

// Skip patterns — files we don't want to count in coverage. `*.test.tsx`
// are tests; `*.stories.tsx` are Storybook; node_modules + .next + dist
// are build artifacts.
const SKIP_PATTERNS = [
  /\/node_modules\//,
  /\/dist\//,
  /\/lib\//,
  /\/build\//,
  /\/.next\//,
  /\/.cache\//,
  /\.test\.tsx?$/,
  /\.stories\.tsx?$/,
  /\.snap$/,
]

function findTsxFiles(root: string): string[] {
  const found: string[] = []
  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry)
      if (SKIP_PATTERNS.some((p) => p.test(path))) continue
      let s
      try {
        s = statSync(path)
      } catch {
        continue
      }
      if (s.isDirectory()) walk(path)
      else if (s.isFile() && path.endsWith('.tsx')) found.push(path)
    }
  }
  walk(root)
  return found
}

function analyzeFile(filePath: string, swiftc: boolean): FileResult {
  const result: FileResult = {
    path: relative(REPO_ROOT, filePath),
    parsed: false,
    warningCount: 0,
    // null when caller didn't request swiftc validation (default) OR
    // swiftc isn't on PATH.
    swiftValid: swiftc ? false : null,
  }
  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch (err) {
    result.error = `read failed: ${err instanceof Error ? err.message : String(err)}`
    return result
  }

  try {
    const out = transform(source, { target: 'swift' })
    result.parsed = true
    result.warningCount = out.warnings.length

    if (swiftc) {
      const validation = validateSwift(out.code)
      result.swiftValid = validation.ok
      if (!validation.ok && validation.error) {
        // Truncate the error so the JSON output stays readable.
        result.error = validation.error.slice(0, 200)
      }
    }
  } catch (err) {
    result.error = `transform threw: ${err instanceof Error ? err.message : String(err)}`
  }

  return result
}

function generateReport(
  threshold: number,
  validateSwiftc: boolean,
): { report: CoverageReport; passed: boolean } {
  // swiftc validation is opt-in. The compile-only baseline is the
  // primary gate; swiftc validation adds another ~5-15 seconds per
  // file (the temp-dir + execFileSync cost) which is fine for a one-
  // off run but too slow for CI on every PR.
  const swiftc = validateSwiftc && isSwiftcAvailable()
  const allFiles = ROOTS.flatMap(findTsxFiles)
  const results = allFiles.map((f) => analyzeFile(f, swiftc))
  const parsed = results.filter((r) => r.parsed).length
  const parsedClean = results.filter((r) => r.parsed && r.warningCount === 0).length
  const swiftValid = swiftc ? results.filter((r) => r.swiftValid).length : 0
  const report: CoverageReport = {
    totalFiles: results.length,
    parsed,
    parsedClean,
    swiftValid,
    swiftcAvailable: swiftc,
    files: results,
  }
  // The gate measures `parsedClean / total` — that's the actually
  // meaningful metric. `parsed` is too permissive (the compiler always
  // produces SOMETHING for valid Pyreon JSX, even if the output is
  // degraded with warnings); `parsedClean` is the subset that emits
  // without ANY compiler warnings — i.e., real coverage.
  const coverage = results.length === 0 ? 0 : (parsedClean / results.length) * 100
  const passed = coverage >= threshold
  return { report, passed }
}

function printHuman(report: CoverageReport, threshold: number): void {
  const pct = report.totalFiles === 0 ? 0 : (report.parsed / report.totalFiles) * 100
  const cleanPct = report.totalFiles === 0 ? 0 : (report.parsedClean / report.totalFiles) * 100
  console.log('PMTC compiler coverage report')
  console.log('=============================')
  console.log(`Total .tsx files surveyed:    ${report.totalFiles}`)
  console.log(`Parsed (transform didn't throw): ${report.parsed} (${pct.toFixed(1)}%)`)
  console.log(`Parsed with zero warnings:    ${report.parsedClean} (${cleanPct.toFixed(1)}%)`)
  if (report.swiftcAvailable) {
    const swiftPct = report.totalFiles === 0 ? 0 : (report.swiftValid / report.totalFiles) * 100
    console.log(`Swift output validates:       ${report.swiftValid} (${swiftPct.toFixed(1)}%)`)
  } else {
    console.log(`Swift output validates:       (swiftc not on PATH; skipped)`)
  }
  console.log()
  console.log(`Threshold: ≥${threshold}% parsedClean (gated only when --gate)`)
  const passed = cleanPct >= threshold
  console.log(`Result: ${passed ? '✓ PASS' : '✗ FAIL'}`)
}

const args = process.argv.slice(2)
const jsonOut = args.includes('--json')
const includeSwiftc = args.includes('--swiftc-validate')
const gate = args.includes('--gate')
const thresholdArg = args.find((a) => a.startsWith('--threshold='))

// Two modes:
//   - Default (REPORT): always exits 0. Useful for local dev + CI
//     reporting steps that should never fail the build.
//   - --gate: exits non-zero when `parsedClean / total < threshold`.
//     Use in CI to enforce a non-regression floor.
//
// Threshold is a RATCHET: set just below the current measured baseline
// so any regression bites immediately. Bump as the compiler grows.
// Override via --threshold=N.
//
// Measured baseline as of 2026-05-21 (525 .tsx files surveyed across
// `examples/` + `packages/`): 73.0% parsedClean (transform succeeded +
// emitted ZERO warnings). 70 = 3pp below baseline — catches drift
// without flaking on the noise floor.
//
// Note: parsedClean is a CONSERVATIVE metric — only counts files with
// EXACTLY ZERO warnings as "passing". The stricter "swiftc -parse
// accepts the emitted output" metric (via `--swiftc-validate`)
// measures at 94.3% on the same corpus. Both numbers grow together
// as the compiler closes mapping gaps; this gate uses parsedClean
// because it doesn't require swiftc on the runner.
const DEFAULT_THRESHOLD = 70
const threshold = thresholdArg
  ? Number(thresholdArg.slice('--threshold='.length))
  : DEFAULT_THRESHOLD

const { report, passed } = generateReport(threshold, includeSwiftc)
if (jsonOut) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printHuman(report, threshold)
}
process.exit(gate && !passed ? 1 : 0)
