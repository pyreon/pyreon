/**
 * ECharts' tooltip formatter TEMPLATE, and the data a tooltip is formatted
 * from.
 *
 * A string `formatter` is a template: `{a}` the series name, `{b}` the datum's
 * name (the category), `{c}` its value, `{d}` its percentage where the family
 * has one, `{@[n]}` the n-th value of an array datum. With `trigger: 'axis'`
 * there is one entry per series and each placeholder takes the entry's index
 * — `{a1}`, `{c0}` — while an un-indexed one reads the first entry, as ECharts
 * does. `<br/>` (and `<br>`, `\n`) break lines.
 *
 * Pure string work over a plain record, so the same module formats the web
 * tooltip and can join the generated native engine.
 */
import type { Double } from './types'

/** One series' contribution to a tooltip — what a template placeholder reads. */
export interface TooltipEntry {
  /** `{a}` */
  seriesName: string
  /** `{b}` */
  name: string
  /** `{c}`, already formatted. */
  value: string
  /** `{d}` — the share of the whole, where the family has one; '' otherwise. */
  percent: string
  /** `{@[n]}` — the datum's own values, formatted, for an array datum. */
  values: string[]
  /** The swatch colour. */
  color: string
}

const readIndex = (text: string, at: number): { index: number; end: number } => {
  let i = at
  let n = -1
  while (i < text.length) {
    const code = text.charCodeAt(i)
    if (code < 48 || code > 57) break
    n = (n < 0 ? 0 : n * 10) + (code - 48)
    i++
  }
  return { index: n, end: i }
}

/**
 * Fill an ECharts template. An unknown placeholder is left as written, so a
 * typo shows rather than vanishing.
 */
export function formatTooltipTemplate(template: string, entries: TooltipEntry[]): string {
  let out = ''
  let i = 0
  while (i < template.length) {
    const ch = template[i]!
    if (ch !== '{') {
      out += ch
      i++
      continue
    }
    const close = template.indexOf('}', i)
    if (close < 0) {
      out += template.slice(i)
      break
    }
    const body = template.slice(i + 1, close)
    const replaced = placeholder(body, entries)
    out += replaced === null ? template.slice(i, close + 1) : replaced
    i = close + 1
  }
  return out
}

function placeholder(body: string, entries: TooltipEntry[]): string | null {
  if (body.length === 0) return null
  if (body.startsWith('@[') && body.endsWith(']')) {
    const n = readIndex(body, 2)
    if (n.index < 0 || n.end !== body.length - 1) return null
    const e = entries[0]
    return e === undefined ? '' : (e.values[n.index] ?? '')
  }
  const key = body[0]!
  if (key !== 'a' && key !== 'b' && key !== 'c' && key !== 'd') return null
  let index = 0
  if (body.length > 1) {
    const n = readIndex(body, 1)
    if (n.index < 0 || n.end !== body.length) return null
    index = n.index
  }
  const e = entries[index]
  if (e === undefined) return ''
  if (key === 'a') return e.seriesName
  if (key === 'b') return e.name
  if (key === 'c') return e.value
  return e.percent
}

/** ECharts' line breaks in tooltip text, as newlines. */
export function tooltipBreaks(text: string): string {
  let out = text
  for (const tag of ['<br/>', '<br />', '<br>', '<BR/>', '<BR>']) out = out.split(tag).join('\n')
  return out
}

/**
 * The HTML ECharts hands a formatter as `params.marker`: an inline dot in the
 * series colour. Kept byte-compatible so a formatter that concatenates it
 * renders the same swatch.
 */
export function tooltipMarker(color: string): string {
  return `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${color};"></span>`
}

/** `{d}`: a share of the whole, as ECharts prints it (two decimals, no trailing zeros). */
export function tooltipPercent(value: Double, total: Double): string {
  if (!(total > 0.0) || !(value === value)) return ''
  const pct = Math.round((value / total) * 10000.0) / 100.0
  return String(pct)
}

/** ECharts' `order` for an axis tooltip: the entries in series order, reversed, or by value. */
export function orderTooltipEntries(entries: TooltipEntry[], order: string, numeric: Double[]): TooltipEntry[] {
  if (order === 'seriesDesc') return entries.slice().reverse()
  if (order !== 'valueAsc' && order !== 'valueDesc') return entries
  const idx: number[] = []
  for (let i = 0; i < entries.length; i++) idx.push(i)
  idx.sort((x, y) => {
    const a = numeric[x] ?? 0.0
    const b = numeric[y] ?? 0.0
    return order === 'valueAsc' ? a - b : b - a
  })
  return idx.map((i) => entries[i]!)
}
