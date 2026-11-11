/**
 * Layout helpers for the six CLI rules (`RULES` in `palette.ts`). Each one
 * returns strings and never prints, so a command composes them and owns
 * its own IO.
 */

import type { Role, SymbolName } from './palette'
import {
  fileUrl,
  padEndVisible,
  padStartVisible,
  type Term,
  visibleWidth,
} from './term'

/** Default wrap width (rule 6). */
export const WRAP_WIDTH = 100

export type Severity = 'error' | 'warning' | 'warn' | 'info'

export interface SeverityStyle {
  readonly role: Role
  readonly symbol: SymbolName
  /** The word that says the state without colour (rule 3). */
  readonly word: string
}

export const severityStyle = (sev: Severity): SeverityStyle => {
  if (sev === 'error') return { role: 'err', symbol: 'err', word: 'error' }
  if (sev === 'info') return { role: 'info', symbol: 'info', word: 'info' }
  return { role: 'warn', symbol: 'warn', word: 'warning' }
}

/** The coloured severity symbol: `✗` / `!` / `ℹ`. */
export const severityMark = (t: Term, sev: Severity): string => {
  const s = severityStyle(sev)
  return t.paint(s.role, t.sym(s.symbol))
}

/** `1 error` / `2 errors`. `many` defaults to `one + 's'`. */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`

/** `380 ms` under a second, `1.4 s` from there. */
export const formatElapsed = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`

/** Rule 1, first line: `bold name · dim context`. */
export const header = (t: Term, name: string, context?: string): string =>
  context ? `${t.bold(name)} ${t.dim(`${t.sym('bullet')} ${context}`)}` : t.bold(name)

export interface Counts {
  errors?: number | undefined
  warnings?: number | undefined
  infos?: number | undefined
}

/**
 * `1 error, 5 warnings, 2 info`, each part in its severity colour; zero
 * counts are left out. Empty when every count is zero.
 */
export const formatCounts = (t: Term, c: Counts, sep = ', '): string => {
  const parts: string[] = []
  if (c.errors) parts.push(t.err(plural(c.errors, 'error')))
  if (c.warnings) parts.push(t.warn(plural(c.warnings, 'warning')))
  if (c.infos) parts.push(t.info(`${c.infos} info`))
  return parts.join(sep)
}

/** ` · a · b` in the dim role; empty when there is no meta. */
export const meta = (t: Term, parts: ReadonlyArray<string | false | undefined | null>): string => {
  const kept = parts.filter((p): p is string => typeof p === 'string' && p !== '')
  if (kept.length === 0) return ''
  const b = t.sym('bullet')
  return ` ${t.dim(`${b} ${kept.join(` ${b} `)}`)}`
}

export type VerdictStatus = 'ok' | 'err' | 'warn' | 'info'

/**
 * Rule 1, last line: `✓ text · meta · meta`. The symbol and the text carry
 * the state; `meta` (counts, totals, elapsed) is dim.
 */
export const verdict = (
  t: Term,
  status: VerdictStatus | null,
  text: string,
  metaParts: ReadonlyArray<string | false | undefined | null> = [],
): string => {
  const mark = status === null ? '' : `${t.paint(status, t.sym(status))} `
  return `${mark}${text}${meta(t, metaParts)}`
}

export type Align = 'left' | 'right'

export interface ColumnsOptions {
  /** Per-column alignment; missing entries are left-aligned. */
  align?: ReadonlyArray<Align> | undefined
  /** Spaces between columns. Default 2. */
  gap?: number | undefined
  /** Leading spaces. Default 2. */
  indent?: number | undefined
}

/**
 * Rule 2: align rows into columns, padding each column to its widest cell
 * (escape codes ignored) and right-aligning the columns marked `right`.
 * Trailing whitespace is trimmed, so a short last cell never pads.
 */
export const columns = (rows: ReadonlyArray<ReadonlyArray<string>>, opts: ColumnsOptions = {}): string[] => {
  const gap = ' '.repeat(opts.gap ?? 2)
  const indent = ' '.repeat(opts.indent ?? 2)
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, visibleWidth(cell))
    })
  }
  return rows.map((row) => {
    const cells = row.map((cell, i) => {
      const w = widths[i] ?? 0
      return opts.align?.[i] === 'right' ? padStartVisible(cell, w) : padEndVisible(cell, w)
    })
    return `${indent}${cells.join(gap)}`.replace(/\s+$/, '')
  })
}

/**
 * A score bar: `value / max` of `width` cells filled in `role`, the rest
 * in the gray track.
 */
