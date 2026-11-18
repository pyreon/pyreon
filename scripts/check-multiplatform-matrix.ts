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
 *   5. The "## Maturity by area" table (`| Area | Tier |`) lists EXACTLY
 *      the matrix categories (none missing, none extra, none duplicated)
 *      and each tier equals `tierFor(fraction)`: Beta ≥ 0.8, Experimental
 *      ≥ 0.4, otherwise Not ready. The tier is DERIVED, never chosen —
 *      a row whose fraction moves must move its tier in the same edit.
 *   6. Every `**Beta areas:** …` / `**Experimental areas:** …` /
 *      `**Not-ready areas:** …` summary line on any docs page lists
 *      exactly the categories in that tier (short names — the category
 *      without its trailing parenthetical — or full names), so the
 *      summaries on other pages cannot drift from the table either. The
 *      matrix page itself must carry at least one such summary.
 *   7. The "## Road to Stable (closed scope)" section closes the scope.
 *      Its three tables — `| (A) ID |` reachable without credentials,
 *      `| (B) ID |` blocked on maintainer credentials or accounts, and
 *      `| (C) ID |` out of native scope by architecture — must each name
 *      an EXISTING matrix row in their "Matrix row" cell, carry a gain
 *      (A/B) or share (C) above zero, and state Points = weight × gain.
 *      Every row below 1.0 must be fully accounted for: its fraction plus
 *      the gains and shares of all its items equals exactly 1.0, and a row
 *      already at 1.0 carries no items. Landing an item therefore forces
 *      the same edit to raise the row and delete the item. The section's
 *      stated totals — `**(A) total:**`, `**(B) total:**`, `**(C)
 *      remainder:**`, `**Projected after (A):**` and `**Projected after
 *      (A) + (B):**` — must equal what the tables imply.
 *
 * Run:
 *   bun scripts/check-multiplatform-matrix.ts          # exit 1 on drift
 *   bun scripts/check-multiplatform-matrix.ts --json   # machine-readable
 *
 * Wired into validate-fast + the CI `Fast Gates` job. Pure logic is
 * unit-tested in
 * packages/internals/test-utils/src/tests/check-multiplatform-matrix.test.ts.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export const MATRIX_DOC = 'docs/src/content/docs/multiplatform.md'
/** Every page under here is scanned for tier summary lines. */
export const DOCS_DIR = 'docs/src/content/docs'

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
    return {
      rows,
      issues: ['matrix table header (| Category | Weight | R4+ fraction |) not found'],
    }
  }

  // Data rows: every `|`-prefixed line after the header until the first
  // non-table line. The `| --- |` separator is skipped explicitly.
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.startsWith('|')) break
    if (/^\|\s*-{3,}/.test(line)) continue

    const m = /^\|([^|]+)\|\s*(\d+)\s*\|\s*(\d+(?:\.\d+)?)\s*\|/.exec(line)
    if (!m) {
      issues.push(
        `row ${i - headerIdx} does not parse as | category | int | fraction |: ${line.slice(0, 80)}…`,
      )
      continue
    }
    const category = m[1]!.trim()
    const weight = Number(m[2])
    const fraction = Number(m[3])
    if (weight < 1) issues.push(`"${category}": weight must be a positive integer, got ${weight}`)
    if (fraction < 0 || fraction > 1) {
      issues.push(`"${category}": fraction must be in [0, 1], got ${fraction}`)
    }
    rows.push({ category, weight, fraction })
  }

  if (rows.length === 0) {
    issues.push('matrix table has ZERO data rows — empty scan is a failure, not a pass')
  }

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
    return [
      'headline `**≈ N%** (E.d / T` not found — the doc must state the computed total in exactly this shape',
    ]
  }
  if (matches.length > 1) {
    issues.push(
      `headline pattern found ${matches.length}× — it must appear exactly once so there is ONE number`,
    )
  }
  const [, pctStr, earnedStr, totalStr] = matches[0]!
  const wantPct = Math.round(totals.pct)
  const wantEarned = totals.earned.toFixed(1)
  if (Number(pctStr) !== wantPct) {
    issues.push(
      `headline says ≈ ${pctStr}% but the table sums to ≈ ${wantPct}% (${totals.pct.toFixed(2)}%)`,
    )
  }
  if (earnedStr !== wantEarned) {
    issues.push(`headline says ${earnedStr} earned but the table sums to ${wantEarned}`)
  }
  if (Number(totalStr) !== totals.total) {
    issues.push(`headline says / ${totalStr} but the table's weights sum to ${totals.total}`)
  }
  return issues
}

// ─── Maturity tiers ──────────────────────────────────────────────────────────

