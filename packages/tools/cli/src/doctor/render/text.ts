/**
 * Human-readable renderer for `DoctorReport`, in the shared Pyreon CLI
 * theme (`@pyreon/ansi`):
 *   1. Header (`pyreon doctor · project health audit`), score + grade,
 *      scan scope and per-gate scan counts
 *   2. Per-category score bars, label column padded, scores right-aligned
 *   3. Top-N findings: `✗ code · message`, `↳ path:line:col`, `fix:`
 *   4. Skipped gates, then the verdict: counts · gates · elapsed
 *
 * `--json` and `--gha` live in their own renderers and never go through
 * this file.
 */

import {
  bar,
  finding as findingLines,
  formatCounts,
  formatElapsed,
  header,
  meta,
  plural,
  type Role,
  type Term,
  term as defaultTerm,
  wrap,
} from '@pyreon/ansi'
import { isAdvisoryCategory } from '../score'
import type { CategoryScore, DoctorReport, Finding, Grade } from '../types'

const BAR_WIDTH = 12

const roleForGrade = (g: Grade): Role => {
  if (g === 'A') return 'ok'
  if (g === 'B' || g === 'C') return 'warn'
  return 'err'
}

/** `1E 2W 3i`, each in its severity colour; the letters carry the meaning without it. */
const breakdown = (t: Term, c: CategoryScore): string =>
  [
    c.errors > 0 ? t.err(`${c.errors}E`) : '',
    c.warnings > 0 ? t.warn(`${c.warnings}W`) : '',
    c.infos > 0 ? t.info(`${c.infos}i`) : '',
  ]
    .filter(Boolean)
    .join(' ')

const renderCategory = (t: Term, c: CategoryScore, labelWidth: number): string => {
  const label = c.category.padEnd(labelWidth)
  const advisory = isAdvisoryCategory(c.category)
  if (!c.included && !advisory) {
    return `  ${t.dim(label)} ${t.gray('skipped')}`
  }
  if (advisory) {
    // Scored for visibility but NOT folded into the grade, and labelled so
    // it is never mistaken for a grade-affecting bug class.
    const total = c.errors + c.warnings + c.infos
    if (total === 0) {
      return `  ${label} ${t.gray('clean')} ${t.dim('(advisory — not graded)')}`
    }
    return `  ${label} ${breakdown(t, c)} ${t.dim('(advisory — opt-in best practices, excluded from grade and --ci)')}`
  }
  const role = roleForGrade(c.grade)
  const score = t.paint(role, String(c.score).padStart(3))
  const counts = c.errors + c.warnings + c.infos === 0 ? t.gray('clean') : breakdown(t, c)
  return `  ${label} ${bar(t, c.score, 100, role, BAR_WIDTH)} ${score} ${t.dim(t.sym('bullet'))} ${counts}`
}

const scopeSource = (source: NonNullable<DoctorReport['workspace']>['source']): string => {
  if (source === 'flag') return '--roots'
  if (source === 'pnpm-workspace') return 'pnpm-workspace.yaml'
  if (source === 'workspaces') return 'workspaces'
  return 'single package'
}

const renderBanner = (t: Term, report: DoctorReport): string[] => {
  const role = roleForGrade(report.grade)
  const lines = [
    '',
    `  ${header(t, 'pyreon doctor', 'project health audit')}`,
    '',
    // A run in which NOTHING was measured must not show the degenerate
    // 100/A: that number is exactly the false green this guards against.
    report.measured
      ? `  Score:  ${t.paint(role, t.bold(String(report.score)))}/100   Grade: ${t.paint(role, t.bold(report.grade))}`
      : `  Score:  ${t.warn(t.bold('—'))}   ${t.warn(`${t.sym('warn')} nothing was measured (every gate skipped or matched no files)`)}`,
  ]
  // WHAT was scanned, not just the verdict: a wrong scan scope must be
  // visible at a glance.
  if (report.workspace) {
    const ws = report.workspace
    const excluded = ws.excluded.length > 0 ? ` · excluded: ${ws.excluded.join(', ')}` : ''
    const count = `${ws.packageCount} package root(s)`
    const from = `from ${scopeSource(ws.source)} (${ws.globs.join(', ')})${excluded}`
    // Wrap the plain text, then style per line so no escape pair spans a break.
    const [first = '', ...rest] = wrap(`${count} ${from}`, 100, 100 - 10, '          ')
    lines.push(
      `  ${t.dim('Scope:')}  ${count}${first.length > count.length ? ` ${t.dim(first.slice(count.length + 1))}` : ''}`,
      ...rest.map((l) => t.dim(l)),
    )
  }
  const scanned = report.gates
    .filter((g) => !g.meta.skipped && g.meta.scanned !== undefined)
    .map((g) => `${g.gate} ${g.meta.scanned}`)
  if (scanned.length > 0) {
    // Non-breaking space inside each item so a line breaks only after a `·`.
    const NBSP = ' '
    const items = scanned.map(
      (s, i) => `${s.replace(/ /g, NBSP)}${i < scanned.length - 1 ? `${NBSP}${t.sym('bullet')}` : ''}`,
    )
    const [first = '', ...rest] = wrap(items.join(' '), 100, 100 - 11, ' '.repeat(9)).map((l) =>
      l.replaceAll(NBSP, ' '),
    )
    lines.push(`  ${t.dim(`Scanned: ${first}`)}`, ...rest.map((l) => `  ${t.dim(l)}`))
  }
  lines.push('')
  return lines
}

