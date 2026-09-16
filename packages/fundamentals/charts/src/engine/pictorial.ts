// Pictorial bars — ECharts' `pictorialBar` vocabulary as draw-list geometry.
//
// A bar is drawn as a symbol (rect / circle / diamond / triangle) either once
// (sized by the bar, or by `symbolBoundingData`) or REPEATED along the bar in
// unit cells. The six keys ECharts adds on top are all geometry, so they live
// here and cross to native with the generated engine:
//   symbolMargin       — gap between repeated cells (px)
//   symbolOffset       — [dx, dy] px nudge of every symbol
//   symbolPosition     — where the symbol (or run) sits along the bar: start | end | center
//   symbolRotate       — degrees, about each cell's centre (a circle is unchanged)
//   symbolClip         — clip to the bar instead of dropping a partial cell
//   symbolBoundingData — the value a full symbol (or run) spans; with clip, the
//                        bar shows the fraction the datum covers
//
// Clipping is polygon ∩ axis-aligned rect (Sutherland–Hodgman); a circle that
// needs clipping becomes a 24-gon first, so every backend paints the same
// shape from the same points.

import { isFiniteNumber } from './scale'
import type { DrawCmd, Double, Pt, Rect } from './types'


/** What one bar asks of the pictorial pass. */
export interface PictorialBar {
  /** The bar's rect as laid out (the axis end is `x` for horizontal, `y + h` for vertical). */
  bar: Rect
  /** Bar direction. */
  horizontal: boolean
  /** rect | circle | diamond | triangle (anything else draws a rect). */
  symbol: string
  repeat: boolean
  fill: string
  margin: Double
  offsetX: Double
  offsetY: Double
  position: string
  rotate: Double
  clip: boolean
  /** True when `boundingLength` applies (a `symbolBoundingData` was given); else the run is the bar itself. */
  hasBounding: boolean
  /** The bar's length a full symbol run would span (read only when `hasBounding`). */
  boundingLength: Double
}

const POLYGON_CIRCLE_SIDES = 24

/** The symbol's outline for a cell — a rect/diamond/triangle, or a 24-gon for a circle. */
export function symbolPoints(cell: Rect, symbol: string): Pt[] {
  if (symbol === 'circle') {
    const r = (cell.w < cell.h ? cell.w : cell.h) / 2.0
    const cx = cell.x + cell.w / 2.0
    const cy = cell.y + cell.h / 2.0
    const pts: Pt[] = []
    for (let i = 0; i < POLYGON_CIRCLE_SIDES; i++) {
      const a = (Math.PI * 2.0 * i) / POLYGON_CIRCLE_SIDES
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
    }
    return pts
  }
  if (symbol === 'diamond') {
    return [
      { x: cell.x + cell.w / 2.0, y: cell.y },
      { x: cell.x + cell.w, y: cell.y + cell.h / 2.0 },
      { x: cell.x + cell.w / 2.0, y: cell.y + cell.h },
      { x: cell.x, y: cell.y + cell.h / 2.0 },
    ]
  }
  if (symbol === 'triangle') {
    return [
      { x: cell.x + cell.w / 2.0, y: cell.y },
      { x: cell.x + cell.w, y: cell.y + cell.h },
      { x: cell.x, y: cell.y + cell.h },
    ]
  }
  return [
    { x: cell.x, y: cell.y },
    { x: cell.x + cell.w, y: cell.y },
    { x: cell.x + cell.w, y: cell.y + cell.h },
    { x: cell.x, y: cell.y + cell.h },
  ]
}

/** Rotate points about a centre by `degrees` (clockwise on screen, ECharts' sense). */
export function rotatePoints(points: Pt[], center: Pt, degrees: Double): Pt[] {
  if (degrees === 0.0) return points
  const a = (degrees * Math.PI) / 180.0
  const c = Math.cos(a)
  const s = Math.sin(a)
  const out: Pt[] = []
  for (const p of points) {
    const dx = p.x - center.x
    const dy = p.y - center.y
    out.push({ x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c })
  }
  return out
}

/** Polygon ∩ axis-aligned rect (Sutherland–Hodgman). An empty result means nothing is visible. */
export function clipPolygonToRect(points: Pt[], rect: Rect): Pt[] {
  let current = points
  const x0 = rect.x
  const x1 = rect.x + rect.w
  const y0 = rect.y
  const y1 = rect.y + rect.h
  for (let edge = 0; edge < 4; edge++) {
    if (current.length === 0) return current
    const next: Pt[] = []
    for (let i = 0; i < current.length; i++) {
      const p = current[i]!
      const q = current[(i + 1) % current.length]!
      const pIn = insideEdge(p, edge, x0, x1, y0, y1)
      const qIn = insideEdge(q, edge, x0, x1, y0, y1)
      if (pIn && qIn) next.push(q)
      else if (pIn && !qIn) next.push(intersectEdge(p, q, edge, x0, x1, y0, y1))
      else if (!pIn && qIn) {
        next.push(intersectEdge(p, q, edge, x0, x1, y0, y1))
        next.push(q)
      }
    }
    current = next
  }
  return current
}

function insideEdge(p: Pt, edge: number, x0: Double, x1: Double, y0: Double, y1: Double): boolean {
  if (edge === 0) return p.x >= x0
  if (edge === 1) return p.x <= x1
  if (edge === 2) return p.y >= y0
  return p.y <= y1
}

