/**
 * GitHub Actions annotation renderer.
 *
 * Emits per-finding `::error file=X,line=Y,col=Z::message` lines that
 * GitHub Actions parses into inline PR annotations (clickable in the
 * "Files changed" tab). One line per finding plus a summary header.
 *
 * Severity map: doctor `error` → GHA `error`, doctor `warning` →
 * GHA `warning`, doctor `info` → GHA `notice`. Escaping and property
 * order come from `@pyreon/ansi`'s `ghaAnnotation`, shared with
 * `pyreon check --gha` and `pyreon-lint --format gha`.
 *
 * Reference: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
 */

import { ghaAnnotation, ghaLevel } from '@pyreon/ansi'
import type { DoctorReport } from '../types'

export const renderGha = (report: DoctorReport): string => {
  const lines: string[] = []

  // Summary header — visible at the top of the workflow log + on the
  // job summary if `$GITHUB_STEP_SUMMARY` is also written. A run that
  // measured nothing must not announce its degenerate 100/A score.
  if (report.measured) {
    lines.push(
      `::notice::pyreon doctor score: ${report.score}/100 (${report.grade}) — ${report.totals.errors} errors, ${report.totals.warnings} warnings, ${report.totals.infos} info`,
    )
  } else {
    lines.push(
      '::warning::pyreon doctor measured nothing — every gate was skipped or matched no files. Check the workspace layout or pass --roots.',
    )
  }
  for (const g of report.gates) {
    if (!g.meta.emptyScan) continue
    lines.push(
      ghaAnnotation({
        level: 'warning',
        title: `${g.gate}/empty-scan`,
        message: g.meta.skipReason ?? `${g.gate} matched no files`,
      }),
    )
  }

  for (const f of report.findings) {
    lines.push(
      ghaAnnotation({
        level: ghaLevel(f.severity),
        title: f.code,
        file: f.location?.relPath,
        line: f.location?.line,
        column: f.location?.column,
        message: f.fix ? `${f.message} — ${f.fix}` : f.message,
      }),
    )
  }

  return lines.join('\n')
}
