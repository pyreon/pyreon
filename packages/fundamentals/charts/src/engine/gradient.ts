// Gradient geometry — the mark says WHAT, the plot box says WHERE.
//
// A user writes stops and a direction; the two points a gradient actually
// needs are only knowable once the plot has been laid out. Resolving them here
// (rather than asking the caller for coordinates, as ECharts does) means the
// same mark reads correctly at any size, and it crosses to native with the
// generated engine like every other piece of geometry.

import type { ChartGradient, ChartGradientStop, Rect } from './types'

/** The gradient a mark asks for: stops plus which way the ramp runs. */
export interface SeriesGradient {
  stops: ChartGradientStop[]
  /** `vertical` (the default) ramps top → bottom; `horizontal` left → right. */
  direction?: string | undefined
}

/**
 * The "no ramp" gradient.
 *
 * A module const with an explicit type, not an inline `{ stops: [] }`: an
 * empty array literal carries no element type, so the struct synthesizer can
 * name nothing and the whole engine emit degrades to a warning.
 */
const NO_GRADIENT: SeriesGradient = { stops: [] }

/**
 * Resolve a mark's gradient against the plot box.
 *
 * The ramp spans the PLOT, not each shape: two bars of different heights then
 * share one colour ramp, which is what makes a gradient read as lighting the
 * chart rather than as striping every bar identically.
 */
export function gradientFor(g: SeriesGradient, plot: Rect): ChartGradient {
  const horizontal = g.direction === 'horizontal'
  const from = { x: plot.x, y: plot.y }
  const to = horizontal ? { x: plot.x + plot.w, y: plot.y } : { x: plot.x, y: plot.y + plot.h }
  return { from, to, stops: g.stops }
}

/**
 * The gradient a series paints with — an EMPTY stop list means "none".
 *
 * Coalesces rather than narrows: Swift does not narrow an optional through a
 * ternary or an early return, so the engine must never READ through one. The
 * caller turns an empty ramp back into "no `grad` key" at the command
 * boundary, which keeps a solid series serializing byte-identically.
 */
export function seriesGradient(g: SeriesGradient | undefined, plot: Rect): ChartGradient {
  const src = g ?? NO_GRADIENT
  return gradientFor(src, plot)
}

/** The colour a gradient degrades to — its first stop, or `fallback` when it has none. */
export function gradientSolid(g: ChartGradient, fallback: string): string {
  if (g.stops.length === 0) return fallback
  return g.stops[0]!.color
}
