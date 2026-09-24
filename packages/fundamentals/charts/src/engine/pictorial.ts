// Pictorial bars as draw-list geometry.
//
// A bar is drawn as a symbol (rect / circle / diamond / triangle) either once,
// sized by the bar, or REPEATED along the bar in square unit cells — the
// `symbol` / `symbolRepeat` mark options. It is an engine file so the native
// hosts draw the same cells from the same arithmetic.

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

/** One symbol filling a cell. */
function symbolCommand(cell: Rect, b: PictorialBar): DrawCmd {
  if (b.symbol === 'circle') {
    const r = (cell.w < cell.h ? cell.w : cell.h) / 2.0
    return { kind: 'circle', center: { x: cell.x + cell.w / 2.0, y: cell.y + cell.h / 2.0 }, radius: r, fill: b.fill }
  }
  if (b.symbol === 'diamond' || b.symbol === 'triangle') return { kind: 'polygon', points: symbolPoints(cell, b.symbol), fill: b.fill }
  return { kind: 'rect', rect: cell, fill: b.fill }
}

/**
 * The commands for one pictorial bar: one symbol the size of the bar, or —
 * under `repeat` — square cells stacked from the bar's axis end, a cell that
 * would cross the bar's far edge dropped.
 */
export function pictorialCommands(b: PictorialBar): DrawCmd[] {
  const out: DrawCmd[] = []
  const bar = b.bar
  const barLength = b.horizontal ? bar.w : bar.h
  const unit = b.horizontal ? bar.h : bar.w
  const cellAt = (from: Double, length: Double): Rect =>
    b.horizontal
      ? { x: bar.x + from, y: bar.y, w: length, h: unit }
      : { x: bar.x, y: bar.y + bar.h - from - length, w: unit, h: length }
  if (!b.repeat) {
    out.push(symbolCommand(cellAt(0.0, barLength), b))
    return out
  }
  if (unit <= 0.0) return out
  let from = 0.0
  for (let k = 0; k < 400; k++) {
    if (from + unit > barLength + 0.001) break
    out.push(symbolCommand(cellAt(from, unit), b))
    from = from + unit
  }
  return out
}