function intersectEdge(p: Pt, q: Pt, edge: number, x0: Double, x1: Double, y0: Double, y1: Double): Pt {
  if (edge === 0 || edge === 1) {
    const x = edge === 0 ? x0 : x1
    const t = q.x === p.x ? 0.0 : (x - p.x) / (q.x - p.x)
    return { x, y: p.y + (q.y - p.y) * t }
  }
  const y = edge === 2 ? y0 : y1
  const t = q.y === p.y ? 0.0 : (y - p.y) / (q.y - p.y)
  return { x: p.x + (q.x - p.x) * t, y }
}

/**
 * One symbol in a cell: rotated, nudged, optionally clipped to `clipTo`. A
 * list rather than an optional (empty when clipping leaves nothing), because
 * Swift does not narrow an optional through `!== null` — see stateFill.
 */
function symbolCommands(cell: Rect, b: PictorialBar, clipTo: Rect | null): DrawCmd[] {
  const out: DrawCmd[] = []
  const needsPolygon = b.symbol !== 'rect' || b.rotate !== 0.0 || clipTo !== null
  const nudged: Rect = { x: cell.x + b.offsetX, y: cell.y + b.offsetY, w: cell.w, h: cell.h }
  if (b.symbol === 'circle' && b.rotate === 0.0 && clipTo === null) {
    const r = (nudged.w < nudged.h ? nudged.w : nudged.h) / 2.0
    out.push({ kind: 'circle', center: { x: nudged.x + nudged.w / 2.0, y: nudged.y + nudged.h / 2.0 }, radius: r, fill: b.fill })
    return out
  }
  if (!needsPolygon) {
    out.push({ kind: 'rect', rect: nudged, fill: b.fill })
    return out
  }
  let pts = symbolPoints(nudged, b.symbol)
  if (b.rotate !== 0.0) pts = rotatePoints(pts, { x: nudged.x + nudged.w / 2.0, y: nudged.y + nudged.h / 2.0 }, b.rotate)
  if (clipTo !== null) pts = clipPolygonToRect(pts, clipTo)
  if (pts.length >= 3) out.push({ kind: 'polygon', points: pts, fill: b.fill })
  return out
}

/**
 * The commands for one pictorial bar.
 *
 * The run's length is the bar's, or `boundingLength` when set. Cells stack
 * from the bar's axis end; `position` moves the run (or the single symbol) to
 * the far end or the centre of the bar. Without `clip`, a cell that would
 * cross the bar's far edge is dropped; with it, every cell is clipped to the
 * bar, so a datum shows the fraction of the bounding run it covers.
 */
export function pictorialCommands(b: PictorialBar): DrawCmd[] {
  const out: DrawCmd[] = []
  const bar = b.bar
  const barLength = b.horizontal ? bar.w : bar.h
  const unit = b.horizontal ? bar.h : bar.w
  const runLength = b.hasBounding && isFiniteNumber(b.boundingLength) ? b.boundingLength : barLength
  const clipTo: Rect | null = b.clip ? bar : null
  // Where along the bar the run (or single symbol) starts, measured from the axis end.
  let shift: Double = 0.0
  if (b.position === 'end') shift = barLength - runLength
  else if (b.position === 'center') shift = (barLength - runLength) / 2.0
  const cellAt = (from: Double, length: Double): Rect =>
    b.horizontal
      ? { x: bar.x + from, y: bar.y, w: length, h: unit }
      : { x: bar.x, y: bar.y + bar.h - from - length, w: unit, h: length }
  if (!b.repeat) {
    const cell = cellAt(shift, runLength)
    if (!b.clip && (shift < 0.0 || shift + runLength > barLength + 0.001)) {
      // The bounding symbol overhangs the bar and clipping is off: draw it whole, as ECharts does.
      for (const c of symbolCommands(cell, b, null)) out.push(c)
      return out
    }
    for (const c of symbolCommands(cell, b, clipTo)) out.push(c)
    return out
  }
  const step = unit + b.margin
  if (unit <= 0.0 || step <= 0.0) return out
  let from = shift
  for (let k = 0; k < 400; k++) {
    const end = from + unit
    if (from >= shift + runLength - 0.001 && !b.clip) break
    if (from >= shift + runLength - 0.001) break
    // A cell past the run's end: clipped to the run when clipping, dropped otherwise.
    const overRun = end > shift + runLength + 0.001
    if (overRun && !b.clip) break
    const overBar = end > barLength + 0.001 || from < -0.001
    if (overBar && !b.clip) break
    const length = overRun ? shift + runLength - from : unit
    const cell = cellAt(from, unit)
    const clipRect: Rect | null = b.clip ? (overRun ? intersectRect(bar, cellAt(from, length)) : clipTo) : null
    for (const c of symbolCommands(cell, b, clipRect)) out.push(c)
    from = from + step
  }
  return out
}

function intersectRect(a: Rect, c: Rect): Rect {
  const x0 = a.x > c.x ? a.x : c.x
  const y0 = a.y > c.y ? a.y : c.y
  const x1 = a.x + a.w < c.x + c.w ? a.x + a.w : c.x + c.w
  const y1 = a.y + a.h < c.y + c.h ? a.y + a.h : c.y + c.h
  return { x: x0, y: y0, w: x1 - x0 > 0.0 ? x1 - x0 : 0.0, h: y1 - y0 > 0.0 ? y1 - y0 : 0.0 }
}
