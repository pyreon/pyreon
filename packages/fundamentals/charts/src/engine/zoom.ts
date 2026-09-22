// The dataZoom window — pure math, host-agnostic, in the native-crossing
// subset (the pixel-to-index brush helper lives in ./brush).
//
// A window is a FRACTION pair over the datum range, not a pixel or index
// pair: fractions survive resizes, data updates and container changes
// without recomputation, and they are what a slider, a wheel gesture and a
// native pinch all naturally produce. The host slices its rows through
// `sliceRange`, which keeps every downstream concern — geometry, hit
// testing, tooltips, the accessible table — correct with ZERO engine
// awareness: a zoomed chart is just a chart of fewer rows.

import type { Double } from './types'

export interface ZoomWindow {
  start: Double
  end: Double
}

/** The datum index range a window selects: `[from, to)`, never empty. */
export interface SliceRange {
  from: number
  to: number
}

const MIN_SPAN = 0.02

export function clampWindow(win: ZoomWindow): ZoomWindow {
  let span = win.end - win.start
  if (span < MIN_SPAN) span = MIN_SPAN
  if (span > 1.0) span = 1.0
  let start = win.start
  if (start < 0.0) start = 0.0
  if (start + span > 1.0) start = 1.0 - span
  return { start, end: start + span }
}

/** Scale the window's span by `factor` around `centerFrac` (0..1 of the current window). */
export function zoomWindow(win: ZoomWindow, factor: Double, centerFrac: Double): ZoomWindow {
  const span = win.end - win.start
  const c = win.start + span * (centerFrac < 0.0 ? 0.0 : centerFrac > 1.0 ? 1.0 : centerFrac)
  const nextSpan = span * factor
  const frac = span <= 0.0 ? 0.5 : (c - win.start) / span
  return clampWindow({ start: c - nextSpan * frac, end: c + nextSpan * (1.0 - frac) })
}

/** Shift the window by `deltaFrac` of its own span. */
export function panWindow(win: ZoomWindow, deltaFrac: Double): ZoomWindow {
  const span = win.end - win.start
  return clampWindow({ start: win.start + deltaFrac * span, end: win.end + deltaFrac * span })
}

/** ECharts' `zoomLock` / `minSpan` / `maxSpan`, as fractions of the rows. */
export interface ZoomLimits {
  lock: boolean
  minSpan: Double
  maxSpan: Double
}

/**
 * A window held to its limits: under `lock` the span stays that of `prev`
 * (the window only pans), otherwise it is bounded by `minSpan` / `maxSpan`.
 * A resized window keeps its centre and slides back inside the rows.
 */
export function limitZoomWindow(limits: ZoomLimits, prev: ZoomWindow, next: ZoomWindow): ZoomWindow {
  const w = clampWindow(next)
  const span = w.end - w.start
  const lo = limits.minSpan
  const hi = limits.maxSpan > 0.0 ? limits.maxSpan : 1.0
  let target = span < lo ? lo : span > hi ? hi : span
  if (limits.lock) target = prev.end - prev.start
  const diff = target - span
  if ((diff < 0.0 ? 0.0 - diff : diff) <= 0.000000001) return w
  const center = (w.start + w.end) / 2.0
  let start = center - target / 2.0
  let end = center + target / 2.0
  if (start < 0.0) {
    end = end - start
    start = 0.0
  }
  if (end > 1.0) {
    start = start - (end - 1.0)
    end = 1.0
  }
  return clampWindow({ start: start < 0.0 ? 0.0 : start, end: end > 1.0 ? 1.0 : end })
}

/** The window covering rows `first`…`last` (inclusive) of `n` — what a box-select zoom sets. */
export function windowOfRows(first: number, last: number, n: number): ZoomWindow {
  if (n <= 0) return { start: 0.0, end: 1.0 }
  let nF = 0.0
  for (let i = 0; i < n; i++) nF = nF + 1.0
  let a = 0.0
  for (let i = 0; i < first; i++) a = a + 1.0
  let b = 0.0
  for (let i = 0; i <= last; i++) b = b + 1.0
  return clampWindow({ start: a / nF, end: b / nF })
}

export function isFullWindow(win: ZoomWindow): boolean {
  return win.start <= 0.0 && win.end >= 1.0
}

/**
 * `from = floor(start × n)` clamped to `[0, n-1]`, `to = ceil(end × n)`
 * clamped to `n`, and never fewer than one row. Written as counted walks
 * rather than `Math.floor` / `Math.ceil` so both indices are genuine Ints on
 * every target (a Double floor into an Int field compiles on neither).
 */
export function sliceRange(win: ZoomWindow, n: number): SliceRange {
  if (n <= 0) return { from: 0, to: 0 }
  let nF = 0.0
  for (let i = 0; i < n; i++) nF = nF + 1.0
  const startAt = win.start * nF
  const endAt = win.end * nF
  let from = 0
  let fromF = 0.0
  while (fromF + 1.0 <= startAt && from < n - 1) {
    from = from + 1
    fromF = fromF + 1.0
  }
  let to = 0
  let toF = 0.0
  while (toF < endAt && to < n) {
    to = to + 1
    toF = toF + 1.0
  }
  if (to < from + 1) to = from + 1
  return { from, to }
}
