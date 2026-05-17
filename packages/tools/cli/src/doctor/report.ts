/**
 * `DoctorReport` aggregator — collects gate results, builds findings
 * list, computes the 0-100 score, returns the report the renderers
 * consume. Pure-function: takes gate results in, returns report out.
 *
 * The orchestration layer (which gates to run, in what order, with
 * what timeout) lives in the doctor command itself; this module is
 * just the "merge + score" step. Splitting them keeps the score
 * formula testable in isolation and makes it trivial to add a new
 * gate (drop into the orchestrator's list, no aggregator changes).
 */

import { computeScore } from './score'
import type { DoctorReport, Finding, GateResult, Severity } from './types'

const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
}

/**
 * Sort findings: errors first, then warnings, then info. Within
 * each severity, group by category for predictable output.
 */
const sortFindings = (findings: Finding[]): Finding[] =>
  [...findings].sort((a, b) => {
    const sevDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (sevDelta !== 0) return sevDelta
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.code.localeCompare(b.code)
  })

export const buildReport = (gates: GateResult[]): DoctorReport => {
  const findings = sortFindings(gates.flatMap((g) => g.findings))

  const totals = {
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    infos: findings.filter((f) => f.severity === 'info').length,
  }

  const { score, grade, categories } = computeScore(findings, gates)

  // Sum of per-gate elapsedMs — note this is NOT wall-clock if gates
  // run in parallel. The orchestrator can override with a measured
  // wall-clock when it has one; otherwise the sum is a useful proxy
  // for "total work done".
  const elapsedMs = gates.reduce((s, g) => s + g.meta.elapsedMs, 0)

  return {
    score,
    grade,
    categories,
    gates,
    findings,
    totals,
    elapsedMs,
    timestamp: new Date().toISOString(),
  }
}
