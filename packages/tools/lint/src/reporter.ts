import { isAbsolute, relative } from 'node:path'
import {
  fileUrl,
  formatCounts,
  formatElapsed,
  ghaAnnotation,
  ghaLevel,
  padEndVisible,
  plural,
  severityStyle,
  type Term,
  verdict,
  visibleWidth,
  wrap,
  WRAP_WIDTH,
} from '@pyreon/ansi'
import { termFor } from './term-for'
import type { Diagnostic, LintResult } from './types'

export interface TextFormatOptions {
  /** Paths are shown relative to this directory. Default `process.cwd()`. */
  cwd?: string | undefined
  /**
   * Wall-clock time of the run. When given, the run is a CLI run: a clean
   * result prints a verdict line instead of nothing, and the summary line
   * carries the file count and elapsed time.
   */
  elapsedMs?: number | undefined
  /** `--fix` already ran: do not advertise fixable diagnostics. */
  fixApplied?: boolean | undefined
  /**
   * Render for a specific terminal instead of the process's stdout:
   * colour level (0 plain, 1 sixteen colours, 2 256 colours, 3 truecolor),
   * background and
   * symbol set. Anything left out is detected.
   */
  color?: 0 | 1 | 2 | 3 | undefined
  theme?: 'dark' | 'light' | undefined
  unicode?: boolean | undefined
  width?: number | undefined
}

/** The terminal options every text formatter takes. Primitives only: no `@pyreon/ansi` type is public. */
export type TermChoice = Pick<TextFormatOptions, 'color' | 'theme' | 'unicode' | 'width'>

const displayPath = (filePath: string, cwd: string): string => {
  if (!isAbsolute(filePath)) return filePath
  const rel = relative(cwd, filePath)
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? filePath : rel
}

/**
 * One diagnostic row: `line:col  severity  message  rule`. The message wraps
 * at `width` under its own column; the rule id follows the last line, or
 * takes its own line when it does not fit.
 */
const diagnosticLines = (
  t: Term,
  d: Pick<Diagnostic, 'ruleId' | 'severity' | 'message'> & { loc?: Diagnostic['loc'] },
  locWidth: number,
  msgWidth: number,
  width: number,
): string[] => {
  const style = severityStyle(d.severity === 'off' ? 'info' : d.severity)
  const loc = d.loc ? `${d.loc.line}:${d.loc.column}` : ''
  const prefix = `  ${t.dim(loc.padEnd(locWidth))}  ${t.paint(style.role, style.word.padEnd(7))}  `
  const prefixW = visibleWidth(prefix)
  const rule = t.dim(d.ruleId)
  const ruleW = visibleWidth(d.ruleId)
  const indent = ' '.repeat(prefixW)
  // Fits on one line, padded to its neighbours so the rule ids align.
  const ownW = visibleWidth(d.message)
  if (prefixW + Math.max(msgWidth, ownW) + 2 + ruleW <= width) {
    return [`${prefix}${padEndVisible(d.message, msgWidth)}  ${rule}`]
  }
  const msg = wrap(d.message, width, width - prefixW, indent)
  const last = msg[msg.length - 1] ?? ''
  if (visibleWidth(last) + 2 + ruleW <= width && msg.length > 1) {
    msg[msg.length - 1] = `${last}  ${rule}`
    return [`${prefix}${msg[0]}`, ...msg.slice(1)]
  }
  if (msg.length === 1 && prefixW + visibleWidth(last) + 2 + ruleW <= width) {
    return [`${prefix}${last}  ${rule}`]
  }
  return [`${prefix}${msg[0]}`, ...msg.slice(1), `${indent}${rule}`]
}

/**
 * Format results as human-readable text: one block per file (path, then a
 * row per diagnostic), then the verdict. A clean result prints nothing
 * unless `elapsedMs` marks it as a CLI run.
 */
export function formatText(result: LintResult, opts: TextFormatOptions = {}): string {
  const t = termFor(opts)
  const cwd = opts.cwd ?? process.cwd()
  const width = opts.width ?? t.width ?? WRAP_WIDTH
  const lines: string[] = []

  const block = (title: string, rows: ReadonlyArray<Parameters<typeof diagnosticLines>[1]>) => {
    const locWidth = Math.max(0, ...rows.map((d) => (d.loc ? `${d.loc.line}:${d.loc.column}`.length : 0)))
    const prefixW = 2 + locWidth + 2 + 7 + 2
    // Align rule ids across the rows that fit on one line.
    const msgWidth = Math.max(
      0,
      ...rows
        .filter((d) => prefixW + visibleWidth(d.message) + 2 + d.ruleId.length <= width)
        .map((d) => visibleWidth(d.message)),
    )
    lines.push('')
    lines.push(title)
    for (const d of rows) {
      const aligned = prefixW + msgWidth + 2 + d.ruleId.length <= width
      lines.push(...diagnosticLines(t, d, locWidth, aligned ? msgWidth : 0, width))
    }
  }

  if (result.configDiagnostics.length > 0) {
    block(t.bold('lint config'), result.configDiagnostics)
  }

  for (const file of result.files) {
    if (file.diagnostics.length === 0) continue
    const shown = displayPath(file.filePath, cwd)
    const title = t.underline(shown)
    block(isAbsolute(file.filePath) ? t.link(title, fileUrl(file.filePath)) : title, file.diagnostics)
  }

  const cliRun = opts.elapsedMs !== undefined
  const runMeta = cliRun
    ? [plural(result.files.length, 'file'), formatElapsed(opts.elapsedMs as number)]
    : []
  const total = result.totalErrors + result.totalWarnings + result.totalInfos
  if (total === 0) {
    if (!cliRun) return lines.join('\n')
    lines.push(verdict(t, 'ok', 'no problems', runMeta))
    return lines.join('\n')
  }

  const status = result.totalErrors > 0 ? 'err' : result.totalWarnings > 0 ? 'warn' : 'info'
  lines.push('')
  lines.push(
    verdict(t, status, formatCounts(t, { errors: result.totalErrors, warnings: result.totalWarnings, infos: result.totalInfos })),
  )
  const fixable = opts.fixApplied
    ? 0
    : result.files.reduce((n, f) => n + f.diagnostics.filter((d) => d.fix !== undefined).length, 0)
  const fixHint = fixable > 0 ? `${t.dim(`${fixable} fixable with`)} --fix` : ''
  if (fixHint || runMeta.length > 0) {
    const b = t.sym('bullet')
    const rest = runMeta.length > 0 ? t.dim(`${fixHint ? ` ${b} ` : ''}${runMeta.join(` ${b} `)}`) : ''
    lines.push(`  ${fixHint}${rest}`)
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * Format results as GitHub Actions annotations (`--format gha`): one
 * `::error` / `::warning` / `::notice` line per diagnostic, titled with the
 * rule id, paths relative to `cwd` (default `process.cwd()`), so GitHub
 * annotates the pull request's diff.
 */
export function formatGha(result: LintResult, opts: { cwd?: string | undefined } = {}): string {
  const cwd = opts.cwd ?? process.cwd()
  const lines: string[] = []
  for (const d of result.configDiagnostics) {
    lines.push(ghaAnnotation({ level: ghaLevel(d.severity), title: d.ruleId, message: d.message }))
  }
  for (const file of result.files) {
    for (const d of file.diagnostics) {
      lines.push(
        ghaAnnotation({
          level: ghaLevel(d.severity === 'off' ? 'info' : d.severity),
          title: d.ruleId,
          file: displayPath(file.filePath, cwd),
          line: d.loc?.line,
          column: d.loc?.column,
          message: d.message,
        }),
      )
    }
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
