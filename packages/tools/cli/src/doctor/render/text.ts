/**
 * Human-readable renderer for `DoctorReport`.
 *
 * Output shape (after react.doctor.com):
 *   1. Big score banner with letter grade + label
 *   2. Per-category bar chart (filled cells = score)
 *   3. Top-N findings with severity icon, code, location, message, fix
 *   4. Footer: skipped gates, totals, elapsed, run hints
 *
 * Colors degrade gracefully — see `ansi.ts:colorEnabled`.
 */

import type { CategoryScore, DoctorReport, Finding, Grade, Severity } from '../types'
import { bold, cyan, dim, fileUrl, gray, green, hyperlink, red, yellow } from './ansi'
import { isAdvisoryCategory } from '../score'

const BAR_WIDTH = 12
const FILLED = '█'
const EMPTY = '░'

// Brand status glyphs (handoff §6.5): `✗` ember-core (error),
// `!` ember-warm (warning). `ℹ` cyan kept for info — the brand's `✓`
// is for passing checks, which the findings list never renders (it
// only lists problems), so `✓` would be misleading here.
const SEV_ICON: Record<Severity, string> = {
  error: '✗',
  warning: '!',
  info: 'ℹ',
}

const colorForGrade = (g: Grade): ((s: string) => string) => {
  if (g === 'A') return green
  if (g === 'B' || g === 'C') return yellow
  return red
}

const colorForSeverity = (s: Severity): ((str: string) => string) => {
  if (s === 'error') return red
  if (s === 'warning') return yellow
  return cyan
}

const renderBar = (score: number, color: (s: string) => string): string => {
  const filled = Math.round((score / 100) * BAR_WIDTH)
  const empty = BAR_WIDTH - filled
  return color(FILLED.repeat(filled)) + gray(EMPTY.repeat(empty))
}

const padRight = (s: string, n: number): string =>
  s.length >= n ? s : s + ' '.repeat(n - s.length)

const renderCategory = (c: CategoryScore): string => {
  const advisory = isAdvisoryCategory(c.category)
  if (!c.included && !advisory) {
    return `  ${dim(padRight(c.category, 14))} ${gray('skipped')}`
  }
  if (advisory) {
    // Scored for visibility but NOT folded into the grade. Show the
    // breakdown so the user sees opt-in best-practice findings, clearly
    // labeled so they're never mistaken for a grade-affecting bug class.
    const total = c.errors + c.warnings + c.infos
    if (total === 0) {
      return `  ${padRight(c.category, 14)} ${gray('clean')} ${dim('(advisory — not graded)')}`
    }
    const b = [
      c.errors > 0 ? red(`${c.errors}E`) : '',
      c.warnings > 0 ? yellow(`${c.warnings}W`) : '',
      c.infos > 0 ? cyan(`${c.infos}i`) : '',
    ]
      .filter(Boolean)
      .join(' ')
    return `  ${padRight(c.category, 14)} ${b} ${dim('· advisory — opt-in best practices, excluded from grade & --ci')}`
  }
  const color = colorForGrade(c.grade)
  const bar = renderBar(c.score, color)
  const score = color(padRight(String(c.score), 3))
  const breakdown =
    c.errors + c.warnings + c.infos === 0
      ? gray('clean')
      : [
          c.errors > 0 ? red(`${c.errors}E`) : '',
          c.warnings > 0 ? yellow(`${c.warnings}W`) : '',
          c.infos > 0 ? cyan(`${c.infos}i`) : '',
        ]
          .filter(Boolean)
          .join(' ')
  return `  ${padRight(c.category, 14)} ${bar} ${score} ${dim('·')} ${breakdown}`
}

const renderBanner = (report: DoctorReport): string => {
  const gColor = colorForGrade(report.grade)
  const score = gColor(bold(String(report.score)))
  const grade = gColor(bold(report.grade))
  const lines = [
    '',
    `  ${bold('pyreon doctor')} ${dim('· project health audit')}`,
    '',
    `  Score:  ${score}/100   Grade: ${grade}`,
    '',
  ]
  return lines.join('\n')
}

const renderFinding = (f: Finding): string => {
  const icon = colorForSeverity(f.severity)(SEV_ICON[f.severity])
  const code = dim(f.code)
  const header = `  ${icon} ${bold(f.message)}  ${code}`

  const lines = [header]

  if (f.location) {
    const relPath = f.location.relPath || f.location.path
    const lineCol = f.location.line
      ? `:${f.location.line}${f.location.column !== undefined ? `:${f.location.column}` : ''}`
      : ''
    const visible = `${relPath}${lineCol}`
    const linked = hyperlink(
      cyan(visible),
      fileUrl(f.location.path, f.location.line, f.location.column),
    )
    lines.push(`     ${linked}`)
  }

  if (f.relatedLocations && f.relatedLocations.length > 0) {
    for (const rl of f.relatedLocations) {
      const relPath = rl.relPath || rl.path
      const lineCol = rl.line ? `:${rl.line}` : ''
      const label = rl.label ? ` ${dim(`(${rl.label})`)}` : ''
      lines.push(`     ${dim('↳')} ${cyan(relPath + lineCol)}${label}`)
    }
  }

  if (f.fix) {
    lines.push(`     ${dim('fix:')} ${f.fix}`)
  }

  return lines.join('\n')
}

const renderFindings = (report: DoctorReport, topN: number): string => {
  if (report.findings.length === 0) {
    return `  ${green('✓')} No findings. Your project is healthy.\n`
  }

  const shown = report.findings.slice(0, topN)
  const remaining = report.findings.length - shown.length

  const lines = [bold(`  Top findings (${shown.length} of ${report.findings.length}):`), '']
  for (const f of shown) {
    lines.push(renderFinding(f))
    lines.push('')
  }

  if (remaining > 0) {
    lines.push(dim(`  …and ${remaining} more. Run with ${bold('--json')} for the full list.`))
    lines.push('')
  }

  return lines.join('\n')
}

const renderSkipped = (report: DoctorReport): string => {
  const skipped = report.gates.filter((g) => g.meta.skipped)
  if (skipped.length === 0) return ''
  const names = skipped
    .map((g) => `${g.gate}${g.meta.skipReason ? ` (${g.meta.skipReason})` : ''}`)
    .join(', ')
  return `  ${dim('Skipped:')} ${names}\n`
}

const renderFooter = (report: DoctorReport): string => {
  const { errors, warnings, infos } = report.totals
  const counts = [
    errors > 0 ? red(`${errors} error${errors === 1 ? '' : 's'}`) : '',
    warnings > 0 ? yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`) : '',
    infos > 0 ? cyan(`${infos} info`) : '',
  ]
    .filter(Boolean)
    .join(`${dim(' · ')}`)

  const totalSummary = counts || green('no findings')
  const elapsed = `${(report.elapsedMs / 1000).toFixed(1)}s`
  return `  ${totalSummary} ${dim(`· ${report.gates.filter((g) => !g.meta.skipped).length} gates · ${elapsed}`)}\n`
}

export interface TextRenderOptions {
  /** cwd kept for future relative-path display in findings (unused today). */
  cwd?: string | undefined
  /** Max findings to show in human output. Default 10. */
  topN?: number | undefined
}

export const renderText = (report: DoctorReport, opts: TextRenderOptions = {}): string => {
  const topN = opts.topN ?? 10
  const sections = [
    renderBanner(report),
    bold('  Per category:'),
    '',
    ...report.categories.map(renderCategory),
    '',
    renderFindings(report, topN),
    renderSkipped(report),
    renderFooter(report),
  ]
  return sections.join('\n')
}
