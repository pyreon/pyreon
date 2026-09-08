// Tooltip content and placement.
//
// The engine resolves WHAT to show and WHERE; rendering it is the host's, since
// a DOM overlay on web and a native popover want different surfaces. Keeping
// placement here means the flip-at-the-edge logic is written once.

import { plain } from './format'
import type { Formatter } from './format'
import type { Double, Pt, Rect } from './types'

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
}

/** Everything plotted at one datum index, for a shared-axis tooltip. */
export function tooltipAt(index: number, categories: string[], series: TooltipSeries[]): TooltipContent {
  const rows: TooltipRow[] = []
  for (const s of series) {
    const v = s.values[index]
    // A gap (NaN) has no row: the tooltip lists what was measured.
    if (v === undefined || v !== v) continue
    // `let`, not `const`: a `const` lowers to a Swift `let` and a struct
    // property cannot be assigned through one. `?? []` rather than an
    // `!== undefined` guard for the same reason — PMTC does not carry that
    // narrowing, and this module crosses to native.
    // oxlint-disable-next-line prefer-const
    let row: TooltipRow = { label: s.label, value: v, color: s.color }
    const other: Double[] = s.values2 ?? []
    if (index < other.length) {
      const v2 = other[index]!
      // A NaN bound is a gap in the second channel, not a printed NaN.
      if (v2 === v2) row = { label: s.label, value: v, color: s.color, value2: v2 }
    }
    rows.push(row)
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
    if (lo === lo) out.push(`${r.label}: ${fmt(lo)} to ${fmt(r.value)}`)
    else out.push(`${r.label}: ${fmt(r.value)}`)
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
