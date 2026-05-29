/**
 * 0-100 health-score formula for `pyreon doctor`.
 *
 * Per-finding penalty by severity:
 *   error   = 10 points
 *   warning = 3 points
 *   info    = 1 point
 *
 * Per-category subscore: `100 - clamp(sum(penalties), 0, 100)` — so
 * 10 errors saturate to 0 in one category, 33 warnings = 1 point, etc.
 * Linear-without-multiplier was chosen over multiplicative weighting
 * because it gives the user predictable mental math: "fix one error,
 * gain 10 points (capped at 100)".
 *
 * Overall score: simple mean of `included` category scores. Categories
 * with no contributing gates are NOT included (a category that wasn't
 * measured shouldn't pull the average up to 100). Five categories
 * with equal weight gives any one bug class proportional impact —
 * we don't try to weight "correctness > documentation" in code; the
 * user reads the per-category bar chart and knows which to focus on.
 *
 * Letter grades:
 *   A: 90+
 *   B: 80-89
 *   C: 70-79
 *   D: 60-69
 *   F: <60
 *
 * Reference: react.doctor uses a similar shape — score, letter, per-
 * category bars. The constants are tuned for Pyreon's larger gate set
 * (10+ vs react.doctor's 4).
 */

import type { CategoryScore, Finding, FindingCategory, GateResult, Grade, Severity } from './types'

const CATEGORIES: FindingCategory[] = [
  'correctness',
  'performance',
  'architecture',
  'testing',
  'documentation',
  'best-practices',
]

// Advisory categories are scored + displayed but NEVER folded into the
// overall mean / grade (opt-in best-practice findings must not tank the
// objective health score — opinionated ≠ broken). Kept as a set so a
// future advisory bucket just adds here.
const ADVISORY_CATEGORIES = new Set<FindingCategory>(['best-practices'])

/** True when `category` is advisory (excluded from the overall mean + `--ci`). */
export const isAdvisoryCategory = (c: FindingCategory): boolean => ADVISORY_CATEGORIES.has(c)

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  error: 10,
  warning: 3,
  info: 1,
}

/** Pure scorer — no I/O, deterministic given findings. */
export const scoreCategory = (
  category: FindingCategory,
  findings: Finding[],
  included: boolean,
): CategoryScore => {
  const inCat = findings.filter((f) => f.category === category)
  const errors = inCat.filter((f) => f.severity === 'error').length
  const warnings = inCat.filter((f) => f.severity === 'warning').length
  const infos = inCat.filter((f) => f.severity === 'info').length

  const penalty =
    errors * SEVERITY_WEIGHTS.error +
    warnings * SEVERITY_WEIGHTS.warning +
    infos * SEVERITY_WEIGHTS.info

  const score = Math.max(0, Math.min(100, 100 - penalty))

  return {
    category,
    score,
    errors,
    warnings,
    infos,
    grade: gradeFor(score),
    included,
  }
}

export const gradeFor = (score: number): Grade => {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

/**
 * Compute per-category subscores + overall score.
 *
 * `gates` is used to decide which categories are `included` — a
 * category is included if at least one non-skipped gate emits in it.
 * If no gate ran for `documentation`, the category is excluded from
 * the overall mean rather than counted as 100/100.
 */
export const computeScore = (
  findings: Finding[],
  gates: GateResult[],
): { score: number; grade: Grade; categories: CategoryScore[] } => {
  // A category is included if any non-skipped gate's default category
  // matches OR any finding lands in that category. The findings check
  // covers the "lint emits a perf-flavored finding" cross-cutting case
  // (lint's default category may be 'correctness' but its findings can
  // still register a perf hit).
  const includedCats = new Set<FindingCategory>()
  for (const g of gates) {
    if (!g.meta.skipped) includedCats.add(g.category)
  }
  for (const f of findings) {
    includedCats.add(f.category)
  }

  const categories = CATEGORIES.map((c) =>
    // Advisory categories are scored for visibility but forced
    // `included: false` so they never enter the overall mean/grade.
    scoreCategory(c, findings, isAdvisoryCategory(c) ? false : includedCats.has(c)),
  )

  const included = categories.filter((c) => c.included)
  // No gates ran at all — degenerate case. Surface a perfect score
  // with an A so the human path doesn't crash on division-by-zero,
  // but the renderer should detect this and show "no gates ran".
  if (included.length === 0) {
    return { score: 100, grade: 'A', categories }
  }

  const sum = included.reduce((s, c) => s + c.score, 0)
  const score = Math.round(sum / included.length)
  return { score, grade: gradeFor(score), categories }
}