/**
 * Empty-scan skips get their OWN prominent block (not just the dim footer):
 * a gate that matched no files measured nothing, and hiding that is exactly
 * the false-green failure mode this guards against.
 */
const renderEmptyScans = (t: Term, report: DoctorReport): string[] => {
  const empty = report.gates.filter((g) => g.meta.emptyScan)
  if (empty.length === 0) return []
  const lines = [
    `  ${t.warn(t.sym('warn'))} ${t.bold(`${empty.length} gate(s) matched no files — their categories were NOT measured:`)}`,
  ]
  for (const g of empty) {
    const reason = `— ${g.meta.skipReason ?? 'matched no files'}`
    const [first = '', ...rest] = wrap(reason, 100, 100 - 6 - g.gate.length, '       ')
    lines.push(`     ${t.warn(g.gate)} ${t.dim(first)}`, ...rest.map((l) => t.dim(l)))
  }
  lines.push('')
  return lines
}

const renderFinding = (t: Term, f: Finding): string[] =>
  findingLines(t, {
    severity: f.severity,
    source: f.code,
    message: f.message,
    location: f.location
      ? {
          path: f.location.relPath || f.location.path,
          abs: f.location.path,
          line: f.location.line,
          column: f.location.column,
        }
      : undefined,
    related: f.relatedLocations?.map((rl) => ({
      path: rl.relPath || rl.path,
      abs: rl.path,
      line: rl.line,
      label: rl.label,
    })),
    fix: f.fix,
  })

const renderFindings = (t: Term, report: DoctorReport, topN: number): string[] => {
  if (report.findings.length === 0) {
    // Zero findings only means "healthy" when something was scanned.
    if (!report.measured) {
      return [`  ${t.warn(t.sym('warn'))} No gate measured anything — zero findings is NOT evidence of health.`, '']
    }
    return [`  ${t.ok(t.sym('ok'))} No findings. Your project is healthy.`, '']
  }

  const shown = report.findings.slice(0, topN)
  const remaining = report.findings.length - shown.length

  const lines = [t.bold(`  Top findings (${shown.length} of ${report.findings.length}):`), '']
  for (const f of shown) {
    lines.push(...renderFinding(t, f), '')
  }
  if (remaining > 0) {
    lines.push(`  ${t.dim(`…and ${remaining} more. Run with`)} --json ${t.dim('for the full list.')}`, '')
  }
  return lines
}

const renderSkipped = (t: Term, report: DoctorReport): string[] => {
  // Empty-scan skips already rendered in their own prominent block.
  const skipped = report.gates.filter((g) => g.meta.skipped && !g.meta.emptyScan)
  if (skipped.length === 0) return []
  const lines = [`  ${t.dim('Skipped:')}`]
  const width = Math.max(...skipped.map((g) => g.gate.length))
  for (const g of skipped) {
    const reason = g.meta.skipReason ?? ''
    const indent = ' '.repeat(4 + width + 2)
    const [first = '', ...rest] = wrap(reason, 100, 100 - indent.length, indent)
    lines.push(`    ${g.gate.padEnd(width)}  ${t.dim(first)}`.trimEnd(), ...rest.map((l) => t.dim(l)))
  }
  lines.push('')
  return lines
}

const renderVerdict = (t: Term, report: DoctorReport): string => {
  const counts = formatCounts(t, report.totals) || t.ok('no findings')
  const ran = report.gates.filter((g) => !g.meta.skipped).length
  return `  ${counts}${meta(t, [plural(ran, 'gate'), formatElapsed(report.elapsedMs)])}`
}

export interface TextRenderOptions {
  /** cwd kept for future relative-path display in findings (unused today). */
  cwd?: string | undefined
  /** Max findings to show in human output. Default 10. */
  topN?: number | undefined
  /** The terminal to render for. Default: the process's stdout. */
  term?: Term | undefined
}

export const renderText = (report: DoctorReport, opts: TextRenderOptions = {}): string => {
  const t = opts.term ?? defaultTerm
  const topN = opts.topN ?? 10
  const labelWidth = Math.max(...report.categories.map((c) => c.category.length))
  return [
    ...renderBanner(t, report),
    ...report.categories.map((c) => renderCategory(t, c, labelWidth)),
    '',
    ...renderEmptyScans(t, report),
    ...renderFindings(t, report, topN),
    ...renderSkipped(t, report),
    renderVerdict(t, report),
    '',
  ].join('\n')
}
