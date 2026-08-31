// Marks → draw commands. The whole chart, as plain data.

import { computeLayout, layoutBars, layoutBarsH, layoutSeriesPoints, layoutSeriesPointsAt } from './layout'
import { layoutGroupedBars, layoutStackedBars, stackedExtent } from './stack'
import type { Formatter } from './format'
import type { LayoutConfig, PlotLayout } from './layout'
import { extent, niceDomain, scaleLinear } from './scale'
import { plain } from './format'
import { withAlpha } from './radar'
import type { DrawCmd, Domain, MeasureText, Pt, Rect, Double } from './types'

/** One drawable series. */
export interface Series {
  kind: 'bars' | 'line' | 'area' | 'points' | 'stacked' | 'grouped'
  values: Double[]
  color: string
  /** Stroke width for line/area outlines; ignored by bars and points. */
  width: Double
  /** Point radius; ignored by everything else. */
  radius: Double
  /** Name for the legend, the tooltip and the accessible table. */
  label: string
  /** Densifier applied to line/area points — `smooth`/`step` from ./curve. */
  curve?: ((points: Pt[]) => Pt[]) | undefined
  /** Draw each value above its bar. */
  showValues?: boolean | undefined
  /** Per-datum radii (the bubble channel), already mapped to pixels. */
  radii?: Double[] | undefined
}

/**
 * A reference rule or band — the "target line" every dashboard needs.
 *
 * Exactly one of `y`, `x`, or the `yFrom`/`yTo` pair should be set; an
 * annotation with none is skipped rather than guessed at. Values are in DOMAIN
 * units — for a categorical x axis that is the datum INDEX, matching how the
 * points are placed.
 */
export interface Annotation {
  /** Horizontal rule at this y value. */
  y?: Double | undefined
  /** Vertical rule at this x value. */
  x?: Double | undefined
  /** Horizontal band between these two y values. */
  yFrom?: Double | undefined
  yTo?: Double | undefined
  label?: string | undefined
  color?: string | undefined
}

export interface ChartTheme {
  axis: string
  grid: string
  label: string
  fontSize: Double
}

export interface ChartSpec {
  width: Double
  height: Double
  series: Series[]
  categories: string[]
  theme: ChartTheme
  showXAxis: boolean
  showYAxis: boolean
  showGrid: boolean
  /** Pins the y domain; when absent it is derived from the data. */
  yDomain?: Domain | undefined
  /** Tick label formatting, per axis. See `LayoutConfig` for why it matters. */
  yFormat?: Formatter | undefined
  xFormat?: Formatter | undefined
  /**
   * Per-datum x positions, index-aligned with every series' values.
   *
   * Present for a CONTINUOUS x axis (a time series, a scatter over a numeric
   * x). Absent means the points are spaced evenly by index, which is right for
   * a categorical axis and misstates the data for an irregular one. `xDomain`
   * is derived from these when they are given.
   */
  xValues?: Double[] | undefined
  /** Label the x axis with calendar steps — see `LayoutConfig.xTime`. */
  xTime?: boolean | undefined
  /**
   * Flip the frame: categories on Y, values on X, bars growing rightward.
   *
   * Bar-family series only (bars / stacked / grouped): a horizontal line or
   * scatter is a transposed COORDINATE SYSTEM, not a flipped bar chart, and
   * pretending otherwise would draw something misleading. Non-bar series in
   * a horizontal spec are SKIPPED — asserted, not silent.
   */
  horizontal?: boolean | undefined
  /** Reference rules and bands, drawn between the grid and the series. */
  annotations?: Annotation[] | undefined
  /**
   * Entrance progress, 0..1; absent means 1 (fully drawn).
   *
   * Animation lives in the ENGINE as a parameter, not in the hosts as a
   * effect: `renderChart` at progress 0.4 is a pure function returning the
   * 40%-grown frame — bars part-risen from the zero line, lines revealed
   * left-to-right, points part-sized. That makes every frame testable, keeps
   * the draw list flat, and means the SwiftUI/Compose executors animate the
   * day they exist, with no animation code of their own. The host's whole job
   * is to tween this number.
   */
  progress?: Double | undefined
}

export const defaultTheme: ChartTheme = {
  axis: '#8496a5',
  grid: 'rgba(132,150,165,0.18)',
  label: '#5a6b7a',
  fontSize: 11.0,
}

/**
 * The y domain across every series.
 *
 * Bars are measured from zero, so a bar chart's domain must INCLUDE zero even
 * when all its values sit far above it — otherwise the shortest bar renders as
 * a sliver and the chart lies about proportion. Line and point series get no
 * such treatment: forcing zero into a series of temperatures around 300K would
 * flatten every variation that matters.
 */
