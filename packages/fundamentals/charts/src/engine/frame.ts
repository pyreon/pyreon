// Where a family chart sits inside the whole chart — ECharts' box keys
// (`left` / `top` / `right` / `bottom` / `width` / `height`) and, for a round
// series, `center` and `radius` — as a pure spec of resolved lengths.
//
// The option reader (option-layers.ts) turns an ECharts series into a
// `FrameSpec` once; `frameRect` / `frameView` resolve it against the chart's
// live size. It is an ENGINE file so the native hosts place a pie or a gauge
// with the same arithmetic the web does, at whatever size the device gives.

import type { Double, Rect } from './types'

/**
 * One ECharts layout length: `mode` '' (unset), 'px', 'pct' (of the extent
 * it is measured against), or a position keyword — 'center', 'start'
 * (left / top) or 'end' (right / bottom).
 */
export interface FrameLength {
  mode: string
  amount: Double
}

/** A series' placement, every length already resolved to its form. */
export interface FrameSpec {
  left: FrameLength
  top: FrameLength
  right: FrameLength
  bottom: FrameLength
  width: FrameLength
  height: FrameLength
  /** A round series: the frame is the square its circle fills inside the box. */
  round: boolean
  centerX: FrameLength
  centerY: FrameLength
  radius: FrameLength
}

/** A length against `extent`; `fallback` when it is unset or a keyword. */
export function frameLength(l: FrameLength, extent: Double, fallback: Double): Double {
  if (l.mode === 'px') return l.amount
  if (l.mode === 'pct') return (l.amount / 100.0) * extent
  return fallback
}

/** A `left` / `top`: a keyword places a `size`-long box, else a length. */
function frameEdge(l: FrameLength, extent: Double, size: Double): Double {
  if (l.mode === 'center') return (extent - size) / 2.0
  if (l.mode === 'start') return 0.0
  if (l.mode === 'end') return extent - size
  return frameLength(l, extent, 0.0)
}

/** ECharts' box layout (getLayoutRect's margin rules) inside `width` × `height`. */
export function frameView(spec: FrameSpec, width: Double, height: Double): Rect {
  const hasW = spec.width.mode !== ''
  const hasH = spec.height.mode !== ''
  const w0 = frameLength(spec.width, width, width)
  const h0 = frameLength(spec.height, height, height)
  const hasLeft = spec.left.mode !== ''
  const hasTop = spec.top.mode !== ''
  const hasRight = spec.right.mode !== ''
  const hasBottom = spec.bottom.mode !== ''
  const right = frameLength(spec.right, width, 0.0)
  const bottom = frameLength(spec.bottom, height, 0.0)
  const x = hasLeft ? frameEdge(spec.left, width, hasW ? w0 : 0.0) : hasW && hasRight ? width - right - w0 : 0.0
  const y = hasTop ? frameEdge(spec.top, height, hasH ? h0 : 0.0) : hasH && hasBottom ? height - bottom - h0 : 0.0
  const w = hasW ? w0 : Math.max(0.0, width - x - right)
  const h = hasH ? h0 : Math.max(0.0, height - y - bottom)
  return { x, y, w: Math.max(0.0, w), h: Math.max(0.0, h) }
}

/**
 * The rect a family chart draws into: its box, or — for a round series — the
 * square its circle fills, centred at `center` with the OUTER `radius` (a
 * percent of half the box's shorter side).
 */
export function frameRect(spec: FrameSpec, width: Double, height: Double): Rect {
  const view = frameView(spec, width, height)
  if (!spec.round) return view
  const cx = view.x + frameLength(spec.centerX, view.w, view.w / 2.0)
  const cy = view.y + frameLength(spec.centerY, view.h, view.h / 2.0)
  const half = Math.min(view.w, view.h) / 2.0
  const r = frameLength(spec.radius, half, half)
  return { x: cx - r, y: cy - r, w: r * 2.0, h: r * 2.0 }
}

/** `frameRect` moved by (-dx, -dy) — into a host's plot space when chrome above or beside it shifted the plot. */
export function frameRectAt(spec: FrameSpec, width: Double, height: Double, dx: Double, dy: Double): Rect {
  const r = frameRect(spec, width, height)
  return { x: r.x - dx, y: r.y - dy, w: r.w, h: r.h }
}

/** `frameView` moved by (-dx, -dy), the same way. */
export function frameViewAt(spec: FrameSpec, width: Double, height: Double, dx: Double, dy: Double): Rect {
  const r = frameView(spec, width, height)
  return { x: r.x - dx, y: r.y - dy, w: r.w, h: r.h }
}
