// Heatmap geometry — two categorical axes, a value per cell, color as the
// third channel.
//
// Pure like everything else in the engine: aggregation, the color ramp and
// the cell layout are plain functions over plain data, and the output is the
// same flat DrawCmd list every backend already executes. Written in the
// native subset and BUNDLED into the generated Swift/Kotlin engine — which is
// why the ramp is a plain function over its stops (`rampColor`) rather than a
// closure factory; the closure form (`colorRamp`) lives in heat-ramp.ts for
// the web callers that want one.

import type { Double, DrawCmd, Rect } from './types'

/** The default ramp — a perceptually reasonable cool-to-warm. */
export const HEAT_RAMP = ['#eff6ff', '#93c5fd', '#3b82f6', '#1e40af']

/** One aggregated cell — grid coordinates plus its value. */
export interface HeatCell {
  col: Double
  row: Double
  value: Double
}

export interface HeatGrid {
  cols: string[]
  rows: string[]
  cells: HeatCell[]
  min: Double
  max: Double
}

/**
 * Aggregate rows into a grid.
 *
 * Category order is FIRST-SEEN, which is the order the data means: weekday
 * names, funnel stages and cohort labels all carry an order alphabetical
 * sorting would destroy. Duplicate (col, row) pairs SUM — the common shape is
 * event data with several observations per cell, and summing is the
 * aggregation the others (count, mean) build on trivially in user code.
 */
export function buildHeatGrid(cols: string[], rows: string[], colOf: Double[], rowOf: Double[], values: Double[]): HeatGrid {
  const n1 = colOf.length < rowOf.length ? colOf.length : rowOf.length
  const n = n1 < values.length ? n1 : values.length
  const cellCol: Double[] = []
  const cellRow: Double[] = []
  const cellVal: Double[] = []
  for (let i = 0; i < n; i++) {
    const c = colOf[i]!
    const r = rowOf[i]!
    if (c < 0.0 || r < 0.0) continue
    let found = -1
    for (let k = 0; k < cellCol.length; k++) if (found < 0 && cellCol[k]! === c && cellRow[k]! === r) found = k
    if (found < 0) {
      cellCol.push(c)
      cellRow.push(r)
      cellVal.push(values[i]!)
    } else {
      cellVal[found] = cellVal[found]! + values[i]!
    }
  }
  const cells: HeatCell[] = []
  let minV = 0.0
  let maxV = 0.0
  for (let k = 0; k < cellCol.length; k++) {
    cells.push({ col: cellCol[k]!, row: cellRow[k]!, value: cellVal[k]! })
    if (k === 0) {
      minV = cellVal[k]!
      maxV = cellVal[k]!
    } else {
      if (cellVal[k]! < minV) minV = cellVal[k]!
      if (cellVal[k]! > maxV) maxV = cellVal[k]!
    }
  }
  return { cols, rows, cells, min: minV, max: maxV }
}

/** One hex digit's value from its char code (0 for anything else). */
function heatHexDigit(c: Double): Double {
  if (c >= 48.0 && c <= 57.0) return c - 48.0
  if (c >= 97.0 && c <= 102.0) return c - 87.0
  if (c >= 65.0 && c <= 70.0) return c - 55.0
  return 0.0
}

/** Parse two hex digits at `at` into a channel. A malformed stop yields 0 rather than NaN. */
function heatChannel(hex: string, at: number): Double {
  if (hex.length < at + 2) return 0.0
  return heatHexDigit(hex.charCodeAt(at)) * 16.0 + heatHexDigit(hex.charCodeAt(at + 1))
}

/** 1 when the stop carries a `#` prefix, else 0 — the offset of its first digit. */
function heatHashOffset(hex: string): number {
  if (hex.length > 0 && hex.charCodeAt(0) === 35.0) return 1
  return 0
}

/**
 * The colour at `t` (0..1, clamped) along a ramp of `#rrggbb` stops,
 * interpolated piecewise between them. No stops → black; one stop → that
 * stop. Returns `rgb(r, g, b)`, which every backend's fill accepts.
 */
