// The heatmap's whole frame — category resolution, the plot rect sized from
// the row labels, the cells and both label rails — as pure geometry, so the
// web host and the native canvas paint the SAME command list.

import { buildHeatGrid, hitHeatCell, renderHeat } from './heat'
import type { HeatGrid } from './heat'
import type { ChartTheme } from './render'
import type { Double, DrawCmd, MeasureText, Rect } from './types'

/**
 * A grid from parallel per-datum arrays: the x category, the y category and
 * the value. Categories keep FIRST-SEEN order — the order the data means:
 * weekday names, funnel stages and cohort labels all carry an order that
 * alphabetical sorting would destroy. A NaN value counts as 0.
 */
export function heatGridFrom(xs: string[], ys: string[], values: Double[]): HeatGrid {
  const cols: string[] = []
  const rows: string[] = []
  const colOf: Double[] = []
  const rowOf: Double[] = []
  const vals: Double[] = []
  const n = xs.length
  for (let i = 0; i < n; i++) {
    const x = xs[i]!
    let ci = -1.0
    let cf = 0.0
    for (let j = 0; j < cols.length; j++) {
      if (cols[j] === x) ci = cf
      cf += 1.0
    }
    if (ci < 0.0) {
      ci = cf
      cols.push(x)
    }
    colOf.push(ci)
    const y = i < ys.length ? ys[i]! : ''
    let ri = -1.0
    let rf = 0.0
    for (let j = 0; j < rows.length; j++) {
      if (rows[j] === y) ri = rf
      rf += 1.0
    }
    if (ri < 0.0) {
      ri = rf
      rows.push(y)
    }
    rowOf.push(ri)
    const v = i < values.length ? values[i]! : 0.0
    vals.push(v === v ? v : 0.0)
  }
  return buildHeatGrid(cols, rows, colOf, rowOf, vals)
}

/**
 * The grid's plot rect for a given size — gutters sized from the actual
 * labels (rows on the left, columns along the bottom). Shared by the draw and
 * the hit test, so a hit can never disagree with the paint.
 */
export function heatPlotFor(grid: HeatGrid, w: Double, h: Double, fontSize: Double, measure: MeasureText): Rect {
  let widest = 0.0
  for (const r of grid.rows) {
    const lw = measure(r, fontSize)
    if (lw > widest) widest = lw
  }
  const left = widest + 8.0
  const bottom = fontSize + 8.0
  return { x: left, y: 4.0, w: Math.max(0.0, w - left - 4.0), h: Math.max(0.0, h - 4.0 - bottom) }
}

/** The cells, then the row labels down the left and the column labels along the bottom. */
export function renderHeatChart(
  grid: HeatGrid,
  w: Double,
  h: Double,
  theme: ChartTheme,
  stops: string[],
  gap: Double,
  measure: MeasureText,
): DrawCmd[] {
  const plot = heatPlotFor(grid, w, h, theme.fontSize, measure)
  // A fresh array: on Kotlin an array RETURNED by a function is an immutable
  // List, so the labels below could not be pushed onto the cells' own list.
  const cmds: DrawCmd[] = []
  const cells = renderHeat({ grid, plot, stops, gap, progress: 1.0 })
  for (const c of cells) cmds.push(c)
  let nrF = 0.0
  for (let i = 0; i < grid.rows.length; i++) nrF += 1.0
  let ncF = 0.0
  for (let i = 0; i < grid.cols.length; i++) ncF += 1.0
  const rowStep = plot.h / Math.max(1.0, nrF)
  const colStep = plot.w / Math.max(1.0, ncF)
  let rf = 0.0
  for (const r of grid.rows) {
    cmds.push({
      kind: 'text',
      text: r,
      at: { x: plot.x - 4.0, y: plot.y + rowStep * (rf + 0.5) },
      fill: theme.label,
      size: theme.fontSize,
      align: 'end',
      baseline: 'middle',
    })
    rf += 1.0
  }
  let cf = 0.0
  for (const c of grid.cols) {
    cmds.push({
      kind: 'text',
      text: c,
      at: { x: plot.x + colStep * (cf + 0.5), y: plot.y + plot.h + 4.0 },
      fill: theme.label,
      size: theme.fontSize,
      align: 'middle',
      baseline: 'top',
    })
    cf += 1.0
  }
  return cmds
}

/** The index into `grid.cells` under (px, py) for the same frame the chart painted, or -1. */
export function hitHeatChart(
  grid: HeatGrid,
  w: Double,
  h: Double,
  fontSize: Double,
  gap: Double,
  measure: MeasureText,
  px: Double,
  py: Double,
): number {
  return hitHeatCell(grid, heatPlotFor(grid, w, h, fontSize, measure), gap, px, py)
}
