// The brush — ECharts' brush / Highcharts' zoom-select, engine-shaped: which
// GLOBAL datum range a pixel span selects under the current window, where a
// committed selection sits on the plot, and how the band is drawn. The web
// host, iOS and Android hold the selection as state and ask these the same
// questions, so a brush means one thing on every target.

import type { DrawCmd, Double, Rect } from './types'
import { sliceRange } from './zoom'
import type { ZoomWindow } from './zoom'

/** A committed brush: GLOBAL, inclusive datum indices. */
export interface BrushRange {
  start: number
  end: number
}

/** Where a committed brush lands on the plot; `visible` is false when the window zoomed it away entirely. */
export interface BrushBand {
  visible: boolean
  lo: Double
  hi: Double
}

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
): BrushRange {
  const lo = x1 < x2 ? x1 : x2
  const hi = x1 < x2 ? x2 : x1
  const span = win.end - win.start
  const rawLo = plotW <= 0.0 ? 0.0 : (lo - plotX) / plotW
  const rawHi = plotW <= 0.0 ? 0.0 : (hi - plotX) / plotW
  const cLo = rawLo < 0.0 ? 0.0 : rawLo > 1.0 ? 1.0 : rawLo
  const cHi = rawHi < 0.0 ? 0.0 : rawHi > 1.0 ? 1.0 : rawHi
  const r = sliceRange({ start: win.start + cLo * span, end: win.start + cHi * span }, n)
  return { start: r.from, end: r.to - 1 }
}

/** An index difference as a Double — negative when the selection sits before the visible slice. */
export function countToDouble(k: number): Double {
  let f = 0.0
  if (k >= 0) {
    for (let i = 0; i < k; i++) f = f + 1.0
  } else {
    for (let i = 0; i < 0 - k; i++) f = f - 1.0
  }
  return f
}

/**
 * Place a committed (GLOBAL) selection over the datum bands of the visible
 * slice, clipped to the plot when partly zoomed away.
 */
export function brushBand(plot: Rect, sel: BrushRange, win: ZoomWindow, n: number): BrushBand {
  const r = sliceRange(win, n)
  const nView = r.to - r.from
  if (nView <= 0) return { visible: false, lo: 0.0, hi: 0.0 }
  const bw = plot.w / countToDouble(nView)
  let lo = plot.x + countToDouble(sel.start - r.from) * bw
  let hi = plot.x + countToDouble(sel.end - r.from + 1) * bw
  if (hi < plot.x || lo > plot.x + plot.w) return { visible: false, lo: 0.0, hi: 0.0 }
  if (lo < plot.x) lo = plot.x
  if (hi > plot.x + plot.w) hi = plot.x + plot.w
  return { visible: true, lo, hi }
}

/** The band between two plot x's: a translucent rect and two dashed edges, in PLOT space. */
export function renderBrushBand(plot: Rect, lo: Double, hi: Double, edge: string): DrawCmd[] {
  const out: DrawCmd[] = []
  out.push({ kind: 'rect', rect: { x: lo, y: plot.y, w: hi - lo, h: plot.h }, fill: 'rgba(99,102,241,0.15)' })
  out.push({ kind: 'line', from: { x: lo, y: plot.y }, to: { x: lo, y: plot.y + plot.h }, stroke: edge, width: 1.0, dash: [3.0, 3.0] })
  out.push({ kind: 'line', from: { x: hi, y: plot.y }, to: { x: hi, y: plot.y + plot.h }, stroke: edge, width: 1.0, dash: [3.0, 3.0] })
  return out
}
