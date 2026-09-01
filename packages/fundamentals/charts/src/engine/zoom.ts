// The dataZoom window — pure math, host-agnostic.
//
// A window is a FRACTION pair over the datum range, not a pixel or index
// pair: fractions survive resizes, data updates and container changes
// without recomputation, and they are what a slider, a wheel gesture and a
// native pinch all naturally produce. The host slices its rows through
// `sliceRange`, which keeps every downstream concern — geometry, hit
// testing, tooltips, the accessible table — correct with ZERO engine
// awareness: a zoomed chart is just a chart of fewer rows.

import type { Double } from './types'

/** A visible window over the data, as fractions 0..1 with start < end. */
export interface ZoomWindow {
  start: Double
  end: Double
}

/** The narrowest a window may get — 2% of the data, so zoom cannot trap
 * itself in a span too small to ever contain a datum. */
const MIN_SPAN = 0.02

/** Clamp a window into [0,1] preserving its span where possible. */
export function clampWindow(win: ZoomWindow): ZoomWindow {
  let span = win.end - win.start
  if (span < MIN_SPAN) span = MIN_SPAN
  if (span > 1.0) span = 1.0
  let start = win.start
  if (start < 0.0) start = 0.0
  if (start + span > 1.0) start = 1.0 - span
  return { start, end: start + span }
}

/**
 * Zoom around a point.
 *
 * `centerFrac` is the pointer's position as a fraction of the CURRENT window,
 * and it stays fixed under the gesture — the datum under the cursor is the
 * one the user is looking at, so it must not slide away as the scale changes.
 * `factor` > 1 zooms out, < 1 zooms in.
 */
export function zoomWindow(win: ZoomWindow, factor: Double, centerFrac: Double): ZoomWindow {
  const span = win.end - win.start
  const c = win.start + span * (centerFrac < 0.0 ? 0.0 : centerFrac > 1.0 ? 1.0 : centerFrac)
  const nextSpan = span * factor
  const frac = span <= 0.0 ? 0.5 : (c - win.start) / span
  return clampWindow({ start: c - nextSpan * frac, end: c + nextSpan * (1.0 - frac) })
}

/** Shift a window by a fraction of ITS OWN span — one plot-width of drag
 * pans one window, at every zoom level. */
export function panWindow(win: ZoomWindow, deltaFrac: Double): ZoomWindow {
  const span = win.end - win.start
  return clampWindow({ start: win.start + deltaFrac * span, end: win.end + deltaFrac * span })
}

/** True when the window shows everything — the host drops it back to null. */
export function isFullWindow(win: ZoomWindow): boolean {
  return win.start <= 0.0 && win.end >= 1.0
}

/**
 * The datum index range a window selects out of `n` rows: [from, to).
 *
 * Never empty — a window always shows at least one datum, because a chart of
 * zero rows looks broken rather than zoomed.
 */
export function sliceRange(win: ZoomWindow, n: number): { from: number; to: number } {
  if (n <= 0) return { from: 0, to: 0 }
  let from = Math.floor(win.start * n)
  if (from > n - 1) from = n - 1
  if (from < 0) from = 0
  let to = Math.ceil(win.end * n)
  if (to > n) to = n
  if (to < from + 1) to = from + 1
  return { from, to }
}

/**
 * Map a brushed pixel span to a GLOBAL datum index range.
 *
 * The pixels are positions inside the plot rect of the CURRENTLY VISIBLE
 * window, so the mapping composes the two: pixel → window fraction → global
 * fraction → indices. Returned inclusive on both ends — a brush reports the
 * data it covers, and `start > end` inputs are normalized rather than
 * rejected (a leftward drag is still a brush).
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
