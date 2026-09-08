// The boxplot chart's whole frame — value domain, cartesian layout, grid, tick
// labels and the boxes — as pure geometry, so the web host, the server SVG and
// the native canvases paint the SAME command list from the same inputs (the
// candlestick-chart shape). Written in the native subset.

import { boxplotExtent, hitBox, renderBoxplot } from './boxplot'
import type { BoxplotOptions, FiveNumber } from './boxplot'
import type { Formatter } from './format'
import { computeLayout } from './layout'
import type { LayoutConfig, PlotLayout } from './layout'
import type { ChartTheme } from './render'
import { niceDomain } from './scale'
import type { Domain, Double, DrawCmd, MeasureText } from './types'

export interface BoxplotFrame {
  domain: Domain
  layout: PlotLayout
}

/**
 * Domain + layout for a given size — shared by the draw and the hit test, so
 * a tap resolves against exactly the bands the canvas painted. `categories`
 * empty = a numeric x axis (the boxes are still one band each).
 */
export function boxplotFrame(rows: FiveNumber[], width: Double, height: Double, categories: string[], fontSize: Double, measure: MeasureText, format?: Formatter): BoxplotFrame {
  const domain = niceDomain(boxplotExtent(rows), 5.0)
  const cfg: LayoutConfig = {
    width,
    height,
    xDomain: { min: 0.0, max: rows.length > 1 ? rows.length - 1 : 1.0 },
    yDomain: domain,
    categories,
    fontSize,
    xTickCount: 5.0,
    yTickCount: 5.0,
    showXAxis: true,
    showYAxis: true,
    yFormat: format,
  }
  return { domain, layout: computeLayout(cfg, measure) }
}

/**
 * The whole chart: value grid + tick labels, category labels, then the boxes
 * over them. `progress` is the entrance (0..1; boxes grow from their median)
 * — an explicit parameter, as `renderHeatChart` takes it, so a native host
 * tweens one number instead of copying the options.
 */
export function renderBoxplotChart(rows: FiveNumber[], width: Double, height: Double, categories: string[], theme: ChartTheme, options: BoxplotOptions, measure: MeasureText, format?: Formatter, progress?: Double): DrawCmd[] {
  const f = boxplotFrame(rows, width, height, categories, theme.fontSize, measure, format)
  const l = f.layout
  const out: DrawCmd[] = []
  for (const tick of l.yTicks) {
    out.push({ kind: 'line', from: { x: l.plot.x, y: tick.pos }, to: { x: l.plot.x + l.plot.w, y: tick.pos }, stroke: theme.grid, width: 1.0 })
    out.push({ kind: 'text', text: tick.label, at: { x: l.plot.x - 6.0, y: tick.pos }, fill: theme.label, size: theme.fontSize, align: 'end', baseline: 'middle' })
  }
  for (const tick of l.xTicks) {
    out.push({ kind: 'text', text: tick.label, at: { x: tick.pos, y: l.plot.y + l.plot.h + 6.0 }, fill: theme.label, size: theme.fontSize, align: 'middle', baseline: 'top' })
  }
  const p = progress ?? options.progress
  const opts: BoxplotOptions = { fill: options.fill, stroke: options.stroke, widthRatio: options.widthRatio, outlierRadius: options.outlierRadius, progress: p }
  for (const c of renderBoxplot(rows, l.plot, f.domain, opts)) out.push(c)
  return out
}

/** The box index under a point, against the frame the chart painted — or -1. */
export function hitBoxplotChart(count: number, width: Double, height: Double, categories: string[], fontSize: Double, measure: MeasureText, px: Double, py: Double, rows: FiveNumber[]): number {
  const f = boxplotFrame(rows, width, height, categories, fontSize, measure)
  return hitBox(count, f.layout.plot, px, py)
}
