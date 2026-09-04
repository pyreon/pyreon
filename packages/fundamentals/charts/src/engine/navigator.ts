// The navigator — ECharts' slider dataZoom, engine-shaped: a strip under the
// plot showing the first series over ALL rows, with the window drawn as a
// band and two handles. Layout, the drag model (band → move, handle → resize)
// and the window math live here, so the web host, iOS and Android agree on
// where the band is and what a drag does to it.

import { layoutSeriesPoints } from './layout'
import { withAlpha } from './radar'
import type { DrawCmd, Double, Pt, Rect } from './types'
import { clampWindow } from './zoom'
import type { ZoomWindow } from './zoom'

export interface NavigatorLayout {
  cmds: DrawCmd[]
  /** The strip's rect in canvas coordinates — what the drag model measures against. */
  strip: Rect
  /** What the plot gives up (the strip plus its insets). */
  height: Double
}

const NAV_STRIP_HEIGHT = 36.0
const NAV_INSET = 8.0
const NAV_PAD_Y = 6.0
const HANDLE_GRAB = 6.0
const NAV_MIN_SPAN = 0.02

/**
 * Lay the strip out along the bottom of `canvas` and paint it: the grid
 * background, the first series as a mini area (empty or single-value series
 * draw no area), the window band and its handles.
 */
export function renderNavigator(
  values: Double[],
  color: string,
  win: ZoomWindow,
  canvas: Rect,
  gridFill: string,
): NavigatorLayout {
  const stripW = canvas.w - NAV_INSET * 2.0
  const strip: Rect = {
    x: canvas.x + NAV_INSET,
    y: canvas.y + canvas.h - NAV_STRIP_HEIGHT + NAV_PAD_Y,
    w: stripW < 0.0 ? 0.0 : stripW,
    h: NAV_STRIP_HEIGHT - NAV_PAD_Y * 2.0,
  }
  const cmds: DrawCmd[] = []
  cmds.push({ kind: 'rect', rect: strip, fill: gridFill })
  if (values.length > 1) {
    let lo = 0.0
    let hi = 0.0
    let seen = false
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!
      // A NaN never compares equal to itself; it is skipped, like the web.
      if (v === v) {
        if (!seen) {
          lo = v
          hi = v
          seen = true
        } else {
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
    }
    if (seen) {
      const safe: Double[] = []
      for (let i = 0; i < values.length; i++) {
        const v = values[i]!
        safe.push(v !== v ? lo : v)
      }
      const pts = layoutSeriesPoints(safe, strip, { min: lo < 0.0 ? lo : 0.0, max: hi <= lo ? lo + 1.0 : hi })
      const last = pts[pts.length - 1]!
      const first = pts[0]!
      const poly: Pt[] = []
      for (let i = 0; i < pts.length; i++) poly.push(pts[i]!)
      poly.push({ x: last.x, y: strip.y + strip.h })
      poly.push({ x: first.x, y: strip.y + strip.h })
      cmds.push({ kind: 'polygon', points: poly, fill: withAlpha(color, 0.35) })
    }
  }
  const bx0 = strip.x + strip.w * win.start
  const bx1 = strip.x + strip.w * win.end
  cmds.push({ kind: 'rect', rect: { x: bx0, y: strip.y, w: bx1 - bx0, h: strip.h }, fill: 'rgba(37,99,235,0.18)' })
  cmds.push({ kind: 'rect', rect: { x: bx0 - 3.0, y: strip.y, w: 6.0, h: strip.h }, fill: '#2563eb' })
  cmds.push({ kind: 'rect', rect: { x: bx1 - 3.0, y: strip.y, w: 6.0, h: strip.h }, fill: '#2563eb' })
  return { cmds, strip, height: NAV_STRIP_HEIGHT }
}

/**
 * What a press at `x` (inside the strip) grabs: 2 = the left handle, 3 = the
 * right handle, 1 = the band (anywhere else in the strip moves it). The
 * caller decides whether the press was inside the strip at all.
 */
export function navigatorHit(strip: Rect, win: ZoomWindow, x: Double): number {
  const bx0 = strip.x + strip.w * win.start
  const bx1 = strip.x + strip.w * win.end
  const dl = x - bx0
  const dr = x - bx1
  if ((dl < 0.0 ? 0.0 - dl : dl) <= HANDLE_GRAB) return 2
  if ((dr < 0.0 ? 0.0 - dr : dr) <= HANDLE_GRAB) return 3
  return 1
}

/**
 * The window after dragging what `kind` grabbed by `deltaFrac` of the strip
 * (from the window the drag STARTED on — the drag is absolute, not
 * incremental). A handle never crosses the other one: the span stays at least
 * the zoom's minimum.
 */
export function navigatorDrag(kind: number, startWin: ZoomWindow, deltaFrac: Double): ZoomWindow {
  if (kind === 2) {
    const s = startWin.start + deltaFrac
    const cap = startWin.end - NAV_MIN_SPAN
    return clampWindow({ start: s < cap ? s : cap, end: startWin.end })
  }
  if (kind === 3) {
    const e = startWin.end + deltaFrac
    const floor = startWin.start + NAV_MIN_SPAN
    return clampWindow({ start: startWin.start, end: e > floor ? e : floor })
  }
  return clampWindow({ start: startWin.start + deltaFrac, end: startWin.end + deltaFrac })
}