export type Tier = 'Beta' | 'Experimental' | 'Not ready'

export const TIERS: readonly Tier[] = ['Beta', 'Experimental', 'Not ready']

/** The tier rule. Derived ONLY from the matrix fraction — never chosen by hand. */
export function tierFor(fraction: number): Tier {
  if (fraction >= 0.8) return 'Beta'
  if (fraction >= 0.4) return 'Experimental'
  return 'Not ready'
}

const TIER_SECTION_HEADING = '## Maturity by area'
const TIER_TABLE_HEADER = /^\|\s*Area\s*\|\s*Tier\s*\|/

export interface TierRow {
  area: string
  tier: string
}

export interface TierParseResult {
  rows: TierRow[]
  issues: string[]
}

/** Parse the `| Area | Tier |` table under "## Maturity by area". Fail-closed like the matrix parse. */
export function parseTierTable(md: string): TierParseResult {
  const rows: TierRow[] = []
  const issues: string[] = []
  const sectionAt = md.indexOf(TIER_SECTION_HEADING)
  if (sectionAt === -1) {
    return { rows, issues: [`section heading "${TIER_SECTION_HEADING}" not found`] }
  }
  const lines = md.slice(sectionAt).split('\n')
  const headerIdx = lines.findIndex((l) => TIER_TABLE_HEADER.test(l))
  if (headerIdx === -1) {
    return { rows, issues: ['maturity table header (| Area | Tier |) not found'] }
  }
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.startsWith('|')) break
    if (/^\|\s*-{3,}/.test(line)) continue
    const m = /^\|([^|]+)\|([^|]+)\|/.exec(line)
    if (!m) {
      issues.push(
        `maturity row ${i - headerIdx} does not parse as | area | tier |: ${line.slice(0, 80)}…`,
      )
      continue
    }
    rows.push({ area: m[1]!.trim(), tier: m[2]!.trim().replace(/^\*\*(.*)\*\*$/, '$1') })
  }
  if (rows.length === 0) {
    issues.push('maturity table has ZERO data rows — empty scan is a failure, not a pass')
  }
  return { rows, issues }
}

/** Compare the maturity table against the matrix: same areas, and tier === tierFor(fraction). */
export function verifyTiers(matrix: MatrixRow[], tiers: TierRow[]): string[] {
  const issues: string[] = []
  const byCategory = new Map(matrix.map((r) => [r.category, r]))
  const seen = new Set<string>()
  for (const t of tiers) {
    if (seen.has(t.area)) issues.push(`maturity table: duplicate area "${t.area}"`)
    seen.add(t.area)
    const row = byCategory.get(t.area)
    if (!row) {
      issues.push(
        `maturity table: area "${t.area}" is not a matrix category (Area must be the exact category name)`,
      )
      continue
    }
    const want = tierFor(row.fraction)
    if (t.tier !== want) {
      issues.push(
        `maturity table: "${t.area}" says ${t.tier} but its fraction ${row.fraction} makes it ${want}`,
      )
    }
  }
  for (const r of matrix) {
    if (!seen.has(r.category)) {
      issues.push(
        `maturity table: matrix category "${r.category}" has no row (expected tier ${tierFor(r.fraction)})`,
      )
    }
  }
  return issues
}

/** A category's short name: the category without its trailing `(…)` scope note. */
export function shortName(category: string): string {
  return category.replace(/\s*\([^)]*\)\s*$/, '')
}

const SUMMARY_LABEL: Record<Tier, string> = {
  Beta: 'Beta',
  Experimental: 'Experimental',
  'Not ready': 'Not-ready',
}
const SUMMARY = /\*\*(Beta|Experimental|Not-ready) areas:\*\*([^.\n]*)\./g

/**
 * Check every `**<Tier> areas:** A, B, C.` summary line in `md` against the
 * matrix. Returns the issues and how many summary lines were found.
 */
export function verifyTierSummaries(
  md: string,
  matrix: MatrixRow[],
  where: string,
): { issues: string[]; found: number } {
  const issues: string[] = []
  const lookup = new Map<string, string>()
  for (const r of matrix) {
    lookup.set(r.category, r.category)
    lookup.set(shortName(r.category), r.category)
  }
  let found = 0
  for (const m of md.matchAll(SUMMARY)) {
    found++
    const label = m[1]!
    const tier = TIERS.find((t) => SUMMARY_LABEL[t] === label)!
    const listed = m[2]!
      .split(',')
      .map((s) => s.trim().replace(/^and\s+/, ''))
      .filter((s) => s.length > 0)
    const want = matrix.filter((r) => tierFor(r.fraction) === tier).map((r) => r.category)
    const got = new Set<string>()
    for (const name of listed) {
      const category = lookup.get(name)
      if (!category) {
        issues.push(`${where}: "${label} areas" lists "${name}", which is not a matrix category`)
      } else got.add(category)
    }
    for (const c of want) {
      if (!got.has(c)) issues.push(`${where}: "${label} areas" is missing "${shortName(c)}"`)
    }
    for (const c of got) {
      if (!want.includes(c)) {
        issues.push(
          `${where}: "${label} areas" lists "${shortName(c)}", which is ${tierFor(matrix.find((r) => r.category === c)!.fraction)}`,
        )
      }
    }
  }
  return { issues, found }
}

