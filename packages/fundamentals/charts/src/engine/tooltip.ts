// Tooltip content and placement.
//
// The engine resolves WHAT to show and WHERE; rendering it is the host's, since
// a DOM overlay on web and a native popover want different surfaces. Keeping
// placement here means the flip-at-the-edge logic is written once.

import { groupThousands, plain } from './format'
import type { Formatter } from './format'
import { isFiniteNumber } from './scale'
import type { Double, Pt, Rect } from './types'
import type { SeriesExtra } from './render'

/** A box's extent — a named shape so the placement crosses to native. */
export interface Size {
  w: Double
  h: Double
}

export interface TooltipRow {
  label: string
  value: Double
  color: string
  /**
   * The row's SECOND bound, where the series has one — a `band`'s low edge.
   *
   * The tooltip is how a sighted reader gets a band's numbers, and a row
   * carrying only the high edge reports one number for a mark whose whole
   * meaning is the pair. A `tooltipFormatter` sees it too, so a custom
   * renderer can lay the interval out however it likes.
   */
  value2?: Double | undefined
  /**
   * The bubble channel's raw value, where the series has one.
   *
   * A bubble's size IS a variable; a row naming only its y leaves the reader
   * comparing areas by eye, which is the thing tooltips exist to avoid.
   */
  size?: Double | undefined
  /** A text dimension (an `extras` column of strings); `value` is NaN then. */
  text?: string | undefined
}

export interface TooltipContent {
  title: string
  rows: TooltipRow[]
}

/** A plotted series as the tooltip reads it — a named shape so this module crosses to native. */
export interface TooltipSeries {
  label: string
  values: Double[]
  color: string
  /** The series' second channel, where it has one — see `TooltipRow.value2`. */
  values2?: Double[] | undefined
  /** The bubble channel's RAW values, where the series has them. */
  rValues?: Double[] | undefined
  /**
   * Extra dimensions shown under the value (ECharts' `encode.tooltip`) — the
   * engine's own `SeriesExtra`, not a structural twin: two identically-shaped
   * structs are two TYPES on Swift, and the series' extras must pass through.
   */
  extras?: SeriesExtra[] | undefined
}

/** Everything plotted at one datum index, for a shared-axis tooltip. */
export function tooltipAt(index: number, categories: string[], series: TooltipSeries[]): TooltipContent {
  const rows: TooltipRow[] = []
  for (const s of series) {
    const v = s.values[index]
    // A gap has no row: the tooltip lists what was MEASURED, so a non-finite
    // value — dropped from the geometry — is absent here too, never "Infinity".
    if (v === undefined || !isFiniteNumber(v)) continue
    // `let`, not `const`: a `const` lowers to a Swift `let` and a struct
    // property cannot be assigned through one. `?? []` rather than an
    // `!== undefined` guard for the same reason — PMTC does not carry that
    // narrowing, and this module crosses to native.
    // oxlint-disable-next-line prefer-const
    let row: TooltipRow = { label: s.label, value: v, color: s.color }
    const other: Double[] = s.values2 ?? []
    if (index < other.length) {
      const v2 = other[index]!
      // A non-finite bound is a gap in the second channel, not a printed NaN.
      if (isFiniteNumber(v2)) row = { label: s.label, value: v, color: s.color, value2: v2 }
    }
    const rs: Double[] = s.rValues ?? []
    if (index < rs.length) {
      const r = rs[index]!
      if (isFiniteNumber(r)) row = { label: row.label, value: row.value, color: row.color, value2: row.value2, size: r }
    }
    rows.push(row)
    // Extra dimensions follow their series' row, one line each: a number
    // reads like a value, a text reads as `label: text`.
    const extras: SeriesExtra[] = s.extras ?? []
    for (const e of extras) {
      const nums: Double[] = e.numbers ?? []
      const strs: string[] = e.texts ?? []
      // Typed locals, not inline literals: a `{ label, value, color }` literal
      // is exactly a `Slice` by field names AND types, and struct selection
      // would pick it over TooltipRow (whose other fields are optional).
      if (index < nums.length) {
        const ev = nums[index]!
        if (isFiniteNumber(ev)) {
          const numRow: TooltipRow = { label: e.label, value: ev, color: s.color }
          rows.push(numRow)
        }
      } else if (index < strs.length) {
        const textRow: TooltipRow = { label: e.label, value: 0.0 / 0.0, color: s.color, text: strs[index]! }
        rows.push(textRow)
      }
    }
  }
  return { title: categories[index] ?? `${index + 1}`, rows }
}