export function resolveYDomain(spec: ChartSpec): Domain {
  if (spec.yDomain !== undefined) return spec.yDomain
  // A STACK's domain is its tallest TOTAL, not its tallest value — taking the
  // max of the individual series would clip the stack at the top.
  const stacked = spec.series.filter((s) => s.kind === 'stacked')
  if (stacked.length > 0) {
    const e = stackedExtent(stacked.map((s) => s.values))
    const others: Double[] = []
    for (const s of spec.series) if (s.kind !== 'stacked') for (const v of s.values) others.push(v)
    const max = others.length > 0 ? Math.max(e.max, extent(others).max) : e.max
    return niceDomain({ min: 0.0, max }, 5.0)
  }
  const all: Double[] = []
  let hasBars = false
  for (const s of spec.series) {
    if (s.kind === 'bars' || s.kind === 'area' || s.kind === 'grouped') hasBars = true
    for (const v of s.values) all.push(v)
  }
  const e = extent(all)
  const withZero: Domain = hasBars
    ? { min: e.min > 0.0 ? 0.0 : e.min, max: e.max < 0.0 ? 0.0 : e.max }
    : e
  return niceDomain(withZero, 5.0)
}

/** Longest series length — the x extent for a numeric axis. */
export function seriesMaxLength(series: Series[]): number {
  let n = 0
  for (const s of series) if (s.values.length > n) n = s.values.length
  return n
}

/** Lay the chart out without drawing it — exposed for hit-testing. */
export function layoutChart(spec: ChartSpec, measure: MeasureText): PlotLayout {
  const n = seriesMaxLength(spec.series)
  const cfg: LayoutConfig = {
    width: spec.width,
    height: spec.height,
    xDomain:
      spec.xValues !== undefined && spec.xValues.length > 0
        ? extent(spec.xValues)
        : { min: 0.0, max: n > 1 ? n - 1 : 1.0 },
    yDomain: resolveYDomain(spec),
    categories: spec.categories,
    fontSize: spec.theme.fontSize,
    xTickCount: 5.0,
    yTickCount: 5.0,
    showXAxis: spec.showXAxis,
    showYAxis: spec.showYAxis,
    // Assigned rather than conditionally SPREAD. `...(cond ? { k } : {})` is
    // the idiomatic TS for an exactOptionalPropertyTypes field, and it emits an
    // EMPTY object literal — which PMTC has no lowering for, so the idiom costs
    // this module its native-readiness for nothing. The engine exists to
    // compile, so it is written in the subset that does.
    yFormat: spec.yFormat,
    xFormat: spec.xFormat,
    xTime: spec.xTime === true,
    horizontal: spec.horizontal === true,
  }
  return computeLayout(cfg, measure)
}

/**
 * Build the full command list.
 *
 * Order is painter's order and deliberate: grid, then axes, then series, then
 * labels. Series draw over the grid so a bar is never bisected by a gridline,
 * and labels draw last so nothing can cover them.
 */