export function rampColor(stops: string[], t: Double): string {
  const n = stops.length
  if (n === 0) return 'rgb(0, 0, 0)'
  if (n === 1 || t <= 0.0) {
    const s0 = stops[0]!
    const o0 = heatHashOffset(s0)
    return `rgb(${Math.round(heatChannel(s0, o0))}, ${Math.round(heatChannel(s0, o0 + 2))}, ${Math.round(heatChannel(s0, o0 + 4))})`
  }
  const clamped = t >= 1.0 ? 1.0 : t
  let spanF = 0.0
  for (let i = 1; i < n; i++) spanF = spanF + 1.0
  const pos = clamped * spanF
  const rawIdx = Math.floor(pos)
  const idx = rawIdx > spanF - 1.0 ? spanF - 1.0 : rawIdx
  const frac = pos - idx
  let a = stops[0]!
  let b = stops[1]!
  let iF = 0.0
  const last = n - 1
  for (let i = 0; i < last; i++) {
    if (iF === idx) {
      a = stops[i]!
      b = stops[i + 1]!
    }
    iF = iF + 1.0
  }
  const oa = heatHashOffset(a)
  const ob = heatHashOffset(b)
  const r = heatChannel(a, oa) + (heatChannel(b, ob) - heatChannel(a, oa)) * frac
  const g = heatChannel(a, oa + 2) + (heatChannel(b, ob + 2) - heatChannel(a, oa + 2)) * frac
  const bl = heatChannel(a, oa + 4) + (heatChannel(b, ob + 4) - heatChannel(a, oa + 4)) * frac
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)})`
}

export interface HeatmapOptions {
  grid: HeatGrid
  plot: Rect
  /** Ramp stops (`#rrggbb`); default `HEAT_RAMP`. */
  stops?: string[] | undefined
  /** Gap between cells in pixels — the grout that makes cells readable. */
  gap?: Double | undefined
  /** Entrance progress 0..1; cells scale up from their centres. */
  progress?: Double | undefined
}

/**
 * Render the grid into rect commands.
 *
 * A cell's color position is (value - min) / (max - min) — a FLAT grid
 * (min === max) renders every cell at the ramp's top rather than dividing by
 * zero, because "all cells equal" reads as "all fully present", not "all
 * absent". Cells with no datum are simply not drawn: absent and zero are
 * different facts, and painting absence as the coldest color would conflate
 * them.
 */
export function renderHeat(options: HeatmapOptions): DrawCmd[] {
  const grid = options.grid
  const plot = options.plot
  const stops = options.stops ?? HEAT_RAMP
  const gap = options.gap ?? 1.0
  const rawP = options.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const out: DrawCmd[] = []
  const nc = grid.cols.length
  const nr = grid.rows.length
  if (nc === 0 || nr === 0) return out
  let ncF = 0.0
  for (let i = 0; i < nc; i++) ncF = ncF + 1.0
  let nrF = 0.0
  for (let i = 0; i < nr; i++) nrF = nrF + 1.0
  const cw = plot.w / ncF
  const ch = plot.h / nrF
  const span = grid.max - grid.min
  for (const cell of grid.cells) {
    if (cell.col >= ncF || cell.row >= nrF) continue
    const t = span <= 0.0 ? 1.0 : (cell.value - grid.min) / span
    const fullW = cw - gap
    const fullH = ch - gap
    const w = fullW * progress
    const h = fullH * progress
    const x = plot.x + cell.col * cw + gap / 2.0 + (fullW - w) / 2.0
    const y = plot.y + cell.row * ch + gap / 2.0 + (fullH - h) / 2.0
    out.push({ kind: 'rect', rect: { x, y, w, h }, fill: rampColor(stops, t) })
  }
  return out
}

/**
 * The index into `grid.cells` under the pointer, or -1 for a miss.
 *
 * The gap counts as a miss — grout is not a cell — and so does a grid
 * position holding no datum: absent cells are undrawn because absence and
 * zero are different facts, and an undrawn cell is not selectable either.
 */
export function hitHeatCell(grid: HeatGrid, plot: Rect, gap: Double, px: Double, py: Double): number {
  const nc = grid.cols.length
  const nr = grid.rows.length
  if (nc === 0 || nr === 0) return -1
  if (px < plot.x || px > plot.x + plot.w || py < plot.y || py > plot.y + plot.h) return -1
  let ncF = 0.0
  for (let i = 0; i < nc; i++) ncF = ncF + 1.0
  let nrF = 0.0
  for (let i = 0; i < nr; i++) nrF = nrF + 1.0
  const cw = plot.w / ncF
  const ch = plot.h / nrF
  const rawCol = Math.floor((px - plot.x) / cw)
  const col = rawCol > ncF - 1.0 ? ncF - 1.0 : rawCol
  const rawRow = Math.floor((py - plot.y) / ch)
  const row = rawRow > nrF - 1.0 ? nrF - 1.0 : rawRow
  const inX = px - (plot.x + col * cw)
  const inY = py - (plot.y + row * ch)
  if (inX < gap / 2.0 || inX > cw - gap / 2.0) return -1
  if (inY < gap / 2.0 || inY > ch - gap / 2.0) return -1
  let hit = -1
  for (let i = 0; i < grid.cells.length; i++) {
    const c = grid.cells[i]!
    if (hit < 0 && c.col === col && c.row === row) hit = i
  }
  return hit
}
