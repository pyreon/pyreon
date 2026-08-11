#!/usr/bin/env bun
/**
 * check-multiplatform-matrix — assert the multiplatform capability
 * matrix's HEADLINE equals the sum of its own table.
 *
 * Why this gate exists: docs/src/content/docs/multiplatform.md declares
 * its weighted matrix "the denominator for every N% claim" and instructs
 * "do not edit the totals without recomputing" — but nothing enforced
 * that, and the page accumulated THREE disagreeing self-ratings at once
 * (a "66/100" status header, a "≈ 72% (81.8 / 113)" headline, and a
 * table whose rows actually summed to 83.0 / 113 ≈ 73.5%). Rows were
 * bumped without recomputing the total, which is exactly the drift mode
 * `check-doc-claims` guards elsewhere. This gate closes it for the one
 * number the whole multiplatform effort is steered by.
 *
 * What it checks:
 *   1. The table under "## Production capability matrix" parses — every
 *      data row yields (category, integer weight ≥ 1, fraction in
 *      [0, 1]). A row that LOOKS like a data row but doesn't parse is an
 *      ERROR, not a skip (silent-filter anti-pattern).
 *   2. No duplicate categories.
 *   3. The headline `**≈ N%** (E / T` appears EXACTLY once and its three
 *      numbers equal round(Σwf/Σw × 100), Σwf to one decimal, and Σw.
 *   4. An empty table (or a missing headline) FAILS — a gate whose input
 *      set is empty must never report a clean pass.
 *
 * Run:
 *   bun scripts/check-multiplatform-matrix.ts          # exit 1 on drift
 *   bun scripts/check-multiplatform-matrix.ts --json   # machine-readable
 *
 * Wired into validate-fast + the CI `Fast Gates` job. Pure logic is
 * unit-tested in
 * packages/internals/test-utils/src/tests/check-multiplatform-matrix.test.ts.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const MATRIX_DOC = 'docs/src/content/docs/multiplatform.md'

const SECTION_HEADING = '## Production capability matrix'
const TABLE_HEADER = /^\|\s*Category\s*\|\s*Weight\s*\|\s*R4\+ fraction\s*\|/

export interface MatrixRow {
  category: string
  weight: number
  fraction: number
}

export interface ParseResult {
  rows: MatrixRow[]
  issues: string[]
}

/**
 * Parse the capability-matrix table out of the full markdown source.
 * Fail-closed: unparseable rows inside the table region are issues,
 * an absent section/header/rows is an issue.
 */
export function parseMatrixRows(md: string): ParseResult {
  const issues: string[] = []
  const rows: MatrixRow[] = []

  const sectionAt = md.indexOf(SECTION_HEADING)
  if (sectionAt === -1) {
    return { rows, issues: [`section heading "${SECTION_HEADING}" not found`] }
  }

  const lines = md.slice(sectionAt).split('\n')
  const headerIdx = lines.findIndex((l) => TABLE_HEADER.test(l))
  if (headerIdx === -1) {
    return { rows, issues: ['matrix table header (| Category | Weight | R4+ fraction |) not found'] }
  }

  // Data rows: every `|`-prefixed line after the header until the first
  // non-table line. The `| --- |` separator is skipped explicitly.
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.startsWith('|')) break
    if (/^\|\s*-{3,}/.test(line)) continue

    const m = /^\|([^|]+)\|\s*(\d+)\s*\|\s*(\d+(?:\.\d+)?)\s*\|/.exec(line)
    if (!m) {
      issues.push(`row ${i - headerIdx} does not parse as | category | int | fraction |: ${line.slice(0, 80)}…`)
      continue
    }
    const category = m[1]!.trim()
    const weight = Number(m[2])
    const fraction = Number(m[3])
    if (weight < 1) issues.push(`"${category}": weight must be a positive integer, got ${weight}`)
    if (fraction < 0 || fraction > 1) issues.push(`"${category}": fraction must be in [0, 1], got ${fraction}`)
    rows.push({ category, weight, fraction })
  }

  if (rows.length === 0) issues.push('matrix table has ZERO data rows — empty scan is a failure, not a pass')

  const seen = new Set<string>()
  for (const r of rows) {
    if (seen.has(r.category)) issues.push(`duplicate category: "${r.category}"`)
    seen.add(r.category)
  }

  return { rows, issues }
}

