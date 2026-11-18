// Stacked and grouped bars, and scatter with a real x channel.
//
// Every mark so far spaces its data evenly across the plot, which is right for
// a category axis and wrong for a scatter plot — there, x is a measured value
// like y, and pretending otherwise silently redraws the data.

import { clampBarWidth, isFiniteNumber, scaleLinear } from './scale'
import type { Domain, Double, Pt, Rect } from './types'

/** One band's worth of stacked segments, bottom to top. */
export interface StackSegment {
  rect: Rect
  seriesIndex: number
  datumIndex: number
  value: Double
}

/**
 * Where every stacked datum starts and ends: `bases[s][i]` to `tops[s][i]`.
 * A gap is NaN in `tops`; a base is NaN when nothing below it qualified (the
 * segment then starts at the axis zero).
 */
export interface StackLevels {
  bases: Double[][]
  tops: Double[][]
}

/**
 * The stack levels, per band, in input order: a positive value stacks on the
 * nearest earlier positive total and a negative one on the nearest negative
 * total — a diverging stack, positives up and negatives down from zero.
 */
export function stackLevels(seriesValues: Double[][]): StackLevels {
  const k = seriesValues.length
  let n = 0
  for (const sv of seriesValues) if (sv.length > n) n = sv.length
  // Flat, row-major (`s * n + i`): the native targets will not assign into a
  // nested list, so the levels are written here and split into rows at the end.
  const flatBase: Double[] = []
  const flatTop: Double[] = []
  for (let c = 0; c < k * n; c++) {
    flatBase.push(0.0 / 0.0)
    flatTop.push(0.0 / 0.0)
  }
  for (let s = 0; s < k; s++) {
    const own = seriesValues[s]!
    for (let i = 0; i < n; i++) {
      const v = i < own.length ? own[i]! : 0.0 / 0.0
      if (!isFiniteNumber(v)) continue
      let sum = v
      let base = 0.0 / 0.0
      for (let q = s - 1; q >= 0; q--) {
        const val = flatTop[q * n + i]!
        if ((sum >= 0.0 && val > 0.0) || (sum <= 0.0 && val < 0.0)) {
          sum = sum + val
          base = val
          break
        }
      }
      flatTop[s * n + i] = sum
      flatBase[s * n + i] = base
    }
  }
  const bases: Double[][] = []
  const tops: Double[][] = []
  for (let s = 0; s < k; s++) {
    const bRow: Double[] = []
    const tRow: Double[] = []
    for (let i = 0; i < n; i++) {
      bRow.push(flatBase[s * n + i]!)
      tRow.push(flatTop[s * n + i]!)
    }
    bases.push(bRow)
    tops.push(tRow)
  }
  return { bases, tops }
}

/** The value domain a set of stack levels spans, zero included; `{0, 1}` when it is empty. */
export function stackLevelsExtent(levels: StackLevels): Domain {
  let lo = 0.0
  let hi = 0.0
  for (const row of levels.tops) {
    for (const v of row) {
      if (!isFiniteNumber(v)) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  if (lo === 0.0 && hi === 0.0) return { min: 0.0, max: 1.0 }
  return { min: lo, max: hi }
}

/** Segments for stack levels, upright: band `i`, series `s`, from its base to its top. */
// oxlint-disable-next-line max-params -- positional signature kept for its many call sites; barWidth / barGap are optional trailing bar geometry
export function layoutStackLevels(levels: StackLevels, values: Double[][], plot: Rect, yDomain: Domain, gapRatio: Double, barWidth?: Double): StackSegment[] {
  const out: StackSegment[] = []
  let n = 0
  for (const row of levels.tops) if (row.length > n) n = row.length
  if (n === 0) return out
  const ratio = gapRatio < 0.0 ? 0.0 : gapRatio > 0.9 ? 0.9 : gapRatio
  const band = plot.w / countOf(n)
  const bw = clampBarWidth(band * (1.0 - ratio), barWidth)
  let fi = 0.0
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < levels.tops.length; s++) {
      const top = levels.tops[s]![i]!
      if (!isFiniteNumber(top)) continue
      const b = levels.bases[s]![i]!
      const base = isFiniteNumber(b) ? b : 0.0
      const yTop = scaleLinear(yDomain, plot.y + plot.h, plot.y, top)
      const yBot = scaleLinear(yDomain, plot.y + plot.h, plot.y, base)
      const own = values[s]!
      out.push({
        rect: { x: plot.x + band * fi + (band - bw) / 2.0, y: yTop < yBot ? yTop : yBot, w: bw, h: Math.abs(yBot - yTop) },
        seriesIndex: s,
        datumIndex: i,
        value: i < own.length ? own[i]! : 0.0,
      })
    }
    fi = fi + 1.0
  }
  return out
}

