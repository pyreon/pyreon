/**
 * GitHub Actions annotation renderer.
 *
 * Emits per-finding `::error file=X,line=Y,col=Z::message` lines that
 * GitHub Actions parses into inline PR annotations (clickable in the
 * "Files changed" tab). One line per finding plus a summary header.
 *
 * Severity map: doctor `error` → GHA `error`, doctor `warning` →
 * GHA `warning`, doctor `info` → GHA `notice`.
 *
 * Reference: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
 */

import type { DoctorReport, Severity } from '../types'

const GHA_LEVEL: Record<Severity, string> = {
  error: 'error',
  warning: 'warning',
  info: 'notice',
}

// Message body: GHA requires these chars URL-encoded.
const escape = (s: string): string =>
  s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

// Property VALUES (`file=`, `title=`) additionally require `,` and `:`
// encoded — otherwise a `,` in the value ends the property early
// (`file=a,b.ts` → file=a + a bogus `b.ts` property). Per the
// workflow-command spec, only property values need this; the message
// after `::` uses the lighter `escape` above.
const escapeProperty = (s: string): string =>
  escape(s).replace(/,/g, '%2C').replace(/:/g, '%3A')

export const renderGha = (report: DoctorReport): string => {
  const lines: string[] = []

  // Summary header — visible at the top of the workflow log + on the
  // job summary if `$GITHUB_STEP_SUMMARY` is also written.
  lines.push(
    `::notice::pyreon doctor score: ${report.score}/100 (${report.grade}) — ${report.totals.errors} errors, ${report.totals.warnings} warnings, ${report.totals.infos} info`,
  )

  for (const f of report.findings) {
    const level = GHA_LEVEL[f.severity]
    const props: string[] = []
    props.push(`title=${escapeProperty(f.code)}`)
    if (f.location?.relPath) props.push(`file=${escapeProperty(f.location.relPath)}`)
    if (f.location?.line) props.push(`line=${f.location.line}`)
    if (f.location?.column) props.push(`col=${f.location.column}`)
    const msg = f.fix ? `${f.message} — ${f.fix}` : f.message
    lines.push(`::${level} ${props.join(',')}::${escape(msg)}`)
  }

  return lines.join('\n')
}
