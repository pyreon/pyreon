// Parallel coordinates — one vertical axis per dimension, one polyline per row.
//
// Written in the native subset and BUNDLED into the generated Swift/Kotlin
// engine: rows are numeric (`Double[]`, a category as its index, a gap as
// NaN), an axis places a value through the plain function `parallelPlace`
// rather than a closure, line colours are data (`lineColor` / `lineColors`)
// rather than a callback, and the hit answers an INDEX. The mixed-type row
// adapter, the colour callback, `lineRuns` and the nullable hit live in
// parallel-web.ts; the svg half in family-svg.ts.

import { plain } from './format'
import { sankeyRgba } from './sankey'
import type { Domain, Double, DrawCmd, Pt, Rect } from './types'

const PARALLEL_PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

export interface ParallelAxis {
  name: string
  /** 'value' (default) maps numbers linearly; 'category' maps an index into `categories`. */
  type?: 'value' | 'category' | undefined
  categories?: string[] | undefined
  /** Fixed extent for a value axis; default the data's min/max. An inverted extent (max < min) is ignored. */
  domain?: Domain | undefined
  /** Flip so the largest value sits at the bottom. */
  inverse?: boolean | undefined
}

export interface ParallelTick {
  y: Double
  label: string
}

export interface ParallelLayoutAxis {
  name: string
  x: Double
  y0: Double
  y1: Double
  /** Resolved extent (category axes: 0..n-1). */
  domain: Domain
  ticks: ParallelTick[]
  isCategory: boolean
  inverse: boolean
}

/** Where a datum lands on an axis; `ok: false` when it cannot be placed (a gap). */
export interface ParallelPlaced {
  ok: boolean
  y: Double
}

export interface ParallelLine {
  index: number
  /** One point per axis, aligned with `present`; a point whose `present` is false is a gap. */
  points: Pt[]
  present: boolean[]
  color: string
}

export interface ParallelLayout {
  axes: ParallelLayoutAxis[]
  lines: ParallelLine[]
}

export interface ParallelOptions {
  fontSize?: Double | undefined
  labelColor?: string | undefined
  axisColor?: string | undefined
  /** Line colour for every row. */
  lineColor?: string | undefined
  /** Per-row line colours, by row index (wins over `lineColor` where present). */
  lineColors?: string[] | undefined
  lineOpacity?: Double | undefined
  lineWidth?: Double | undefined
  /** Row indices drawn last, full opacity, in `highlightColor`. */
  highlight?: Double[] | undefined
  highlightColor?: string | undefined
  /** Entrance progress 0..1; lines draw left to right. */
  progress?: Double | undefined
}

/** Y for a raw datum on an axis; a NaN, or a category index outside the axis, is a gap. */
export function parallelPlace(axis: ParallelLayoutAxis, v: Double): ParallelPlaced {
  if (v !== v) return { ok: false, y: 0.0 }
  const lo = axis.domain.min
  const span = axis.domain.max - lo
  if (axis.isCategory && (v < 0.0 || v > axis.domain.max)) return { ok: false, y: 0.0 }
  const raw = axis.isCategory ? (span <= 0.0 ? 0.5 : v / span) : span <= 0.0 ? 0.5 : (v - lo) / span
  const t = raw < 0.0 ? 0.0 : raw > 1.0 ? 1.0 : raw
  const y = axis.inverse ? axis.y0 + (axis.y1 - axis.y0) * t : axis.y1 - (axis.y1 - axis.y0) * t
  return { ok: true, y }
}

/** Whether a row index is in the highlight list. */
function parallelHighlighted(highlight: Double[], index: Double): boolean {
  let found = false
  for (const h of highlight) if (h === index) found = true
  return found
}

/** Lay out the axes into `box` and place every row. */
export function layoutParallel(axes: ParallelAxis[], rows: Double[][], box: Rect, options?: ParallelOptions): ParallelLayout {
  const fontSize = options?.fontSize ?? 11.0
  const top = box.y + fontSize * 1.8
  const bottom = box.y + box.h - fontSize * 1.4
  const n = axes.length
  let nF = 0.0
  for (let i = 0; i < n; i++) nF = nF + 1.0
  const outAxes: ParallelLayoutAxis[] = []
  let aF = 0.0
  for (let a = 0; a < n; a++) {
    const axis = axes[a]!
    const x = n <= 1 ? box.x + box.w / 2.0 : box.x + (box.w * aF) / (nF - 1.0)
    const isCat = axis.type === 'category'
    const cats = axis.categories ?? []
    const dMin = axis.domain?.min ?? 0.0
    const dMax = axis.domain?.max ?? -1.0
    const hasDomain = dMax >= dMin
    let lo = 0.0
    let hi = 0.0
    if (isCat) {
      let catsF = 0.0
      for (let i = 0; i < cats.length; i++) catsF = catsF + 1.0
      hi = catsF > 1.0 ? catsF - 1.0 : 0.0
    } else if (hasDomain) {
      lo = dMin
      hi = dMax
    } else {
      let seen = false
      for (const r of rows) {
        if (a >= r.length) continue
        const v = r[a]!
        if (v !== v) continue
        if (!seen || v < lo) lo = v
        if (!seen || v > hi) hi = v
        seen = true
      }
      if (!seen) hi = 1.0
    }
    const inverse = axis.inverse === true
    const resolved: ParallelLayoutAxis = { name: axis.name, x, y0: top, y1: bottom, domain: { min: lo, max: hi }, ticks: [], isCategory: isCat, inverse }
    const ticks: ParallelTick[] = []
    if (isCat) {
      let iF = 0.0
      for (let i = 0; i < cats.length; i++) {
        ticks.push({ y: parallelPlace(resolved, iF).y, label: cats[i]! })
        iF = iF + 1.0
      }
    } else {
      ticks.push({ y: inverse ? top : bottom, label: plain(lo) })
      ticks.push({ y: inverse ? bottom : top, label: plain(hi) })
    }
    outAxes.push({ name: axis.name, x, y0: top, y1: bottom, domain: { min: lo, max: hi }, ticks, isCategory: isCat, inverse })
    aF = aF + 1.0
  }
  const lines: ParallelLine[] = []
  const colors = options?.lineColors ?? []
  const fallback = options?.lineColor ?? PARALLEL_PALETTE[0]!
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const points: Pt[] = []
    const present: boolean[] = []
    for (let a = 0; a < n; a++) {
      const v = a < row.length ? row[a]! : 0.0 / 0.0
      const placed = parallelPlace(outAxes[a]!, v)
      points.push({ x: outAxes[a]!.x, y: placed.y })
      present.push(placed.ok)
    }
    const color = i < colors.length ? colors[i]! : fallback
    lines.push({ index: i, points, present, color })
  }
  return { axes: outAxes, lines }
}