/** `layoutStackLevels` on the flipped frame: bands run DOWN the y axis and each stack grows along x. */
// oxlint-disable-next-line max-params -- positional signature kept for its many call sites; barWidth / barGap are optional trailing bar geometry
export function layoutStackLevelsH(levels: StackLevels, values: Double[][], plot: Rect, vDomain: Domain, gapRatio: Double, barWidth?: Double): StackSegment[] {
  const out: StackSegment[] = []
  let n = 0
  for (const row of levels.tops) if (row.length > n) n = row.length
  if (n === 0) return out
  const ratio = gapRatio < 0.0 ? 0.0 : gapRatio > 0.9 ? 0.9 : gapRatio
  const band = plot.h / countOf(n)
  const bh = clampBarWidth(band * (1.0 - ratio), barWidth)
  let fi = 0.0
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < levels.tops.length; s++) {
      const top = levels.tops[s]![i]!
      if (!isFiniteNumber(top)) continue
      const b = levels.bases[s]![i]!
      const base = isFiniteNumber(b) ? b : 0.0
      const xEnd = scaleLinear(vDomain, plot.x, plot.x + plot.w, top)
      const xStart = scaleLinear(vDomain, plot.x, plot.x + plot.w, base)
      const own = values[s]!
      out.push({
        rect: { x: xStart < xEnd ? xStart : xEnd, y: plot.y + band * fi + (band - bh) / 2.0, w: Math.abs(xEnd - xStart), h: bh },
        seriesIndex: s,
        datumIndex: i,
        value: i < own.length ? own[i]! : 0.0,
      })
    }
    fi = fi + 1.0
  }
  return out
}

/** How wide one bar, a whole group, and one bar-to-bar step are, in px. */
export interface GroupSlot {
  bar: Double
  group: Double
  pitch: Double
}

/**
 * The geometry of a `k`-bar group inside a band: each bar's thickness, the
 * group's total thickness and the step from one bar to the next. With neither
 * `barWidth` nor `barGap` set it is the original arithmetic (bars abut and fill
 * the band's slot), so a chart that sets neither lays out exactly as before.
 */
export function groupSlot(slot: Double, k: number, barWidth?: Double, barGap?: Double): GroupSlot {
  const gap = (barGap ?? 0.0) > 0.0 ? barGap ?? 0.0 : 0.0
  const kF = countOf(k)
  const bar = clampBarWidth(gap > 0.0 ? slot / (kF + (kF - 1.0) * gap) : slot / k, barWidth)
  const custom = gap > 0.0 || (barWidth ?? 0.0) > 0.0

  return { bar, group: custom ? bar * kF + bar * gap * (kF - 1.0) : slot, pitch: bar * (1.0 + gap) }
}

/** A count as a Double, for pixel arithmetic (the native targets will not mix Int into Double math). */
function countOf(n: number): Double {
  let f = 0.0
  for (let i = 0; i < n; i++) f = f + 1.0
  return f
}

/**
 * Stack series on top of each other within each band, as ECharts stacks by
 * default (`stackStrategy: 'samesign'`): positive values up from zero,
 * negative ones down from it, so a mixed-sign stack is a diverging bar whose
 * two ends are the positive and negative totals. A gap draws nothing.
 * `stackLevels` exposes the other strategies and stack groups.
 */
export function layoutStackedBars(
  seriesValues: Double[][],
  plot: Rect,
  yDomain: Domain,
  gapRatio: Double,
  barWidth?: Double,
): StackSegment[] {
  return layoutStackLevels(stackLevels(seriesValues), seriesValues, plot, yDomain, gapRatio, barWidth)
}

/** `layoutStackedBars` on the flipped frame: bands run DOWN the y axis and the stack grows along x. */
export function layoutStackedBarsH(
  seriesValues: Double[][],
  plot: Rect,
  vDomain: Domain,
  gapRatio: Double,
  barWidth?: Double,
): StackSegment[] {
  return layoutStackLevelsH(stackLevels(seriesValues), seriesValues, plot, vDomain, gapRatio, barWidth)
}

