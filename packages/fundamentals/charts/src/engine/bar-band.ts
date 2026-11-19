// Bars on a CONTINUOUS (numeric or time) x axis.
//
// A category axis gives every datum an equal band, so the bar layout is a pure
// function of the datum's INDEX. On a numeric x axis the datum sits where its x
// value says, and its slot is as wide as the axis lets one bar be without
// touching its neighbour: the smallest positive gap between two x values (or an
// explicit `barSpan`, in x-domain units). The same index-based layout is reused
// unchanged: it is run over a frame exactly `slot * n` wide (so every band is
// one slot, and `barWidth` / `barGap` / `barCategoryGap` keep their meaning),
// and each rect is then moved so its slot is centred on the scaled x.

import { extent, isFiniteNumber, scaleLinear } from './scale'
import type { ChartSpec } from './render'
import type { Domain, Rect, Double } from './types'

/**
 * The width of one bar slot on a numeric x axis, in x-domain units: `barSpan`
 * when set, else the smallest positive gap between neighbouring x values (1 when
 * there is none). 0 when x is a category axis or no series draws bars, which is
 * how the callers tell "category axis" from "continuous axis with bars".
 */
export function barBand(spec: ChartSpec): Double {
  const xs = spec.xValues ?? []
  if (xs.length === 0) return 0.0
  // Only bar series have slots; a line on a numeric axis places points by x and needs no padding.
  let any = false
  for (const s of spec.series) if (s.kind === 'bars' || s.kind === 'stacked' || s.kind === 'grouped' || s.kind === 'waterfall') any = true
  if (!any) return 0.0
  const span = spec.barSpan ?? 0.0
  if (span > 0.0) return span
  const sorted = xs.filter((v) => isFiniteNumber(v)).sort((a, b) => a - b)
  let gap = 0.0
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i]! - sorted[i - 1]!
    if (d > 0.0 && (gap === 0.0 || d < gap)) gap = d
  }

  return gap > 0.0 ? gap : 1.0
}

/** The x domain of a numeric axis: the extent of the x values, padded by half a bar slot (`band`, 0 with no bars). */
export function numericXDomain(spec: ChartSpec, band: Double): Domain {
  const e = extent(spec.xValues ?? [])

  return { min: e.min - band / 2.0, max: e.max + band / 2.0, inverse: spec.xInverse }
}

export interface BandFrame {
  /** The plot to hand the index-based layout: `slot * n` wide (tall, horizontally), or the plot itself on a category axis. */
  frame: Rect
  /** Per datum, how far to move its rect along the band axis; empty (no move) on a category axis. */
  shifts: Double[]
}

/** The frame and per-datum shifts that put each of `n` bar slots on its scaled x (see the file header). */
export function bandFrame(spec: ChartSpec, plot: Rect, horizontal: boolean, n: number): BandFrame {
  const band = barBand(spec)
  if (band <= 0.0 || n === 0) return { frame: plot, shifts: [] }
  const xs = spec.xValues ?? []
  const dom = numericXDomain(spec, band)
  const span = dom.max - dom.min
  const len = horizontal ? plot.h : plot.w
  const start = horizontal ? plot.y : plot.x
  const slot = span > 0.0 ? (band / span) * len : len
  const shifts: Double[] = []
  for (let i = 0; i < n; i++) {
    const c = scaleLinear(dom, start, start + len, i < xs.length ? xs[i]! : 0.0)
    shifts.push(isFiniteNumber(c) ? c - slot / 2.0 - (start + slot * i) : 0.0)
  }
  const frame: Rect = horizontal ? { x: plot.x, y: plot.y, w: plot.w, h: slot * n } : { x: plot.x, y: plot.y, w: slot * n, h: plot.h }

  return { frame, shifts }
}

/** `r` moved along the band axis by `shifts[i]` (unchanged when the frame had none). */
export function shiftRect(r: Rect, shifts: Double[], i: number, horizontal: boolean): Rect {
  if (i < 0 || i >= shifts.length) return r

  return horizontal ? { ...r, y: r.y + shifts[i]! } : { ...r, x: r.x + shifts[i]! }
}
