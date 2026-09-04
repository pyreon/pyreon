// The brush's pixel → datum mapping. Web-side (a nested closure keeps it out
// of the crossing subset); the window math it composes lives in ./zoom.

import { sliceRange } from './zoom'
import type { ZoomWindow } from './zoom'
import type { Double } from './types'

/**
 * Map a pixel span inside the plot to the GLOBAL inclusive datum index
 * range it covers under the current window. Either drag direction; a span
 * outside the plot is clamped to it; a zero-width plot maps everything to
 * the window's start.
 */
export function brushRange(
  plotX: Double,
  plotW: Double,
  x1: Double,
  x2: Double,
  win: ZoomWindow,
  n: number,
): { start: number; end: number } {
  const lo = x1 < x2 ? x1 : x2
  const hi = x1 < x2 ? x2 : x1
  const f = (px: Double): Double => {
    const raw = plotW <= 0.0 ? 0.0 : (px - plotX) / plotW
    const clamped = raw < 0.0 ? 0.0 : raw > 1.0 ? 1.0 : raw
    return win.start + clamped * (win.end - win.start)
  }
  const r = sliceRange({ start: f(lo), end: f(hi) }, n)
  return { start: r.from, end: r.to - 1 }
}