/** Formatted lines, ready to render. */
export function tooltipLines(c: TooltipContent, format?: Formatter): string[] {
  const fmt = format ?? plain
  const out = [c.title]
  for (const r of c.rows) {
    // NaN as "absent" rather than an optional narrowing: PMTC does not carry
    // `!== undefined` into Swift, and the gap idiom is already NaN here.
    const lo: Double = r.value2 ?? (0.0 / 0.0)
    // Low to high reads as a range; the channel order is the band's own
    // (`values` is the HIGH edge), so it is stated low-first here.
    const sz: Double = r.size ?? (0.0 / 0.0)
    // A text row carries NaN for its value — the same "absent" idiom.
    const txt = r.text ?? ''
    if (lo === lo) out.push(`${r.label}: ${fmt(lo)} to ${fmt(r.value)}`)
    else if (sz === sz) out.push(`${r.label}: ${fmt(r.value)} (size ${fmt(sz)})`)
    else if (r.value !== r.value) out.push(`${r.label}: ${txt}`)
    else out.push(`${r.label}: ${fmt(r.value)}`)
  }
  return out
}

/** A row's value alone, as ECharts' default tooltip shows it (the name is its own cell). */
function rowShown(r: TooltipRow, fmt: Formatter): string {
  const lo: Double = r.value2 ?? (0.0 / 0.0)
  const sz: Double = r.size ?? (0.0 / 0.0)
  const txt = r.text ?? ''
  if (lo === lo) return `${fmt(lo)} - ${fmt(r.value)}`
  if (sz === sz) return `${fmt(r.value)} (${fmt(sz)})`
  if (r.value !== r.value) return txt
  return fmt(r.value)
}

/**
 * ECharts' default AXIS tooltip as `renderTooltipRows` cells: the category,
 * then per series its colour, its name — only where the option NAMED it
 * (`named[i]`), as ECharts hides a generated name — and the value, grouped
 * by thousands unless `format` shapes it. Empty when nothing is plotted there.
 */
export function tooltipAxisCells(index: number, categories: string[], series: TooltipSeries[], named: boolean[], format?: Formatter): string[] {
  const fmt = format ?? groupThousands
  const out: string[] = [categories[index] ?? `${index + 1}`]
  for (let si = 0; si < series.length; si++) {
    const c = tooltipAt(index, categories, [series[si]!])
    const shown = si < named.length && named[si]!
    for (let ri = 0; ri < c.rows.length; ri++) {
      const r = c.rows[ri]!
      out.push(r.color)
      out.push(ri > 0 ? r.label : shown ? r.label : '')
      out.push(rowShown(r, fmt))
    }
  }
  return out.length > 1 ? out : []
}

/**
 * ECharts' default ITEM tooltip for one series at one datum: the series name
 * as the header (none for an unnamed series), then its colour, the category
 * and the value; extra dimensions follow as rows of their own.
 */
export function tooltipItemCells(index: number, categories: string[], series: TooltipSeries, named: boolean, format?: Formatter): string[] {
  const fmt = format ?? groupThousands
  const c = tooltipAt(index, categories, [series])
  if (c.rows.length === 0) return []
  const out: string[] = [named ? series.label : '']
  for (let ri = 0; ri < c.rows.length; ri++) {
    const r = c.rows[ri]!
    out.push(r.color)
    out.push(ri === 0 ? (categories[index] ?? '') : r.label)
    out.push(rowShown(r, fmt))
  }
  return out
}

/**
 * Place a tooltip near a point without letting it leave the chart.
 *
 * Flips to the other side when it would overflow rather than clamping, because
 * clamping slides the tooltip over the very datum it describes. Vertically it
 * clamps, since there is usually nothing to occlude above or below.
 */
export function placeTooltip(at: Pt, size: Size, bounds: Rect, offset: Double): Pt {
  let x = at.x + offset
  if (x + size.w > bounds.x + bounds.w) x = at.x - offset - size.w
  if (x < bounds.x) x = bounds.x

  let y = at.y - size.h / 2.0
  if (y < bounds.y) y = bounds.y
  if (y + size.h > bounds.y + bounds.h) y = bounds.y + bounds.h - size.h
  return { x, y }
}
