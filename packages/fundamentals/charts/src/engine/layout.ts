// Plot-area layout and per-mark geometry.

import { makeTicks, scaleLinear } from './scale'
import { timeTicks } from './scale-extra'
import type { Formatter } from './format'
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
  /** Right-axis ticks; empty unless the config carries a `y2Domain`. */
  y2Ticks: Tick[]
  /**
   * The x domain the ticks were computed against.
   *
   * Returned rather than left for the caller to recompute, because a mark
   * placed against a domain that differs from the one the axis was labelled
   * with lands beside its own tick — the two must come from one source.
   */
  xDomainUsed: Domain
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
  /**
   * Tick label formatting, per axis.
   *
   * The axis is the one place a chart's numbers are read literally, so the
   * default (trim the float noise and print the number) is right for counts
   * and wrong for money, percentages and anything above about ten thousand.
   * `currency`, `percent`, `compact` and `fixed` live in `./format`; any
   * `(v: number) => string` works.
   */
  yFormat?: Formatter | undefined
  xFormat?: Formatter | undefined
  /**
   * Treat the x domain as epoch milliseconds.
   *
   * The nice-number ladder that labels a numeric axis produces steps like
   * 20,000ms, whose labels nobody reads. Calendar steps are chosen from the
   * span instead, so a day of data ticks hourly and a year of it ticks monthly.
   * `xFormat` still wins when given — this only picks the DEFAULT labelling.
   */
  xTime?: boolean | undefined
  /**
   * The RIGHT y domain, for dual-axis charts. Its presence is what widens the
   * right gutter from the slim default to a measured one — the same
   * measured-not-guessed rule the left gutter follows — and what makes
   * `y2Ticks` non-empty. Ignored in the horizontal frame (single value axis).
   */
  y2Domain?: Domain | undefined
  /** Tick label formatting for the right axis. */
  y2Format?: Formatter | undefined
  /**
   * Flip the frame: categories on the Y axis, values on X.
   *
   * The left gutter is then sized by the widest CATEGORY label rather than
   * the widest value label — long category names are the reason horizontal
   * bars exist, so the gutter math is the feature, not a detail.
   */
  horizontal?: boolean | undefined
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

  // Provisional y-side labels, purely to size the left gutter. Vertical
  // charts measure VALUE labels there; a horizontal chart puts CATEGORIES on
  // the y axis, so it measures those instead — long category names are the
  // reason horizontal bars exist, and a gutter sized for numbers would clip
  // every one of them.
  const provisionalLabels = cfg.horizontal === true
    ? cfg.showYAxis
      ? cfg.categories
      : []
    : cfg.showYAxis
      ? makeTicks(cfg.yDomain, cfg.height, 0.0, cfg.yTickCount, cfg.yFormat).map((t) => t.label)
      : []
  let widest = 0.0
  for (const label of provisionalLabels) {
    const w = measure(label, cfg.fontSize)
    if (w > widest) widest = w
  }

  const left = cfg.showYAxis ? widest + labelGap + tickLen : 0.0
  const bottom = cfg.showXAxis ? cfg.fontSize + labelGap + tickLen : 0.0

  // Coalesced before the guard (the Swift-narrowing idiom used throughout):
  // the sentinel domain is never read unless `hasY2` is true.
  const y2dom = cfg.y2Domain ?? { min: 0.0, max: 1.0 }
  const hasY2 = cfg.y2Domain !== undefined && cfg.horizontal !== true && cfg.showYAxis
  let widest2 = 0.0
  if (hasY2) {
    for (const label of makeTicks(y2dom, cfg.height, 0.0, cfg.yTickCount, cfg.y2Format).map((t) => t.label)) {
      const w = measure(label, cfg.fontSize)
      if (w > widest2) widest2 = w
    }
  }
  const right = hasY2 ? widest2 + labelGap + tickLen : padRight

  const plot: Rect = {
    x: left,
    y: padTop,
    w: Math.max(0.0, cfg.width - left - right),
    h: Math.max(0.0, cfg.height - padTop - bottom),
  }

  if (cfg.horizontal === true) {
    // Flipped frame: category bands run down the y axis, the VALUE domain
    // runs along x. The value ticks reuse the y domain — that is where the
    // data lives — and the same formatter, so a chart flipped horizontal
    // keeps its "$3.2K" labels without re-wiring anything.
    const yTicks = cfg.showYAxis ? bandTicksY(cfg.categories, plot) : []
    const xTicks = cfg.showXAxis
      ? makeTicks(cfg.yDomain, plot.x, plot.x + plot.w, cfg.yTickCount, cfg.yFormat)
      : []
    return { plot, xTicks, yTicks, y2Ticks: [], xDomainUsed: cfg.xDomain }
  }

  // y grows DOWNWARD in screen space, so the domain min maps to the plot's
  // bottom edge and the max to its top — the range is deliberately inverted.
  const yTicks = cfg.showYAxis
    ? makeTicks(cfg.yDomain, plot.y + plot.h, plot.y, cfg.yTickCount, cfg.yFormat)
    : []

  const xTicks = cfg.showXAxis
    ? cfg.categories.length > 0
      ? bandTicks(cfg.categories, plot)
      : cfg.xTime === true
        ? timeTicks(cfg.xDomain, plot.x, plot.x + plot.w, cfg.xTickCount, cfg.xFormat)
        : makeTicks(cfg.xDomain, plot.x, plot.x + plot.w, cfg.xTickCount, cfg.xFormat)
    : []

  const y2Ticks = hasY2
    ? makeTicks(y2dom, plot.y + plot.h, plot.y, cfg.yTickCount, cfg.y2Format)
    : []

  return { plot, xTicks, yTicks, y2Ticks, xDomainUsed: cfg.xDomain }
}

