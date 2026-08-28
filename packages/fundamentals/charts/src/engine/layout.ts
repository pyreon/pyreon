// Plot-area layout and per-mark geometry.

import { makeTicks, scaleLinear } from './scale'
import type { Domain, MeasureText, Pt, Rect, Tick, Double } from './types'

/** How much room the axes need around the plot. */
export interface Gutters {
  left: Double
  right: Double
  top: Double
  bottom: Double
}

export interface PlotLayout {
  /** The drawable data area, inside the gutters. */
  plot: Rect
  xTicks: Tick[]
  yTicks: Tick[]
}

export interface LayoutConfig {
  width: Double
  height: Double
  xDomain: Domain
  yDomain: Domain
  /** Category labels for a band x-axis; empty for a numeric one. */
  categories: string[]
  fontSize: Double
  /** Target tick counts; the nice-step algorithm decides the actual number. */
  xTickCount: Double
  yTickCount: Double
  showXAxis: boolean
  showYAxis: boolean
}

/**
 * Compute the plot rect and both tick sets.
 *
 * The y-gutter is MEASURED from the widest actual y label rather than guessed
 * from a constant, because a chart of "1.2M" needs a wider gutter than one of
 * "8" and a fixed guess is wrong in both directions — clipping the first and
 * wasting space on the second.
 *
 * This is why `measure` is an argument. Label widths are needed BEFORE the plot
 * rect exists, and the plot rect is needed before anything can be drawn, so
 * measurement cannot happen during drawing. Each backend answers it from its
 * own font metrics.
 */
export function computeLayout(cfg: LayoutConfig, measure: MeasureText): PlotLayout {
  const padTop = 8.0
  const padRight = 12.0
  const labelGap = 6.0
  const tickLen = 4.0

  // Provisional y ticks over the full height, purely to measure their labels.
  // Their POSITIONS are recomputed below against the final plot rect — only the
  // label TEXT is needed here, and that does not depend on the rect.
  const provisional = cfg.showYAxis
    ? makeTicks(cfg.yDomain, cfg.height, 0.0, cfg.yTickCount)
    : []
  let widest = 0.0
  for (const t of provisional) {
    const w = measure(t.label, cfg.fontSize)
    if (w > widest) widest = w
  }

  const left = cfg.showYAxis ? widest + labelGap + tickLen : 0.0
  const bottom = cfg.showXAxis ? cfg.fontSize + labelGap + tickLen : 0.0

  const plot: Rect = {
    x: left,
    y: padTop,
    w: Math.max(0.0, cfg.width - left - padRight),
    h: Math.max(0.0, cfg.height - padTop - bottom),
  }

  // y grows DOWNWARD in screen space, so the domain min maps to the plot's
  // bottom edge and the max to its top — the range is deliberately inverted.
  const yTicks = cfg.showYAxis
    ? makeTicks(cfg.yDomain, plot.y + plot.h, plot.y, cfg.yTickCount)
    : []

  const xTicks = cfg.showXAxis
    ? cfg.categories.length > 0
      ? bandTicks(cfg.categories, plot)
      : makeTicks(cfg.xDomain, plot.x, plot.x + plot.w, cfg.xTickCount)
    : []

  return { plot, xTicks, yTicks }
}

/** One tick per category, centred on its band. */
export function bandTicks(categories: string[], plot: Rect): Tick[] {
  const n = categories.length
  const out: Tick[] = []
  if (n === 0) return out
  const bw = plot.w / n
  for (let i = 0; i < n; i++) {
    out.push({
      value: i,
      pos: plot.x + bw * (i + 0.5),
      label: categories[i]!,
    })
  }
  return out
}

/**
 * Bar rects across a band scale.
 *
 * `gapRatio` is the fraction of each band left as gap, so bars keep their
 * proportions at any width instead of being sized by an absolute pixel gap that
 * looks right at one size only. Clamped below 1 so a caller passing 1.0 cannot
 * produce zero-width bars.
 */
export function layoutBars(
  values: Double[],
  plot: Rect,
  yDomain: Domain,
  gapRatio: Double,
): Rect[] {
  const n = values.length
  const out: Rect[] = []
  if (n === 0) return out
  const ratio = gapRatio < 0.0 ? 0.0 : gapRatio > 0.9 ? 0.9 : gapRatio
  const band = plot.w / n
  const bw = band * (1.0 - ratio)
  // Bars are measured from the axis zero line when the domain straddles zero,
  // so a negative value draws downward from it rather than up from the floor.
  const zero = yDomain.min < 0.0 && yDomain.max > 0.0 ? 0.0 : yDomain.min
  const zeroY = scaleLinear(yDomain, plot.y + plot.h, plot.y, zero)
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    const vy = scaleLinear(yDomain, plot.y + plot.h, plot.y, v)
    const top = vy < zeroY ? vy : zeroY
    const h = Math.abs(zeroY - vy)
    out.push({ x: plot.x + band * i + (band - bw) / 2.0, y: top, w: bw, h })
  }
  return out
}

/** Points for a line or area series, evenly spaced across the plot. */
export function layoutSeriesPoints(values: Double[], plot: Rect, yDomain: Domain): Pt[] {
  const n = values.length
  const out: Pt[] = []
  if (n === 0) return out
  if (n === 1) {
    out.push({
      x: plot.x + plot.w / 2.0,
      y: scaleLinear(yDomain, plot.y + plot.h, plot.y, values[0]!),
    })
    return out
  }
  for (let i = 0; i < n; i++) {
    out.push({
      x: plot.x + (i / (n - 1)) * plot.w,
      y: scaleLinear(yDomain, plot.y + plot.h, plot.y, values[i]!),
    })
  }
  return out
}

/** Index of the bar containing a point, or -1. */
export function hitBar(bars: Rect[], px: Double, py: Double): number {
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return i
  }
  return -1
}

/**
 * Index of the series point nearest a given x, or -1 for an empty series.
 * Nearest-by-x rather than nearest-by-distance because that is what a tooltip
 * wants: sweeping horizontally should select the point under the cursor's
 * column regardless of how far the pointer sits from the line vertically.
 */
export function hitNearestX(points: Pt[], px: Double): number {
  if (points.length === 0) return -1
  let best = 0
  let bestD = Math.abs(points[0]!.x - px)
  for (let i = 1; i < points.length; i++) {
    const d = Math.abs(points[i]!.x - px)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