export function renderChart(spec: ChartSpec, measure: MeasureText): DrawCmd[] {
  const yDomain = resolveYDomain(spec)
  const l = layoutChart(spec, measure)
  const plot = l.plot
  const t = spec.theme
  const out: DrawCmd[] = []
  const raw = spec.progress
  const progress = raw === undefined ? 1.0 : raw < 0.0 ? 0.0 : raw > 1.0 ? 1.0 : raw

  // Grows a bar rect toward its value from the zero line — the edge a bar is
  // measured from, so a negative bar grows DOWNWARD during the entrance
  // instead of sliding in from above.
  const growRect = (r: Rect): Rect => {
    if (progress >= 1.0) return r
    const zeroY = scaleLinear(yDomain, plot.y + plot.h, plot.y, yDomain.min < 0.0 && yDomain.max > 0.0 ? 0.0 : yDomain.min)
    const h = r.h * progress
    const top = r.y + r.h <= zeroY + 0.5 ? zeroY - h : zeroY
    return { x: r.x, y: top, w: r.w, h }
  }

  // The horizontal twin: grows a bar toward its value from the zero line,
  // which in this frame is a VERTICAL line — a negative bar grows leftward.
  const growRectH = (r: Rect): Rect => {
    if (progress >= 1.0) return r
    const zeroX = scaleLinear(yDomain, plot.x, plot.x + plot.w, yDomain.min < 0.0 && yDomain.max > 0.0 ? 0.0 : yDomain.min)
    const w = r.w * progress
    const left = r.x >= zeroX - 0.5 ? zeroX : zeroX - w
    return { x: left, y: r.y, w, h: r.h }
  }

  // Reveals a polyline left to right: whole points up to the cut, plus an
  // interpolated point partway along the segment the cut lands in, so the tip
  // advances smoothly instead of popping a segment at a time.
  const reveal = (pts: Pt[]): Pt[] => {
    if (progress >= 1.0 || pts.length < 2) return pts
    const span = pts.length - 1
    const cut = span * progress
    const whole = Math.floor(cut)
    const outPts: Pt[] = []
    for (let i = 0; i <= whole; i++) outPts.push(pts[i]!)
    const frac = cut - whole
    if (frac > 0.0 && whole + 1 < pts.length) {
      const a = pts[whole]!
      const b = pts[whole + 1]!
      outPts.push({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac })
    }
    return outPts
  }

  if (spec.showGrid) {
    if (spec.horizontal === true) {
      // The grid follows the VALUE axis — vertical lines in this frame.
      for (const tick of l.xTicks) {
        out.push({
          kind: 'line',
          from: { x: tick.pos, y: plot.y },
          to: { x: tick.pos, y: plot.y + plot.h },
          stroke: t.grid,
          width: 1.0,
        })
      }
    } else {
      for (const tick of l.yTicks) {
        out.push({
          kind: 'line',
          from: { x: plot.x, y: tick.pos },
          to: { x: plot.x + plot.w, y: tick.pos },
          stroke: t.grid,
          width: 1.0,
        })
      }
    }
  }

  if (spec.showYAxis) {
    out.push({
      kind: 'line',
      from: { x: plot.x, y: plot.y },
      to: { x: plot.x, y: plot.y + plot.h },
      stroke: t.axis,
      width: 1.0,
    })
  }
  if (spec.showXAxis) {
    out.push({
      kind: 'line',
      from: { x: plot.x, y: plot.y + plot.h },
      to: { x: plot.x + plot.w, y: plot.y + plot.h },
      stroke: t.axis,
      width: 1.0,
    })
  }

  // Reference bands and rules sit BETWEEN the grid and the series: a band is
  // context the data draws over, and a rule must not be buried under a filled
  // area — dashing is what keeps it legible crossing the data. Bands first,
  // rules second, so a rule bounding its own band stays visible.
  const notes = spec.annotations ?? []
  for (const a of notes) {
    if (a.yFrom !== undefined && a.yTo !== undefined) {
      const y1 = scaleLinear(yDomain, plot.y + plot.h, plot.y, a.yFrom)
      const y2 = scaleLinear(yDomain, plot.y + plot.h, plot.y, a.yTo)
      const top = y1 < y2 ? y1 : y2
      out.push({
        kind: 'rect',
        rect: { x: plot.x, y: top, w: plot.w, h: Math.abs(y2 - y1) },
        fill: withAlpha(a.color ?? t.axis, 0.12),
      })
    }
  }
  for (const a of notes) {
    if (a.y !== undefined) {
      const yPos = scaleLinear(yDomain, plot.y + plot.h, plot.y, a.y)
      out.push({
        kind: 'line',
        from: { x: plot.x, y: yPos },
        to: { x: plot.x + plot.w, y: yPos },
        stroke: a.color ?? t.axis,
        width: 1.0,
        dash: [4.0, 4.0],
      })
      if (a.label !== undefined) {
        out.push({
          kind: 'text',
          text: a.label,
          at: { x: plot.x + plot.w, y: yPos - 4.0 },
          fill: a.color ?? t.label,
          size: t.fontSize,
          align: 'end',
          baseline: 'bottom',
        })
      }
    }
    if (a.x !== undefined) {
      const xPos = scaleLinear(l.xDomainUsed, plot.x, plot.x + plot.w, a.x)
      out.push({
        kind: 'line',
        from: { x: xPos, y: plot.y },
        to: { x: xPos, y: plot.y + plot.h },
        stroke: a.color ?? t.axis,
        width: 1.0,
        dash: [4.0, 4.0],
      })
      if (a.label !== undefined) {
        out.push({
          kind: 'text',
          text: a.label,
          at: { x: xPos + 4.0, y: plot.y },
          fill: a.color ?? t.label,
          size: t.fontSize,
          align: 'start',
          baseline: 'top',
        })
      }
    }
  }

  // Stacked and grouped series are laid out TOGETHER — each needs to know the
  // others to place its bars — so they are drawn as a set before the
  // independent marks rather than one at a time in the loop below.
  const stackedSeries = spec.horizontal === true ? [] : spec.series.filter((s) => s.kind === 'stacked')
  if (stackedSeries.length > 0) {
    for (const seg of layoutStackedBars(stackedSeries.map((s) => s.values), plot, yDomain, 0.25)) {
      out.push({ kind: 'rect', rect: growRect(seg.rect), fill: stackedSeries[seg.seriesIndex]!.color })
    }
  }
  const groupedSeries = spec.horizontal === true ? [] : spec.series.filter((s) => s.kind === 'grouped')
  if (groupedSeries.length > 0) {
    for (const seg of layoutGroupedBars(groupedSeries.map((s) => s.values), plot, yDomain, 0.25)) {
      out.push({ kind: 'rect', rect: growRect(seg.rect), fill: groupedSeries[seg.seriesIndex]!.color })
    }
  }

  for (const s of spec.series) {
    if (s.kind === 'stacked' || s.kind === 'grouped') continue
    // One helper rather than three call-site conditionals: line, area and
    // points must agree about placement, or an area fill drifts away from the
    // line it is meant to sit under.
    const place = (values: Double[]): Pt[] =>
      spec.xValues !== undefined && spec.xValues.length > 0
        ? layoutSeriesPointsAt(values, spec.xValues, plot, yDomain, l.xDomainUsed)
        : layoutSeriesPoints(values, plot, yDomain)

    // The curve shapes line AND area from the same densified points — an
    // area whose fill followed straight segments under a smoothed outline
    // would show slivers of background between the two.
    const shape = (pts: Pt[]): Pt[] => (s.curve !== undefined ? s.curve(pts) : pts)

    if (spec.horizontal === true) {
      if (s.kind !== 'bars') continue
      const rects = layoutBarsH(s.values, plot, yDomain, 0.25)
      for (const r of rects) {
        out.push({ kind: 'rect', rect: growRectH(r), fill: s.color })
      }
      if (s.showValues === true && progress >= 1.0) {
        const fmt = spec.yFormat ?? plain
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]!
          const v = s.values[i]!
          // The label sits just past the bar's far end — right of a positive
          // bar, left of a negative one.
          out.push({
            kind: 'text',
            text: fmt(v),
            at: {
              x: v < 0.0 ? r.x - 4.0 : r.x + r.w + 4.0,
              y: r.y + r.h / 2.0,
            },
            fill: t.label,
            size: t.fontSize,
            align: v < 0.0 ? 'end' : 'start',
            baseline: 'middle',
          })
        }
      }
      continue
    }

    if (s.kind === 'bars') {
      const rects = layoutBars(s.values, plot, yDomain, 0.25)
      for (const r of rects) {
        out.push({ kind: 'rect', rect: growRect(r), fill: s.color })
      }
      if (s.showValues === true && progress >= 1.0) {
        const fmt = spec.yFormat ?? plain
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]!
          const v = s.values[i]!
          // A negative bar hangs below the zero line, so its label goes under
          // its bottom edge — above the top would sit ON the zero line.
          out.push({
            kind: 'text',
            text: fmt(v),
            at: { x: r.x + r.w / 2.0, y: v < 0.0 ? r.y + r.h + 4.0 : r.y - 4.0 },
            fill: t.label,
            size: t.fontSize,
            align: 'middle',
            baseline: v < 0.0 ? 'top' : 'bottom',
          })
        }
      }
    } else if (s.kind === 'line') {
      const pts = reveal(shape(place(s.values)))
      if (pts.length > 1) {
        out.push({ kind: 'polyline', points: pts, stroke: s.color, width: s.width })
      }
    } else if (s.kind === 'area') {
      const pts = reveal(shape(place(s.values)))
      if (pts.length > 1) {
        const poly: Pt[] = []
        for (const p of pts) poly.push(p)
        // Close down to the baseline so the fill is a band under the line
        // rather than a polygon between the first and last data points.
        poly.push({ x: pts[pts.length - 1]!.x, y: plot.y + plot.h })
        poly.push({ x: pts[0]!.x, y: plot.y + plot.h })
        out.push({ kind: 'polygon', points: poly, fill: s.color })
      }
    } else {
      const pts = place(s.values)
      for (let i = 0; i < pts.length; i++) {
        const fullR = s.radii !== undefined ? s.radii[i] ?? s.radius : s.radius
        out.push({
          kind: 'circle',
          center: pts[i]!,
          radius: fullR * progress,
          fill: s.color,
        })
      }
    }
  }

  // The anchors hold in BOTH frames: y-side labels sit left of the plot,
  // x-side labels below it — only what the ticks CONTAIN differs (categories
  // vs values in the horizontal frame).
  for (const tick of l.yTicks) {
    out.push({
      kind: 'text',
      text: tick.label,
      at: { x: plot.x - 6.0, y: tick.pos },
      fill: t.label,
      size: t.fontSize,
      align: 'end',
      baseline: 'middle',
    })
  }
  for (const tick of l.xTicks) {
    out.push({
      kind: 'text',
      text: tick.label,
      at: { x: tick.pos, y: plot.y + plot.h + 6.0 },
      fill: t.label,
      size: t.fontSize,
      align: 'middle',
      baseline: 'top',
    })
  }

  return out
}

/** Bar rects for a series index — what a hit test runs against. */
export function barsFor(spec: ChartSpec, index: number, measure: MeasureText): Rect[] {
  const s = spec.series[index]
  if (s === undefined || s.kind !== 'bars') return []
  return layoutBars(s.values, layoutChart(spec, measure).plot, resolveYDomain(spec), 0.25)
}
