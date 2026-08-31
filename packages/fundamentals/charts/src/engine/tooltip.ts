// Tooltip content and placement.
//
// The engine resolves WHAT to show and WHERE; rendering it is the host's, since
// a DOM overlay on web and a native popover want different surfaces. Keeping
// placement here means the flip-at-the-edge logic is written once.

import { plain } from './format'
import type { Formatter } from './format'
import type { Double, Rect } from './types'

export interface TooltipRow {
  label: string
  value: Double
  color: string
}

export interface TooltipContent {
  title: string
  rows: TooltipRow[]
}

/** Everything plotted at one datum index, for a shared-axis tooltip. */
export function tooltipAt(
  index: number,
  categories: string[],
  series: { label: string; values: Double[]; color: string }[],
): TooltipContent {
  const rows: TooltipRow[] = []
  for (const s of series) {
    const v = s.values[index]
    if (v === undefined) continue
    rows.push({ label: s.label, value: v, color: s.color })
  }
  return { title: categories[index] ?? `${index + 1}`, rows }
}

/** Formatted lines, ready to render. */
export function tooltipLines(c: TooltipContent, format?: Formatter): string[] {
  const fmt = format ?? plain
  const out = [c.title]
  for (const r of c.rows) out.push(`${r.label}: ${fmt(r.value)}`)
  return out
}

/**
 * Place a tooltip near a point without letting it leave the chart.
 *
 * Flips to the other side when it would overflow rather than clamping, because
 * clamping slides the tooltip over the very datum it describes. Vertically it
 * clamps, since there is usually nothing to occlude above or below.
 */
export function placeTooltip(
  at: { x: Double; y: Double },
  size: { w: Double; h: Double },
  bounds: Rect,
  offset: Double,
): { x: Double; y: Double } {
  let x = at.x + offset
  if (x + size.w > bounds.x + bounds.w) x = at.x - offset - size.w
  if (x < bounds.x) x = bounds.x

  let y = at.y - size.h / 2.0
  if (y < bounds.y) y = bounds.y
  if (y + size.h > bounds.y + bounds.h) y = bounds.y + bounds.h - size.h
  return { x, y }
}