export interface Totals {
  /** Σ weight */
  total: number
  /** Σ weight × fraction, rounded to 2 decimals (row fractions have ≤2) */
  earned: number
  /** earned / total × 100 */
  pct: number
}

export function computeTotals(rows: MatrixRow[]): Totals {
  const total = rows.reduce((a, r) => a + r.weight, 0)
  // Row-wise products are exact at ≤2-decimal fractions × int weights up
  // to the 2nd decimal; round once at the end to kill float dust.
  const earned = Math.round(rows.reduce((a, r) => a + r.weight * r.fraction, 0) * 100) / 100
  const pct = total === 0 ? 0 : (earned / total) * 100
  return { total, earned, pct }
}

/** The headline shape the doc must carry: `**≈ N%** (E / T` (E to 1 decimal). */
const HEADLINE = /\*\*≈ (\d+)%\*\* \((\d+\.\d) \/ (\d+)/g

export function verifyHeadline(md: string, totals: Totals): string[] {
  const issues: string[] = []
  const matches = [...md.matchAll(HEADLINE)]
  if (matches.length === 0) {
    return ['headline `**≈ N%** (E.d / T` not found — the doc must state the computed total in exactly this shape']
  }
  if (matches.length > 1) {
    issues.push(`headline pattern found ${matches.length}× — it must appear exactly once so there is ONE number`)
  }
  const [, pctStr, earnedStr, totalStr] = matches[0]!
  const wantPct = Math.round(totals.pct)
  const wantEarned = totals.earned.toFixed(1)
  if (Number(pctStr) !== wantPct) {
    issues.push(`headline says ≈ ${pctStr}% but the table sums to ≈ ${wantPct}% (${totals.pct.toFixed(2)}%)`)
  }
  if (earnedStr !== wantEarned) {
    issues.push(`headline says ${earnedStr} earned but the table sums to ${wantEarned}`)
  }
  if (Number(totalStr) !== totals.total) {
    issues.push(`headline says / ${totalStr} but the table's weights sum to ${totals.total}`)
  }
  return issues
}

function main(): void {
  // import.meta.dirname (not bun's `.dir`) — this file is typechecked through
  // the test-utils suite, whose ImportMeta typing carries only the standard field.
  const repoRoot = resolve(import.meta.dirname, '..')
  const docPath = resolve(repoRoot, MATRIX_DOC)
  const md = readFileSync(docPath, 'utf8')

  const { rows, issues } = parseMatrixRows(md)
  const totals = computeTotals(rows)
  const allIssues = [...issues, ...(rows.length > 0 ? verifyHeadline(md, totals) : [])]

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ rows: rows.length, ...totals, issues: allIssues }, null, 2))
    process.exit(allIssues.length > 0 ? 1 : 0)
  }

  if (allIssues.length > 0) {
    console.error(`✗ Multiplatform matrix drift in ${MATRIX_DOC}:`)
    for (const issue of allIssues) console.error(`  - ${issue}`)
    console.error(
      `\n  The table is the source of truth. Recompute: Σ(weight × fraction) = ${totals.earned.toFixed(1)} / ${totals.total} ≈ ${Math.round(totals.pct)}%` +
        `\n  and update the headline to exactly: **≈ ${Math.round(totals.pct)}%** (${totals.earned.toFixed(1)} / ${totals.total}`,
    )
    process.exit(1)
  }

  console.log(
    `✓ Multiplatform matrix — ${rows.length} rows, headline matches the table: ≈ ${Math.round(totals.pct)}% (${totals.earned.toFixed(1)} / ${totals.total}).`,
  )
}

if (import.meta.main) main()
