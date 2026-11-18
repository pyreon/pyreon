/**
 * `pyreon doctor` — project-wide health audit.
 *
 * PR 2 rewrites this entrypoint around the unified gate API
 * (`packages/tools/cli/src/doctor/`). The orchestrator runs every
 * gate in parallel, the aggregator builds a `DoctorReport` with a
 * 0-100 score, the renderer formats it for text / JSON / GHA.
 *
 * `--only <gates>` narrows the run (e.g. `--only islands-audit`).
 * Without it, doctor runs the full fast-gate set + computes a score.
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

import { createTerm, finding } from '@pyreon/ansi'
import {
  runDoctor,
  type GateName,
  type OrchestratorOptions,
} from './doctor/orchestrator'
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
  /**
   * Explicit scan-root globs for the file-scanning gates (the
   * `--roots` flag), resolved relative to `cwd`. Overrides workspace
   * discovery — the escape hatch for non-standard layouts.
   */
  roots?: string[] | undefined
  /** Minimum risk for the test-environment audit. Default 'medium'. */
  auditMinRisk?: 'high' | 'medium' | 'low' | undefined
}

const resolveFormat = (options: DoctorOptions): DoctorFormat => {
  if (options.format) return options.format
  if (options.json) return 'json'
  return 'text'
}

const resolveOnly = (options: DoctorOptions): GateName[] | undefined =>
  options.only && options.only.length > 0 ? options.only : undefined

export const doctor = async (options: DoctorOptions): Promise<number> => {
  const orchestratorOpts: OrchestratorOptions = {
    cwd: options.cwd,
    full: options.full,
    only: resolveOnly(options),
    skip: options.skip,
    fix: options.fix,
    auditMinRisk: options.auditMinRisk,
    roots: options.roots,
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

  // Exit code: in --ci mode, the count of NON-ADVISORY error findings is
  // returned (the CLI exits 1 when it's > 0). Advisory (`best-practices`)
  // errors are opt-in/opinionated and must never break CI — surfaced for
  // visibility, not enforcement. WITHOUT --ci, doctor is INFORMATIONAL:
  // the returned total-findings count is for programmatic consumers, but
  // the CLI does NOT exit non-zero on it (only `--ci` gates — matching the
  // documented contract). So plain `pyreon doctor` always exits 0; use
  // `pyreon doctor --ci` as the gate.
  if (options.ci) {
    // An enforcement run that measured NOTHING is a misconfiguration,
    // not a pass — every gate skipped or matched zero files, so a green
    // exit would be the exact false-green the workspace-roots fix
    // closes. Fail with guidance instead of silently passing.
    if (!report.measured) {
      const t = createTerm({ isTTY: Boolean(process.stderr.isTTY) })
      console.error(
        finding(
          t,
          {
            severity: 'error',
            source: 'pyreon doctor --ci',
            message: 'measured nothing: every gate was skipped or matched no files.',
            fix: 'check the workspace layout (package.json `workspaces` / pnpm-workspace.yaml) or pass --roots <glob,...>',
          },
          { indent: 0, width: t.width },
        ).join('\n'),
      )
      return 1
    }
    return report.findings.filter(
      (f) => f.severity === 'error' && !isAdvisoryCategory(f.category),
    ).length
  }
  return report.totals.errors + report.totals.warnings + report.totals.infos
}

// Re-export the report types for external consumers (CI integrations,
// AI agents, dashboards).
export type { DoctorReport, GateName }