/** `layoutGroupedBars` on the flipped frame: one bar per series, stacked DOWN each band. */
// oxlint-disable-next-line max-params -- positional signature kept for its many call sites; barWidth / barGap are optional trailing bar geometry
export function layoutGroupedBarsH(
  seriesValues: Double[][],
  plot: Rect,
  vDomain: Domain,
  gapRatio: Double,
  barWidth?: Double,
  barGap?: Double,
): StackSegment[] {
  const out: StackSegment[] = []
  const k = seriesValues.length
  if (k === 0) return out
  let n = 0
  for (const s of seriesValues) if (s.length > n) n = s.length
  if (n === 0) return out

  const ratio = gapRatio < 0.0 ? 0.0 : gapRatio > 0.9 ? 0.9 : gapRatio
  const band = plot.h / n
  const slotH = groupSlot(band * (1.0 - ratio), k, barWidth, barGap)
  const barH = slotH.bar
  const groupH = slotH.group
  const pitchH = slotH.pitch
  const zero = vDomain.min < 0.0 && vDomain.max > 0.0 ? 0.0 : vDomain.min
  const zeroX = scaleLinear(vDomain, plot.x, plot.x + plot.w, zero)

  for (let i = 0; i < n; i++) {
    const gy = plot.y + band * i + (band - groupH) / 2.0
    for (let s = 0; s < k; s++) {
      const raw = seriesValues[s]![i] ?? 0.0
      // A gap draws a zero-width bar at the zero line — nothing to see, nothing to hit.
      const v = raw === raw ? raw : zero
      const vx = scaleLinear(vDomain, plot.x, plot.x + plot.w, v)
      out.push({
        rect: {
          x: vx < zeroX ? vx : zeroX,
          y: gy + pitchH * s,
          w: Math.abs(vx - zeroX),
          h: barH,
        },
        seriesIndex: s,
        datumIndex: i,
        value: v,
      })
    }
  }
  return out
}

/** True when a stack holds a negative value — it then diverges below zero (see `stackLevels`). */
export function stackHasNegatives(seriesValues: Double[][]): boolean {
  for (const s of seriesValues) for (const v of s) if (v < 0.0) return true
  return false
}

/** The domain a stacked chart needs — the positive and negative TOTALS, not the tallest value. */
export function stackedExtent(seriesValues: Double[][]): Domain {
  return stackLevelsExtent(stackLevels(seriesValues))
}

/** Bars sitting side by side within each band, one per series. */
// oxlint-disable-next-line max-params -- positional signature kept for its many call sites; barWidth / barGap are optional trailing bar geometry
export function layoutGroupedBars(
  seriesValues: Double[][],
  plot: Rect,
  yDomain: Domain,
  gapRatio: Double,
  barWidth?: Double,
  barGap?: Double,
): StackSegment[] {
  const out: StackSegment[] = []
  const k = seriesValues.length
  if (k === 0) return out
  let n = 0
  for (const s of seriesValues) if (s.length > n) n = s.length
  if (n === 0) return out

  const ratio = gapRatio < 0.0 ? 0.0 : gapRatio > 0.9 ? 0.9 : gapRatio
  const band = plot.w / n
  const slotW = groupSlot(band * (1.0 - ratio), k, barWidth, barGap)
  const barW = slotW.bar
  const groupW = slotW.group
  const pitchW = slotW.pitch
  const zero = yDomain.min < 0.0 && yDomain.max > 0.0 ? 0.0 : yDomain.min
  const zeroY = scaleLinear(yDomain, plot.y + plot.h, plot.y, zero)

  for (let i = 0; i < n; i++) {
    const gx = plot.x + band * i + (band - groupW) / 2.0
    for (let s = 0; s < k; s++) {
      const raw = seriesValues[s]![i] ?? 0.0
      // A gap draws a zero-height bar at the zero line — nothing to see, nothing to hit.
      const v = isFiniteNumber(raw) ? raw : zero
      const vy = scaleLinear(yDomain, plot.y + plot.h, plot.y, v)
      out.push({
        rect: {
          x: gx + pitchW * s,
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
      row.push(total > 0.0 ? v / total : isFiniteNumber(v) ? 0.0 : v)
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
  barWidth?: Double,
): WaterfallStep[] {
  const out: WaterfallStep[] = []
  const n = values.length
  if (n === 0) return out
  const ratio = gapRatio < 0.0 ? 0.0 : gapRatio > 0.9 ? 0.9 : gapRatio
  const band = plot.w / n
  const bw = clampBarWidth(band * (1.0 - ratio), barWidth)
  let acc = 0.0
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    if (!isFiniteNumber(v)) continue
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
    if (!isFiniteNumber(v)) continue
    acc = acc + v
    if (acc < lo) lo = acc
    if (acc > hi) hi = acc
  }
  return { min: lo, max: hi === lo ? lo + 1.0 : hi }
}
