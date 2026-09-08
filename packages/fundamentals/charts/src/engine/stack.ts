// Stacked and grouped bars, and scatter with a real x channel.
//
// Every mark so far spaces its data evenly across the plot, which is right for
// a category axis and wrong for a scatter plot — there, x is a measured value
// like y, and pretending otherwise silently redraws the data.

import { scaleLinear } from './scale'
import type { Domain, Double, Pt, Rect } from './types'

/** One band's worth of stacked segments, bottom to top. */
export interface StackSegment {
  rect: Rect
  seriesIndex: number
  datumIndex: number
  value: Double
}

/**
 * Stack series on top of each other within each band.
 *
 * Only non-negative values stack: mixing signs in a stack produces a bar whose
 * height is not its total and whose segments overlap, which no reading of the
 * chart can recover. Negative values are skipped and reported by
 * `stackHasNegatives` so a caller can warn rather than silently mislead.
 */
export function layoutStackedBars(
  seriesValues: Double[][],
  plot: Rect,
  yDomain: Domain,
  gapRatio: Double,
): StackSegment[] {
  const out: StackSegment[] = []
  if (seriesValues.length === 0) return out
  let n = 0
  for (const s of seriesValues) if (s.length > n) n = s.length
  if (n === 0) return out

  const ratio = gapRatio < 0.0 ? 0.0 : gapRatio > 0.9 ? 0.9 : gapRatio
  const band = plot.w / n
  const bw = band * (1.0 - ratio)

  for (let i = 0; i < n; i++) {
    let acc = 0.0
    for (let s = 0; s < seriesValues.length; s++) {
      const v = seriesValues[s]![i] ?? 0.0
      // `!(v > 0)` rather than `v <= 0`: a gap (NaN) fails both comparisons,
      // and a gap in a stack is a zero-height segment, never a NaN column.
      if (!(v > 0.0)) continue
      const yTop = scaleLinear(yDomain, plot.y + plot.h, plot.y, acc + v)
      const yBot = scaleLinear(yDomain, plot.y + plot.h, plot.y, acc)
      out.push({
        rect: {
          x: plot.x + band * i + (band - bw) / 2.0,
          y: yTop,
          w: bw,
          h: Math.abs(yBot - yTop),
        },
        seriesIndex: s,
        datumIndex: i,
        value: v,
      })
      acc = acc + v
    }
  }
  return out
}

/** True when any value would be dropped from a stack. */
export function stackHasNegatives(seriesValues: Double[][]): boolean {
  for (const s of seriesValues) for (const v of s) if (v < 0.0) return true
  return false
}

/** The domain a stacked chart needs — the tallest TOTAL, not the tallest value. */
export function stackedExtent(seriesValues: Double[][]): Domain {
  let n = 0
  for (const s of seriesValues) if (s.length > n) n = s.length
  let max = 0.0
  for (let i = 0; i < n; i++) {
    let sum = 0.0
    for (const s of seriesValues) {
      const v = s[i] ?? 0.0
      if (v > 0.0) sum = sum + v
    }
    if (sum > max) max = sum
  }
  return { min: 0.0, max: max === 0.0 ? 1.0 : max }
}

/** Bars sitting side by side within each band, one per series. */
export function layoutGroupedBars(
  seriesValues: Double[][],
  plot: Rect,
  yDomain: Domain,
  gapRatio: Double,
): StackSegment[] {
  const out: StackSegment[] = []
  const k = seriesValues.length
  if (k === 0) return out
  let n = 0
  for (const s of seriesValues) if (s.length > n) n = s.length
  if (n === 0) return out

  const ratio = gapRatio < 0.0 ? 0.0 : gapRatio > 0.9 ? 0.9 : gapRatio
  const band = plot.w / n
  const groupW = band * (1.0 - ratio)
  const barW = groupW / k
  const zero = yDomain.min < 0.0 && yDomain.max > 0.0 ? 0.0 : yDomain.min
  const zeroY = scaleLinear(yDomain, plot.y + plot.h, plot.y, zero)

  for (let i = 0; i < n; i++) {
    const gx = plot.x + band * i + (band - groupW) / 2.0
    for (let s = 0; s < k; s++) {
      const raw = seriesValues[s]![i] ?? 0.0
      // A gap draws a zero-height bar at the zero line — nothing to see, nothing to hit.
      const v = raw === raw ? raw : zero
      const vy = scaleLinear(yDomain, plot.y + plot.h, plot.y, v)
      out.push({
        rect: {
          x: gx + barW * s,
          y: vy < zeroY ? vy : zeroY,
          w: barW,
          h: Math.abs(zeroY - vy),
        },
        seriesIndex: s,
        datumIndex: i,
        value: v,
      })
    }
  }
  return out
}

