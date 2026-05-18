import { bold, cyan, dim, emberCore, emberWarm } from './ansi'
import type { LintResult, Severity } from './types'

// Brand status glyphs (handoff \u00A76.5): `\u2717` ember-core (error),
// `!` ember-warm (warning), `\u2139` cyan (info). Helpers are color-gated
// (NO_COLOR / FORCE_COLOR / TTY) and 256-color \u2014 see `./ansi`.
const SEVERITY_SYMBOL: Record<Severity, string> = {
  error: emberCore('\u2717'),
  warn: emberWarm('!'),
  info: cyan('\u2139'),
  off: '',
}

const SEVERITY_LABEL: Record<Severity, string> = {
  error: emberCore('error'),
  warn: emberWarm('warning'),
  info: cyan('info'),
  off: '',
}

/**
 * Format results as human-readable colored text.
 */
export function formatText(result: LintResult): string {
  const lines: string[] = []

  for (const file of result.files) {
    if (file.diagnostics.length === 0) continue

    lines.push('')
    lines.push(bold(file.filePath))

    for (const d of file.diagnostics) {
      const loc = dim(`${d.loc.line}:${d.loc.column}`)
      const severity = SEVERITY_LABEL[d.severity]
      const ruleId = dim(d.ruleId)
      lines.push(`  ${loc}  ${severity}  ${d.message}  ${ruleId}`)
    }
  }

  const total = result.totalErrors + result.totalWarnings + result.totalInfos
  if (total > 0) {
    lines.push('')
    const parts: string[] = []
    if (result.totalErrors > 0)
      parts.push(
        emberCore(`${result.totalErrors} error${result.totalErrors === 1 ? '' : 's'}`),
      )
    if (result.totalWarnings > 0)
      parts.push(
        emberWarm(
          `${result.totalWarnings} warning${result.totalWarnings === 1 ? '' : 's'}`,
        ),
      )
    if (result.totalInfos > 0) parts.push(cyan(`${result.totalInfos} info`))
    lines.push(`${SEVERITY_SYMBOL.error} ${parts.join(', ')}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Format results as JSON.
 */
export function formatJSON(result: LintResult): string {
  return JSON.stringify(result, null, 2)
}

/**
 * Format results as compact single-line-per-diagnostic output.
 */
export function formatCompact(result: LintResult): string {
  const lines: string[] = []

  for (const file of result.files) {
    for (const d of file.diagnostics) {
      lines.push(
        `${file.filePath}:${d.loc.line}:${d.loc.column}: ${d.severity} [${d.ruleId}] ${d.message}`,
      )
    }
  }

  return lines.join('\n')
}
