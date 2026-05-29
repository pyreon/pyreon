/**
 * `pyreon doctor` — project-wide health audit.
 *
 * PR 2 rewrites this entrypoint around the unified gate API
 * (`packages/tools/cli/src/doctor/`). The orchestrator runs every
 * gate in parallel, the aggregator builds a `DoctorReport` with a
 * 0-100 score, the renderer formats it for text / JSON / GHA.
 *
 * The legacy single-purpose flags (`--audit-tests`, `--check-islands`,
 * `--check-ssg`) are interpreted as `--only <gate>` shortcuts so any
 * existing CI script that relied on the old shape keeps working.
 * Without those flags, doctor runs the full fast-gate set + computes
 * a score — the new default behaviour.
 *
 * Output modes:
 *   - text (default): big-score banner + per-category bars + top-N findings
 *   - --json: full `DoctorReport` as JSON
 *   - --gha:  GitHub Actions annotation lines (one per finding)
 *
 * Modes:
 *   - --full: enable slow gates (audit-types, bundle-budgets)
 *   - --only <gates>: run ONLY the listed comma-separated gates
 *   - --skip <gates>: exclude these gates
 *   - --fix: auto-fix where possible (lint + react-patterns)
 *   - --ci: exit non-zero on any error finding
 */

import { runDoctor, type GateName, type OrchestratorOptions } from './doctor/orchestrator'
import { renderGha, renderJson, renderText } from './doctor/render'
import { isAdvisoryCategory } from './doctor/score'
import type { DoctorReport } from './doctor/types'

export type DoctorFormat = 'text' | 'json' | 'gha'

export interface DoctorOptions {
  fix: boolean
  /** Legacy boolean — interpreted as `format = 'json'` if true. */
  json: boolean
  ci: boolean
  cwd: string
  /** Explicit format override (wins over `json` boolean). */
  format?: DoctorFormat | undefined
  /** Enable slow gates (audit-types, bundle-budgets). */
  full?: boolean | undefined
  /** Run ONLY these gates. */
  only?: GateName[] | undefined
  /** Skip these gates. */
  skip?: GateName[] | undefined

  // ── Legacy flags (mapped to --only shortcuts for back-compat) ────
  /**
   * @deprecated Prefer `--only audit-tests`. Both forms behave
   * identically: include the test-environment audit gate in the
   * report. Kept so existing CI scripts continue to work.
   */
  auditTests?: boolean | undefined
  /** Minimum risk for the test-environment audit. Default 'medium'. */
  auditMinRisk?: 'high' | 'medium' | 'low' | undefined
  /** @deprecated Prefer `--only islands-audit`. */
  checkIslands?: boolean | undefined
  /** @deprecated Prefer `--only ssg-audit`. */
  checkSsg?: boolean | undefined
}

const resolveFormat = (options: DoctorOptions): DoctorFormat => {
  if (options.format) return options.format
  if (options.json) return 'json'
  return 'text'
}

const resolveOnly = (options: DoctorOptions): GateName[] | undefined => {
  if (options.only && options.only.length > 0) return options.only
  // Legacy single-purpose flags → `--only` shortcuts.
  const legacyOnly: GateName[] = []
  if (options.auditTests) legacyOnly.push('audit-tests')
  if (options.checkIslands) legacyOnly.push('islands-audit')
  if (options.checkSsg) legacyOnly.push('ssg-audit')
  return legacyOnly.length > 0 ? legacyOnly : undefined
}

export const doctor = async (options: DoctorOptions): Promise<number> => {
  const orchestratorOpts: OrchestratorOptions = {
    cwd: options.cwd,
    full: options.full,
    only: resolveOnly(options),
    skip: options.skip,
    fix: options.fix,
    auditMinRisk: options.auditMinRisk,
  }

  const report = await runDoctor(orchestratorOpts)
  const format = resolveFormat(options)

  if (format === 'json') {
    console.log(renderJson(report))
  } else if (format === 'gha') {
    console.log(renderGha(report))
  } else {
    console.log(renderText(report, { cwd: options.cwd }))
  }

  // Exit code: in --ci mode, any NON-ADVISORY error finding fails.
  // Advisory (`best-practices`) errors are opt-in/opinionated and must
  // never break CI — they're surfaced for visibility, not enforcement.
  // Otherwise, only a non-zero is returned when there are findings AT
  // ALL — so `pyreon doctor && echo green` works as a quick gate.
  if (options.ci) {
    return report.findings.filter((f) => f.severity === 'error' && !isAdvisoryCategory(f.category))
      .length
  }
  return report.totals.errors + report.totals.warnings + report.totals.infos
}

// Re-export the report types for external consumers (CI integrations,
// AI agents, dashboards).
export type { DoctorReport, GateName }
