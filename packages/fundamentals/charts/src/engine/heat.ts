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
  // The map holds an INDEX into `cells`, not the cell: a Map with a struct
  // value has no native lowering, and an index round-trips through both
  // targets as a plain number. Same aggregation, one indirection.
  const byKey = new Map<string, number>()
  const cells: HeatCell[] = []
  const n = Math.min(colOf.length, Math.min(rowOf.length, values.length))
  let minV = 0.0
  let maxV = 0.0
  let seen = false
  for (let i = 0; i < n; i++) {
    const c = colOf[i]!
    const r = rowOf[i]!
    if (c < 0.0 || r < 0.0) continue
    const key = `${c}:${r}`
    const prior = byKey.get(key)
    // Coalesced before the branch (Swift does not narrow through the guard),
    // and mutated IN PLACE through the index — a struct copy would drop the
    // write on native.
    const at = prior ?? -1
    if (prior === undefined) {
      byKey.set(key, cells.length)
      cells.push({ col: c, row: r, value: values[i]! })
    } else {
      cells[at]!.value = cells[at]!.value + values[i]!
    }
  }
  for (const cell of cells) {
    if (!seen) {
      minV = cell.value
      maxV = cell.value
      seen = true
    } else {
      if (cell.value < minV) minV = cell.value
      if (cell.value > maxV) maxV = cell.value
    }
  }
  return { cols, rows, cells, min: minV, max: maxV }
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
  // Three channel arrays instead of an array of records: a mapped object
  // literal has no typed lowering on the native targets.
  const rs: Double[] = []
  const gs: Double[] = []
  const bs: Double[] = []
  for (const sHex of stops) {
    // Offset past a leading '#' instead of slicing (String.slice has no
    // native lowering; hexChannel already takes a start position).
    const off = sHex.startsWith('#') ? 1 : 0
    rs.push(hexChannel(sHex, off))
    gs.push(hexChannel(sHex, off + 2))
    bs.push(hexChannel(sHex, off + 4))
  }
  // One exit and Double-only arithmetic inside the closure: a bare return
  // inside a lambda and Int/Double mixing are both outside the native subset
  // (the closure is what makes a heatmap's colours the same on every target).
  let spanF = -1.0
  for (let k = 0; k < rs.length; k++) spanF = spanF + 1.0
  return (t: Double): string => {
    let result = 'rgb(0, 0, 0)'
    if (rs.length === 1 || (rs.length > 1 && t <= 0.0)) {
      result = `rgb(${Math.round(rs[0]!)}, ${Math.round(gs[0]!)}, ${Math.round(bs[0]!)})`
    } else if (rs.length > 1) {
      const clamped = t >= 1.0 ? 1.0 : t
      const pos = clamped * spanF
      // Floor + clamp-below-span through a Double cursor beside the Int index.
      let idx = 0
      let idxF = 0.0
      let jf = 1.0
      for (let k = 1; k < rs.length - 1; k++) {
        if (jf <= pos) {
          idx = k
          idxF = jf
        }
        jf = jf + 1.0
      }
      const frac = pos - idxF
      const mix = (x: Double, y: Double): Double => Math.round(x + (y - x) * frac)
      result = `rgb(${mix(rs[idx]!, rs[idx + 1]!)}, ${mix(gs[idx]!, gs[idx + 1]!)}, ${mix(bs[idx]!, bs[idx + 1]!)})`
    }
    return result
  }
}

/** The default ramp — a perceptually reasonable cool-to-warm. */
export const HEAT_RAMP = ['#eff6ff', '#93c5fd', '#3b82f6', '#1e40af']

export interface HeatmapOptions {
  grid: HeatGrid
  plot: Rect
  /**
   * `#rrggbb` ramp stops, cold to hot. Data rather than a closure: a
   * function-typed struct field has no native lowering, and stops are what
   * every caller had anyway (`colorRamp` runs inside).
   */
  stops: string[]
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
  const ramp = colorRamp(options.stops)
  const gap = options.gap ?? 1.0
  // Coalesce FIRST, then clamp a non-optional (the Swift-narrowing idiom).
  const rawP = options.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const out: DrawCmd[] = []
  const nc = grid.cols.length
  const nr = grid.rows.length
  if (nc === 0 || nr === 0) return out
  // Double twins of the counts: a cell's col/row are Doubles, and comparing
  // them against an Int count is a Swift error.
  let ncF = 0.0
  for (let k = 0; k < nc; k++) ncF = ncF + 1.0
  let nrF = 0.0
  for (let k = 0; k < nr; k++) nrF = nrF + 1.0
  const cw = plot.w / nc
  const ch = plot.h / nr
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
    out.push({ kind: 'rect', rect: { x, y, w, h }, fill: ramp(t) })
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
export function hitHeatCell(
  grid: HeatGrid,
  plot: Rect,
  gap: Double,
  px: Double,
  py: Double,
): number {
  const nc = grid.cols.length
  const nr = grid.rows.length
  if (nc === 0 || nr === 0) return -1
  if (px < plot.x || px > plot.x + plot.w || py < plot.y || py > plot.y + plot.h) return -1
  const cw = plot.w / nc
  const ch = plot.h / nr
  // Integer floors by scanning (Math.floor lowers to a Double natively); the
  // scan also clamps to the last column/row.
  const tCol = (px - plot.x) / cw
  const tRow = (py - plot.y) / ch
  let colF = 0.0
  let jf = 0.0
  for (let j = 0; j < nc; j++) {
    if (jf <= tCol) colF = jf
    jf = jf + 1.0
  }
  let rowF = 0.0
  let kf = 0.0
  for (let k = 0; k < nr; k++) {
    if (kf <= tRow) rowF = kf
    kf = kf + 1.0
  }
  const inX = px - (plot.x + colF * cw)
  const inY = py - (plot.y + rowF * ch)
  if (inX < gap / 2.0 || inX > cw - gap / 2.0) return -1
  if (inY < gap / 2.0 || inY > ch - gap / 2.0) return -1
  for (let i = 0; i < grid.cells.length; i++) {
    const c = grid.cells[i]!
    // Cell fields lower to Double natively; compare with the Double cursors.
    if (c.col === colF && c.row === rowF) return i
  }
  return -1
}
