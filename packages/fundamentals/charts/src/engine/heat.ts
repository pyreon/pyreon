// Heatmap geometry — two categorical axes, a value per cell, color as the
// third channel.
//
// Pure like everything else in the engine: aggregation, the color ramp and
// the cell layout are plain functions over plain data, and the output is the
// same flat DrawCmd list every backend already executes. Nothing here knows
// about canvases.

import type { Double, DrawCmd, Rect } from './types'

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
export function buildHeatGrid(
  cols: string[],
  rows: string[],
  colOf: Double[],
  rowOf: Double[],
  values: Double[],
): HeatGrid {
  const byKey = new Map<string, HeatCell>()
  const n = Math.min(colOf.length, Math.min(rowOf.length, values.length))
  let min = 0.0
  let max = 0.0
  let seen = false
  for (let i = 0; i < n; i++) {
    const c = colOf[i]!
    const r = rowOf[i]!
    if (c < 0.0 || r < 0.0) continue
    const key = `${c}:${r}`
    const prior = byKey.get(key)
    const v = prior === undefined ? values[i]! : prior.value + values[i]!
    byKey.set(key, { col: c, row: r, value: v })
  }
  const cells: HeatCell[] = []
  for (const cell of byKey.values()) {
    cells.push(cell)
    if (!seen) {
      min = cell.value
      max = cell.value
      seen = true
    } else {
      if (cell.value < min) min = cell.value
      if (cell.value > max) max = cell.value
    }
  }
  return { cols, rows, cells, min, max }
}

/** Parse `#rrggbb` into channels. A malformed stop yields black rather than NaN. */
function hexChannel(hex: string, at: number): Double {
  const code = (ch: Double): Double => {
    const c = ch
    if (c >= 48.0 && c <= 57.0) return c - 48.0
    if (c >= 97.0 && c <= 102.0) return c - 87.0
    if (c >= 65.0 && c <= 70.0) return c - 55.0
    return 0.0
  }
  if (hex.length < at + 2) return 0.0
  return code(hex.charCodeAt(at)) * 16.0 + code(hex.charCodeAt(at + 1))
}

/**
 * A color ramp over `#rrggbb` stops: `t` in 0..1 interpolates piecewise
 * between them.
 *
 * Hand-rolled (no regex, no parseInt radix tricks) so the ramp itself lowers
 * through PMTC — a native heatmap needs its colors computed by the same code
 * or the two targets drift. Returns `rgb(r, g, b)` strings, which every
 * backend's fill already accepts.
 */
export function colorRamp(stops: string[]): (t: Double) => string {
  const parsed = stops.map((sHex) => {
    const h = sHex.startsWith('#') ? sHex.slice(1) : sHex
    return { r: hexChannel(h, 0), g: hexChannel(h, 2), b: hexChannel(h, 4) }
  })
  return (t: Double): string => {
    if (parsed.length === 0) return 'rgb(0, 0, 0)'
    if (parsed.length === 1 || t <= 0.0) {
      const p = parsed[0]!
      return `rgb(${Math.round(p.r)}, ${Math.round(p.g)}, ${Math.round(p.b)})`
    }
    const clamped = t >= 1.0 ? 1.0 : t
    const span = parsed.length - 1
    const pos = clamped * span
    const idx = Math.min(span - 1, Math.floor(pos))
    const frac = pos - idx
    const a = parsed[idx]!
    const b = parsed[idx + 1]!
    const mix = (x: Double, y: Double): Double => Math.round(x + (y - x) * frac)
    return `rgb(${mix(a.r, b.r)}, ${mix(a.g, b.g)}, ${mix(a.b, b.b)})`
  }
}

/** The default ramp — a perceptually reasonable cool-to-warm. */
export const HEAT_RAMP = ['#eff6ff', '#93c5fd', '#3b82f6', '#1e40af']

export interface HeatmapOptions {
  grid: HeatGrid
  plot: Rect
  ramp: (t: Double) => string
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
  const { grid, plot, ramp } = options
  const gap = options.gap ?? 1.0
  const raw = options.progress
  const progress = raw === undefined ? 1.0 : raw < 0.0 ? 0.0 : raw > 1.0 ? 1.0 : raw
  const out: DrawCmd[] = []
  const nc = grid.cols.length
  const nr = grid.rows.length
  if (nc === 0 || nr === 0) return out
  const cw = plot.w / nc
  const ch = plot.h / nr
  const span = grid.max - grid.min
  for (const cell of grid.cells) {
    if (cell.col >= nc || cell.row >= nr) continue
    const t = span <= 0.0 ? 1.0 : (cell.value - grid.min) / span
    const fullW = cw - gap
    const fullH = ch - gap
    const w = fullW * progress
    const h = fullH * progress
    const x = plot.x + cell.col * cw + gap / 2.0 + (fullW - w) / 2.0
    const y = plot.y + cell.row * ch + gap / 2.0 + (fullH - h) / 2.0
    out.push({ kind: 'rect', rect: { x, y, w, h }, fill: ramp(t) })
  }
  return out
}