/** One tick per category, centred on its band. */
/** Band ticks down the Y axis — the horizontal frame's category labels. */
export function bandTicksY(categories: string[], plot: Rect): Tick[] {
  const n = categories.length
  const out: Tick[] = []
  if (n === 0) return out
  const bh = plot.h / n
  for (let i = 0; i < n; i++) {
    out.push({
      value: i,
      pos: plot.y + bh * (i + 0.5),
      label: categories[i]!,
    })
  }
  return out
}

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

/**
 * Series points placed by their own x VALUES rather than by index.
 *
 * `layoutSeriesPoints` spaces points evenly, which is right for a categorical
 * axis and WRONG for a time series: readings on Jan 1, Jan 2 and Mar 1 drawn at
 * even spacing say the gap between the first two equals the gap to the third.
 * That is not a styling difference, it is the chart stating something false
 * about the data — the reason a time axis is a correctness feature and not a
 * cosmetic one.
 *
 * `xs` and `values` are index-aligned; a mismatch takes the shorter of the two
 * rather than reading past the end, because a caller whose accessors disagree
 * should get a short chart, not a crash or a NaN coordinate.
 */
export function layoutSeriesPointsAt(
  values: Double[],
  xs: Double[],
  plot: Rect,
  yDomain: Domain,
  xDomain: Domain,
): Pt[] {
  const n = Math.min(values.length, xs.length)
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      x: scaleLinear(xDomain, plot.x, plot.x + plot.w, xs[i]!),
      y: scaleLinear(yDomain, plot.y + plot.h, plot.y, values[i]!),
    })
  }
  return out
}

/**
 * Horizontal bars — one per datum, measured RIGHTWARD from the zero line.
 * The mirror of `layoutBars` with the axes swapped: bands run down the plot,
 * values run along it, and a negative value extends left of the zero line.
 */
export function layoutBarsH(
  values: Double[],
  plot: Rect,
  vDomain: Domain,
  gapRatio: Double,
): Rect[] {
  const n = values.length
  const out: Rect[] = []
  if (n === 0) return out
  const ratio = gapRatio < 0.0 ? 0.0 : gapRatio > 0.9 ? 0.9 : gapRatio
  const band = plot.h / n
  const bh = band * (1.0 - ratio)
  const zero = vDomain.min < 0.0 && vDomain.max > 0.0 ? 0.0 : vDomain.min
  const zeroX = scaleLinear(vDomain, plot.x, plot.x + plot.w, zero)
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    const vx = scaleLinear(vDomain, plot.x, plot.x + plot.w, v)
    const left = vx < zeroX ? vx : zeroX
    out.push({
      x: left,
      y: plot.y + band * i + (band - bh) / 2.0,
      w: Math.abs(vx - zeroX),
      h: bh,
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