// ─── Road to Stable (closed scope) ───────────────────────────────────────────

export const SCOPE_HEADING = '## Road to Stable (closed scope)'

export type ScopeClass = 'A' | 'B' | 'C'

export interface ScopeItem {
  cls: ScopeClass
  id: string
  row: string
  /** Gain (A/B) or share (C) of the row's fraction. */
  gain: number
  /** The Points cell as written. */
  points: number
  /** Effort (A only): XS | S | M | L. Proposal (C only): stays scored | leaves the row. */
  tag?: string
}

export interface ScopeParseResult {
  items: ScopeItem[]
  issues: string[]
  /** The section's text (heading to the next `## ` heading), '' when absent. */
  section: string
}

const SCOPE_TABLE_HEADER = /^\|\s*\((A|B|C)\) ID\s*\|/
const EFFORTS = new Set(['XS', 'S', 'M', 'L'])
const PROPOSALS = new Set(['stays scored', 'leaves the row'])

function cells(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
}

/** The section's text, from its heading to the next `## ` heading; '' when absent. */
function scopeSection(md: string): string {
  const at = md.indexOf(SCOPE_HEADING)
  if (at === -1) return ''
  const rest = md.slice(at + SCOPE_HEADING.length)
  const next = rest.search(/\n## /)
  return md.slice(at, at + SCOPE_HEADING.length + (next === -1 ? rest.length : next))
}

const NUMBER_CELL = /^\+?(\d+(?:\.\d+)?)$/

/** One data row of a scope table: the item, or the reason it does not parse. */
function parseScopeRow(cls: ScopeClass, line: string, n: number): ScopeItem | string {
  const width = cls === 'B' ? 5 : 6
  const c = cells(line)
  const gain = NUMBER_CELL.exec(c[3] ?? '')
  const points = NUMBER_CELL.exec(c[4] ?? '')
  if (c.length !== width || !gain || !points || !c[0] || !c[1]) {
    const shape = cls === 'B' ? '' : ', tag'
    return `scope (${cls}) row ${n} does not parse (${width} cells: ID, Matrix row, text, gain, points${shape}): ${line.slice(0, 80)}…`
  }
  const item: ScopeItem = {
    cls,
    id: c[0],
    row: c[1],
    gain: Number(gain[1]),
    points: Number(points[1]),
  }
  if (cls !== 'B') item.tag = c[5] ?? ''
  return item
}

/** The data rows of the table whose header is at `headerIdx`, until the first non-table line. */
function tableRows(lines: string[], headerIdx: number): string[] {
  const out: string[] = []
  for (let j = headerIdx + 1; j < lines.length; j++) {
    const line = lines[j]!
    if (!line.startsWith('|')) break
    if (!/^\|\s*-{3,}/.test(line)) out.push(line)
  }
  return out
}

/**
 * Parse the three scope tables. Columns, by class:
 *   (A) | ID | Matrix row | Item | Gain | Points | Effort |
 *   (B) | ID | Matrix row | Maintainer action | Gain | Points |
 *   (C) | ID | Matrix row | Remainder | Share | Points | Proposal |
 * Fail-closed: a missing section or table, an empty table, or a data row that
 * does not parse is an issue.
 */
export function parseScope(md: string): ScopeParseResult {
  const issues: string[] = []
  const items: ScopeItem[] = []
  const section = scopeSection(md)
  if (section === '') {
    return { items, issues: [`section heading "${SCOPE_HEADING}" not found`], section }
  }
  const lines = section.split('\n')
  const seenTables = new Set<ScopeClass>()
  lines.forEach((line, i) => {
    const header = SCOPE_TABLE_HEADER.exec(line)
    if (!header) return
    const cls = header[1] as ScopeClass
    if (seenTables.has(cls)) issues.push(`scope: more than one (${cls}) table`)
    seenTables.add(cls)
    const rows = tableRows(lines, i)
    if (rows.length === 0) {
      issues.push(`scope: the (${cls}) table has ZERO rows — an empty scope list is a failure`)
    }
    rows.forEach((row, n) => {
      const parsed = parseScopeRow(cls, row, n + 1)
      if (typeof parsed === 'string') issues.push(parsed)
      else items.push(parsed)
    })
  })
  for (const cls of ['A', 'B', 'C'] as const) {
    if (!seenTables.has(cls)) issues.push(`scope: no (${cls}) table (header \`| (${cls}) ID | …\`)`)
  }
  return { items, issues, section }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export interface ScopeTotals {
  a: number
  b: number
  c: number
  /** Earned after all of (A) lands. */
  afterA: number
  /** Earned after (A) and (B) land. */
  afterAB: number
  total: number
}

export function computeScopeTotals(matrix: MatrixRow[], items: ScopeItem[]): ScopeTotals {
  const weight = new Map(matrix.map((r) => [r.category, r.weight]))
  const sum = (cls: ScopeClass): number =>
    round2(
      items
        .filter((i) => i.cls === cls)
        .reduce((acc, i) => acc + (weight.get(i.row) ?? 0) * i.gain, 0),
    )
  const base = computeTotals(matrix)
  const a = sum('A')
  const b = sum('B')
  return {
    a,
    b,
    c: sum('C'),
    afterA: round2(base.earned + a),
    afterAB: round2(base.earned + a + b),
    total: base.total,
  }
}

/** The checks on one item whose row exists: positive gain, Points = weight × gain, a valid Effort / Proposal. */
function itemIssues(item: ScopeItem, row: MatrixRow): string[] {
  const issues: string[] = []
  const label = `scope (${item.cls}) ${item.id}`
  if (!(item.gain > 0)) issues.push(`${label}: gain must be above zero, got ${item.gain}`)
  const want = round2(row.weight * item.gain)
  if (round2(item.points) !== want) {
    issues.push(
      `${label}: Points says ${item.points} but weight ${row.weight} × gain ${item.gain} = ${want.toFixed(2)}`,
    )
  }
  const tag = item.tag ?? ''
  if (item.cls === 'A' && !EFFORTS.has(tag)) {
    issues.push(`${label}: Effort must be one of XS, S, M, L, got "${tag}"`)
  }
  if (item.cls === 'C' && !PROPOSALS.has(tag)) {
    issues.push(`${label}: Proposal must be "stays scored" or "leaves the row", got "${tag}"`)
  }
  return issues
}

/** Every row below 1.0 closes to exactly 1.0; a row at 1.0 carries nothing. */
function closureIssues(matrix: MatrixRow[], accounted: Map<string, number>): string[] {
  const issues: string[] = []
  for (const r of matrix) {
    const items = round2(accounted.get(r.category) ?? 0)
    const got = round2(r.fraction + items)
    if (r.fraction >= 1 && accounted.has(r.category)) {
      issues.push(`scope: "${r.category}" is already at 1.0 but still carries scope items`)
    } else if (r.fraction < 1 && got !== 1) {
      issues.push(
        `scope: "${r.category}" does not close — fraction ${r.fraction} + items ${items} = ${got}, must be exactly 1.0 (every missing share is (A), (B) or (C))`,
      )
    }
  }
  return issues
}

/** Per-item and per-row checks: existing row, positive gain, points = weight × gain, rows close to exactly 1.0. */
export function verifyScopeItems(matrix: MatrixRow[], items: ScopeItem[]): string[] {
  const issues: string[] = []
  const byCategory = new Map(matrix.map((r) => [r.category, r]))
  const ids = new Set<string>()
  const accounted = new Map<string, number>()
  for (const item of items) {
    if (ids.has(item.id)) issues.push(`scope (${item.cls}) ${item.id}: duplicate ID`)
    ids.add(item.id)
    const row = byCategory.get(item.row)
    if (!row) {
      issues.push(
        `scope (${item.cls}) ${item.id}: "${item.row}" is not a matrix row (the Matrix row cell must be the exact category name)`,
      )
      continue
    }
    issues.push(...itemIssues(item, row))
    accounted.set(item.row, (accounted.get(item.row) ?? 0) + item.gain)
  }
  return [...issues, ...closureIssues(matrix, accounted)]
}

/** The section's stated totals must equal what its tables imply. Each statement appears exactly once. */
export function verifyScopeTotals(section: string, totals: ScopeTotals): string[] {
  const issues: string[] = []
  const pct = (earned: number): number => Math.round((earned / totals.total) * 100)
  const checks: Array<{ label: string; re: RegExp; want: string[] }> = [
    {
      label: '**(A) total:** +P points',
      re: /\*\*\(A\) total:\*\* \+(\d+\.\d{2}) points/g,
      want: [totals.a.toFixed(2)],
    },
    {
      label: '**(B) total:** +P points',
      re: /\*\*\(B\) total:\*\* \+(\d+\.\d{2}) points/g,
      want: [totals.b.toFixed(2)],
    },
    {
      label: '**(C) remainder:** P points',
      re: /\*\*\(C\) remainder:\*\* (\d+\.\d{2}) points/g,
      want: [totals.c.toFixed(2)],
    },
    {
      label: '**Projected after (A):** E / T ≈ N%',
      re: /\*\*Projected after \(A\):\*\* (\d+\.\d{2}) \/ (\d+) ≈ (\d+)%/g,
      want: [totals.afterA.toFixed(2), String(totals.total), String(pct(totals.afterA))],
    },
    {
      label: '**Projected after (A) + (B):** E / T ≈ N%',
      re: /\*\*Projected after \(A\) \+ \(B\):\*\* (\d+\.\d{2}) \/ (\d+) ≈ (\d+)%/g,
      want: [totals.afterAB.toFixed(2), String(totals.total), String(pct(totals.afterAB))],
    },
  ]
  for (const { label, re, want } of checks) {
    const found = [...section.matchAll(re)]
    if (found.length !== 1) {
      issues.push(
        `scope: the statement \`${label}\` must appear exactly once, found ${found.length}`,
      )
      continue
    }
    const got = found[0]!.slice(1)
    if (got.join('|') !== want.join('|')) {
      issues.push(
        `scope: \`${label}\` says ${got.join(' / ')} but the tables imply ${want.join(' / ')}`,
      )
    }
  }
  return issues
}

function markdownFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...markdownFiles(p))
    else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) out.push(p)
  }
  return out
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

  const tierParse = parseTierTable(md)
  allIssues.push(...tierParse.issues)
  if (rows.length > 0 && tierParse.rows.length > 0) {
    allIssues.push(...verifyTiers(rows, tierParse.rows))
  }

  if (rows.length > 0) {
    let matrixPageSummaries = 0
    for (const file of markdownFiles(resolve(repoRoot, DOCS_DIR))) {
      const rel = relative(repoRoot, file)
      const { issues: summaryIssues, found } = verifyTierSummaries(
        readFileSync(file, 'utf8'),
        rows,
        rel,
      )
      allIssues.push(...summaryIssues)
      if (rel === MATRIX_DOC) matrixPageSummaries = found
    }
    if (matrixPageSummaries === 0) {
      allIssues.push(
        `${MATRIX_DOC} carries no "**Beta areas:** …" summary line — the status note must state it`,
      )
    }
  }

  const scope = parseScope(md)
  allIssues.push(...scope.issues)
  let scopeTotals: ScopeTotals | undefined
  if (rows.length > 0 && scope.items.length > 0) {
    allIssues.push(...verifyScopeItems(rows, scope.items))
    scopeTotals = computeScopeTotals(rows, scope.items)
    allIssues.push(...verifyScopeTotals(scope.section, scopeTotals))
  }

  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify(
        { rows: rows.length, ...totals, scope: scopeTotals, issues: allIssues },
        null,
        2,
      ),
    )
    process.exit(allIssues.length > 0 ? 1 : 0)
  }

  if (allIssues.length > 0) {
    console.error(
      `✗ Multiplatform matrix drift (${MATRIX_DOC} and the tier summaries that quote it):`,
    )
    for (const issue of allIssues) console.error(`  - ${issue}`)
    console.error(
      `\n  The table is the source of truth. Recompute: Σ(weight × fraction) = ${totals.earned.toFixed(1)} / ${totals.total} ≈ ${Math.round(totals.pct)}%` +
        `\n  and update the headline to exactly: **≈ ${Math.round(totals.pct)}%** (${totals.earned.toFixed(1)} / ${totals.total}` +
        `\n  Tiers are derived, not chosen: Beta ≥ 0.8, Experimental ≥ 0.4, otherwise Not ready — update the "## Maturity by area" row and every "**<Tier> areas:**" summary with it.`,
    )
    process.exit(1)
  }

  console.log(
    `✓ Multiplatform matrix — ${rows.length} rows, headline matches the table: ≈ ${Math.round(totals.pct)}% (${totals.earned.toFixed(1)} / ${totals.total}); maturity tiers match tierFor(fraction); Road to Stable closes every row (${scope.items.length} items, after (A) ${scopeTotals?.afterA.toFixed(2)}, after (A) + (B) ${scopeTotals?.afterAB.toFixed(2)}).`,
  )
}

if (import.meta.main) main()