export const bar = (t: Term, value: number, max: number, role: Role, width = 12): string => {
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
  const filled = Math.round(ratio * width)
  return (
    t.paint(role, t.sym('barFull').repeat(filled)) + t.gray(t.sym('barEmpty').repeat(width - filled))
  )
}

/**
 * Word-wrap `text` to `width` columns. Breaks only at spaces, so a path or
 * any other unbroken token longer than the line stays whole (rule 6).
 * Existing newlines are kept. `indent` prefixes continuation lines.
 */
export const wrap = (text: string, width = WRAP_WIDTH, firstWidth = width, indent = ''): string[] => {
  const raw: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    let lineWidth = 0
    for (const word of para.split(' ')) {
      const w = visibleWidth(word)
      const limit = raw.length === 0 ? firstWidth : width - indent.length
      if (line !== '' && lineWidth + 1 + w > limit) {
        raw.push(line)
        line = word
        lineWidth = w
      } else {
        lineWidth += (line === '' ? 0 : 1) + w
        line = line === '' ? word : `${line} ${word}`
      }
    }
    raw.push(line)
  }
  return raw.map((l, i) => (i === 0 || l === '' ? l : indent + l))
}

export interface Location {
  /** The path as shown (usually relative). */
  path: string
  /** Absolute path for the OSC 8 link; no link without it. */
  abs?: string | undefined
  line?: number | undefined
  column?: number | undefined
}

/** `path:line:col`, in the info role, underlined, and linked when `abs` is known. */
export const formatLocation = (t: Term, loc: Location): string => {
  const suffix =
    loc.line === undefined ? '' : `:${loc.line}${loc.column === undefined ? '' : `:${loc.column}`}`
  const styled = t.underline(t.info(`${loc.path}${suffix}`))
  return loc.abs === undefined ? styled : t.link(styled, fileUrl(loc.abs, loc.line))
}

export interface FindingInput {
  severity: Severity
  /** The gate or rule that produced it. */
  source: string
  message: string
  location?: Location | undefined
  /** Further locations, each with an optional label. */
  related?: ReadonlyArray<Location & { label?: string | undefined }> | undefined
  /** The concrete change that fixes it. */
  fix?: string | undefined
}

export interface FindingOptions {
  /** Leading spaces before the symbol. Default 2. */
  indent?: number | undefined
  width?: number | undefined
}

/**
 * Rule 4: `✗ source · message`, then `↳ file:line:col`, then `fix: change`.
 * The message and fix wrap at `width` with a hanging indent.
 */
export const finding = (t: Term, f: FindingInput, opts: FindingOptions = {}): string[] => {
  const indent = ' '.repeat(opts.indent ?? 2)
  const sub = `${indent}   `
  const width = opts.width ?? WRAP_WIDTH
  const head = `${indent}${severityMark(t, f.severity)} ${t.bold(f.source)} ${t.dim(t.sym('bullet'))} `
  const msg = wrap(f.message, width, width - visibleWidth(head), sub)
  const lines = [`${head}${msg[0] ?? ''}`, ...msg.slice(1)]
  const at = t.dim(t.sym('at'))
  if (f.location) lines.push(`${sub}${at} ${formatLocation(t, f.location)}`)
  for (const r of f.related ?? []) {
    lines.push(`${sub}${at} ${formatLocation(t, r)}${r.label ? ` ${t.dim(`(${r.label})`)}` : ''}`)
  }
  if (f.fix) {
    const prefix = `${sub}${t.dim('fix:')} `
    const fix = wrap(f.fix, width, width - visibleWidth(prefix), `${sub}     `)
    lines.push(`${prefix}${fix[0] ?? ''}`, ...fix.slice(1))
  }
  return lines
}

export interface FrameInput {
  /** Shown in the top border: `╭─[ title ]`. */
  title?: string | undefined
  lines: ReadonlyArray<string>
}

/** A code frame with a gray border; the ASCII fallback is `+- | +-`. */
export const frame = (t: Term, f: FrameInput, indent = 4): string[] => {
  const pad = ' '.repeat(indent)
  const side = t.gray(t.sym('frameSide'))
  const top = f.title
    ? `${pad}${t.gray(`${t.sym('frameTop')}[`)} ${f.title} ${t.gray(']')}`
    : `${pad}${t.gray(t.sym('frameTop'))}`
  return [top, ...f.lines.map((l) => `${pad}${side} ${l}`), `${pad}${t.gray(t.sym('frameBottom'))}`]
}