/** Render lines (highlighted last), then axes, ticks and names. */
export function renderParallel(layout: ParallelLayout, options?: ParallelOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const opacity = options?.lineOpacity ?? 0.45
  const width = options?.lineWidth ?? 1.0
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const n = layout.axes.length
  let nF = 0.0
  for (let i = 0; i < n; i++) nF = nF + 1.0
  const shown = progress >= 1.0 ? nF : Math.floor(nF * progress)
  const highlight = options?.highlight ?? []
  const highlightColor = options?.highlightColor ?? '#b42318'
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#334155'
  const axisColor = options?.axisColor ?? '#94a3b8'
  // Pass 0 draws the plain lines, pass 1 the highlighted ones on top.
  for (let pass = 0; pass < 2; pass++) {
    let lineF = 0.0
    for (const line of layout.lines) {
      const isHl = parallelHighlighted(highlight, lineF)
      lineF = lineF + 1.0
      if ((pass === 1) !== isHl) continue
      const stroke = isHl ? highlightColor : sankeyRgba(line.color, opacity)
      const w = isHl ? width + 1.0 : width
      // Split at gaps into runs of at least two points (a run is a fresh array per segment).
      let runStart = -1
      let iF = 0.0
      for (let i = 0; i < line.points.length; i++) {
        const visible = iF < shown && line.present[i]!
        if (visible && runStart < 0) runStart = i
        if (!visible && runStart >= 0) {
          if (i - runStart >= 2) {
            const run: Pt[] = []
            for (let k = runStart; k < i; k++) run.push(line.points[k]!)
            out.push({ kind: 'polyline', points: run, stroke, width: w })
          }
          runStart = -1
        }
        iF = iF + 1.0
      }
      if (runStart >= 0 && line.points.length - runStart >= 2) {
        const run: Pt[] = []
        for (let k = runStart; k < line.points.length; k++) run.push(line.points[k]!)
        out.push({ kind: 'polyline', points: run, stroke, width: w })
      }
    }
  }
  for (const axis of layout.axes) {
    out.push({ kind: 'line', from: { x: axis.x, y: axis.y0 }, to: { x: axis.x, y: axis.y1 }, stroke: axisColor, width: 1.0 })
    if (progress < 1.0) continue
    out.push({ kind: 'text', text: axis.name, at: { x: axis.x, y: axis.y0 - fontSize * 0.5 }, fill: labelColor, size: fontSize, align: 'middle', baseline: 'bottom' })
    for (const t of axis.ticks) {
      out.push({ kind: 'line', from: { x: axis.x - 3.0, y: t.y }, to: { x: axis.x + 3.0, y: t.y }, stroke: axisColor, width: 1.0 })
      out.push({ kind: 'text', text: t.label, at: { x: axis.x + 5.0, y: t.y }, fill: labelColor, size: fontSize * 0.9, align: 'start', baseline: 'middle' })
    }
  }
  return out
}

/** Distance from a point to the segment a–b. */
function parallelSegmentDistance(px: Double, py: Double, a: Pt, b: Pt): Double {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const rawT = len2 <= 0.0 ? 0.0 : ((px - a.x) * dx + (py - a.y) * dy) / len2
  const t = rawT < 0.0 ? 0.0 : rawT > 1.0 ? 1.0 : rawT
  const qx = a.x + dx * t
  const qy = a.y + dy * t
  return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy))
}

/** Index of the nearest line within `tolerance` pixels (default 4), or -1. */
export function hitParallelIndex(layout: ParallelLayout, px: Double, py: Double, tolerance?: Double): number {
  const tol = tolerance ?? 4.0
  let best = -1
  let bestD = tol
  for (let k = 0; k < layout.lines.length; k++) {
    const line = layout.lines[k]!
    for (let i = 1; i < line.points.length; i++) {
      if (!line.present[i - 1]! || !line.present[i]!) continue
      const d = parallelSegmentDistance(px, py, line.points[i - 1]!, line.points[i]!)
      if (d <= bestD) {
        best = k
        bestD = d
      }
    }
  }
  return best
}