/**
 * Scatter points from independent x and y channels.
 *
 * Distinct from `layoutSeriesPoints`, which spaces data evenly by index. A
 * scatter plot's x carries meaning, and using the index instead would draw a
 * different dataset than the one supplied.
 */
export function layoutScatter(
  xs: Double[],
  ys: Double[],
  plot: Rect,
  xDomain: Domain,
  yDomain: Domain,
): Pt[] {
  const n = Math.min(xs.length, ys.length)
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      x: scaleLinear(xDomain, plot.x, plot.x + plot.w, xs[i]!),
      y: scaleLinear(yDomain, plot.y + plot.h, plot.y, ys[i]!),
    })
  }
  return out
}

/**
 * Scale every column of a stack to its total, so each series reads as a
 * SHARE of the column (the 100% stacked bar). A column whose positives sum to
 * zero stays zero, and a gap (NaN) stays a gap — it contributes nothing to
 * the total and draws nothing. The chart's domain is then `{0, 1}`, labelled
 * as percent by default.
 */
export function normalizeStack(seriesValues: Double[][]): Double[][] {
  let n = 0
  for (const s of seriesValues) if (s.length > n) n = s.length
  const totals: Double[] = []
  for (let i = 0; i < n; i++) {
    let sum = 0.0
    for (const s of seriesValues) {
      // Bounds-checked, not coalesced: a Swift subscript is never optional.
      const v = i < s.length ? s[i]! : 0.0
      if (v > 0.0) sum = sum + v
    }
    totals.push(sum)
  }
  const out: Double[][] = []
  for (const s of seriesValues) {
    const row: Double[] = []
    for (let i = 0; i < s.length; i++) {
      const v = s[i]!
      const total = totals[i]!
      // A gap stays NaN (NaN / x is NaN); a zero total maps everything to 0.
      row.push(total > 0.0 ? v / total : v === v ? 0.0 : v)
    }
    out.push(row)
  }
  return out
}

/** One waterfall step: the floating bar from the running total before it to the total after it. */
export interface WaterfallStep {
  rect: Rect
  datumIndex: number
  value: Double
  /** Running total before this step. */
  start: Double
  /** Running total after it. */
  end: Double
}

/**
 * Floating bars, each rising (or falling) from where the previous one ended
 * — the waterfall / bridge chart. A positive value grows upward from the
 * running total, a negative one hangs below it; a gap (NaN) draws no bar and
 * leaves the total where it was.
 */
export function layoutWaterfall(
  values: Double[],
  plot: Rect,
  yDomain: Domain,
  gapRatio: Double,
): WaterfallStep[] {
  const out: WaterfallStep[] = []
  const n = values.length
  if (n === 0) return out
  const ratio = gapRatio < 0.0 ? 0.0 : gapRatio > 0.9 ? 0.9 : gapRatio
  const band = plot.w / n
  const bw = band * (1.0 - ratio)
  let acc = 0.0
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    if (v !== v) continue
    const start = acc
    const end = acc + v
    const y0 = scaleLinear(yDomain, plot.y + plot.h, plot.y, start)
    const y1 = scaleLinear(yDomain, plot.y + plot.h, plot.y, end)
    out.push({
      rect: { x: plot.x + band * i + (band - bw) / 2.0, y: y0 < y1 ? y0 : y1, w: bw, h: Math.abs(y1 - y0) },
      datumIndex: i,
      value: v,
      start,
      end,
    })
    acc = end
  }
  return out
}

/** The domain a waterfall needs — every running total, and zero. */
export function waterfallExtent(values: Double[]): Domain {
  let acc = 0.0
  let lo = 0.0
  let hi = 0.0
  for (const v of values) {
    if (v !== v) continue
    acc = acc + v
    if (acc < lo) lo = acc
    if (acc > hi) hi = acc
  }
  return { min: lo, max: hi === lo ? lo + 1.0 : hi }
}
