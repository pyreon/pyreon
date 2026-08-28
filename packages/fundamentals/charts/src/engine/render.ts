// Marks → draw commands. The whole chart, as plain data.

import { computeLayout, layoutBars, layoutSeriesPoints } from './layout'
import type { LayoutConfig, PlotLayout } from './layout'
import { extent, niceDomain } from './scale'
import type { DrawCmd, Domain, MeasureText, Pt, Rect, Double } from './types'

/** One drawable series. */
export interface Series {
  kind: 'bars' | 'line' | 'area' | 'points'
  values: Double[]
  color: string
  /** Stroke width for line/area outlines; ignored by bars and points. */
  width: Double
  /** Point radius; ignored by everything else. */
  radius: Double
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
  yDomain?: Domain
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
  const all: Double[] = []
  let hasBars = false
  for (const s of spec.series) {
    if (s.kind === 'bars' || s.kind === 'area') hasBars = true
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
    xDomain: { min: 0.0, max: n > 1 ? n - 1 : 1.0 },
    yDomain: resolveYDomain(spec),
    categories: spec.categories,
    fontSize: spec.theme.fontSize,
    xTickCount: 5.0,
    yTickCount: 5.0,
    showXAxis: spec.showXAxis,
    showYAxis: spec.showYAxis,
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

  if (spec.showGrid) {
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

  for (const s of spec.series) {
    if (s.kind === 'bars') {
      for (const r of layoutBars(s.values, plot, yDomain, 0.25)) {
        out.push({ kind: 'rect', rect: r, fill: s.color })
      }
    } else if (s.kind === 'line') {
      const pts = layoutSeriesPoints(s.values, plot, yDomain)
      if (pts.length > 1) {
        out.push({ kind: 'polyline', points: pts, stroke: s.color, width: s.width })
      }
    } else if (s.kind === 'area') {
      const pts = layoutSeriesPoints(s.values, plot, yDomain)
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
      for (const p of layoutSeriesPoints(s.values, plot, yDomain)) {
        out.push({ kind: 'circle', center: p, radius: s.radius, fill: s.color })
      }
    }
  }

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
