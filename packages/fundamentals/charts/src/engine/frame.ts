// Where a box sits inside the whole chart — the box keys (`left` / `top` /
// `right` / `bottom` / `width` / `height`) as a pure spec of resolved lengths.
// `frameView` resolves it against the chart's live size. It is an ENGINE file
// so the native hosts place a box with the same arithmetic the web does, at
// whatever size the device gives.

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

/** A box's placement, every length already resolved to its form. */
export interface FrameSpec {
  left: FrameLength
  top: FrameLength
  right: FrameLength
  bottom: FrameLength
  width: FrameLength
  height: FrameLength
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
