// A slider zoom strip — the look of ECharts' slider dataZoom — as draw-list
// geometry: where the strip sits and what it draws. `<CandlestickChart>` draws
// it under its plot. PlotChart's own navigator (navigator.ts) keeps its own
// look.
//
// Placement: the box is laid out with `frameView` — the plot's width and right
// edge, `height` 30, its top 30 + 15 (the edge gap) + 7 (the brush's move
// handle) above the chart's bottom — each replaced by a box key the caller
// sets, a side that is set winning over the opposite default. The drawn group
// is then shifted so its BOUNDING box (the move handle above the strip, the
// handles' outline beside it) starts at that box: the strip itself lands
// 6.5px below and ~2.8px right of it.

import { frameView } from './frame'
import type { FrameLength, FrameSpec } from './frame'
import { isFiniteNumber } from './scale'
import type { DrawCmd, Double, Pt, Rect } from './types'
import type { ZoomWindow } from './zoom'

/** The slider's box keys ('' mode = unset), and whether the brush's move handle shows. */
export interface SliderBox {
  left: FrameLength
  top: FrameLength
  right: FrameLength
  bottom: FrameLength
  width: FrameLength
  height: FrameLength
  brush: boolean
}

const FILLER = 30.0
const EDGE_GAP = 15.0
const MOVE_HANDLE = 7.0

/**
 * The strip's rect in the chart's coordinates, under a plot at `plot` in a
 * `width` × `height` chart.
 */
export function sliderRect(box: SliderBox, plot: Rect, width: Double, height: Double): Rect {
  const moveHandle = box.brush ? MOVE_HANDLE : 0.0
  const unset: FrameLength = { mode: '', amount: 0.0 }
  const spec: FrameSpec = {
    left: box.left,
    // A side that is set replaces the default on the side opposite it.
    right: box.right.mode !== '' ? box.right : box.left.mode !== '' ? unset : { mode: 'px', amount: width - plot.x - plot.w },
    top: box.top.mode !== '' ? box.top : box.bottom.mode !== '' ? unset : { mode: 'px', amount: height - FILLER - EDGE_GAP - moveHandle },
    bottom: box.bottom,
    width: box.width.mode !== '' ? box.width : { mode: 'px', amount: plot.w },
    height: box.height.mode !== '' ? box.height : { mode: 'px', amount: FILLER },
  }
  const r = frameView(spec, width, height)
  return { x: r.x + (box.brush ? 2.8 : 2.5), y: r.y + (box.brush ? 6.5 : 0.0), w: r.w, h: r.h }
}

/** The part of an x-sorted run that lies in [x0, x1], cut at both ends. */
function cutRun(pts: Pt[], x0: Double, x1: Double): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    if (i > 0) {
      const q = pts[i - 1]!
      // Where the segment q→p crosses a cut, the crossing is a point of the run.
      if (q.x < x0 && p.x > x0) out.push({ x: x0, y: q.y + ((p.y - q.y) * (x0 - q.x)) / (p.x - q.x) })
      if (q.x < x1 && p.x > x1 && x1 > x0) out.push({ x: x1, y: q.y + ((p.y - q.y) * (x1 - q.x)) / (p.x - q.x) })
    }
    if (p.x >= x0 && p.x <= x1) out.push(p)
  }
  return out
}

/** The run closed down to `base` — an empty list when the run has no length. */
function shadowArea(run: Pt[], base: Double, fill: string): DrawCmd[] {
  const out: DrawCmd[] = []
  if (run.length < 2) return out
  const poly: Pt[] = []
  for (let i = 0; i < run.length; i++) poly.push(run[i]!)
  poly.push({ x: run[run.length - 1]!.x, y: base })
  poly.push({ x: run[0]!.x, y: base })
  out.push({ kind: 'polygon', points: poly, fill })
  return out
}

/**
 * The strip as ECharts draws it: the data shadow of `values` (the first
 * series over every row — dimmer outside the window), the window's filler,
 * the brush's move handle above it, the two handles and the border.
 */
export function renderSliderZoom(values: Double[], win: ZoomWindow, strip: Rect, brush: boolean): DrawCmd[] {
  const cmds: DrawCmd[] = []
  const x0 = strip.x + strip.w * win.start
  const x1 = strip.x + strip.w * win.end
  const bottom = strip.y + strip.h
  // The shadow: ECharts maps the values over their extent padded by 30% of
  // the span each side, from the strip's bottom up.
  let lo = 0.0
  let hi = 0.0
  let seen = false
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    if (isFiniteNumber(v)) {
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
  if (seen && values.length > 1) {
    const span = hi - lo
    const a = lo - span * 0.3
    const b = hi + span * 0.3
    const pts: Pt[] = []
    const n = values.length
    // The step accumulates rather than multiplying by the index, so the native
    // ports (which cannot mix a Double and an Int) read it the same way.
    let gaps = 0.0
    for (let i = 1; i < n; i++) gaps = gaps + 1.0
    const step = strip.w / gaps
    let px = strip.x
    for (let i = 0; i < n; i++) {
      const v = values[i]!
      const u = !isFiniteNumber(v) ? lo : v
      const f = b > a ? (u - a) / (b - a) : 0.5
      pts.push({ x: px, y: bottom - f * strip.h })
      px = px + step
    }
    const before = cutRun(pts, strip.x, x0)
    const inside = cutRun(pts, x0, x1)
    const after = cutRun(pts, x1, strip.x + strip.w)
    for (const c of shadowArea(before, bottom, 'rgba(192,201,230,0.2)')) cmds.push(c)
    for (const c of shadowArea(inside, bottom, 'rgba(192,201,230,0.3)')) cmds.push(c)
    for (const c of shadowArea(after, bottom, 'rgba(192,201,230,0.2)')) cmds.push(c)
    if (before.length > 1) cmds.push({ kind: 'polyline', points: before, stroke: '#a1aed9', width: 0.5 })
    if (inside.length > 1) cmds.push({ kind: 'polyline', points: inside, stroke: '#8292cc', width: 0.5 })
    if (after.length > 1) cmds.push({ kind: 'polyline', points: after, stroke: '#a1aed9', width: 0.5 })
  }
  cmds.push({ kind: 'rect', rect: { x: x0, y: strip.y, w: x1 - x0, h: strip.h }, fill: 'rgba(135,175,255,0.2)' })
  // The border, at ECharts' half-pixel inset.
  const bx = strip.x + 0.5
  const by = strip.y + 0.5
  const bw = strip.w - 1.0
  const bh = strip.h - 1.0
  cmds.push({ kind: 'polyline', points: [{ x: bx, y: by }, { x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, { x: bx, y: by + bh }, { x: bx, y: by }], stroke: '#e0e4f2', width: 1.0 })
  // The brush's move handle: a 7px tab over the window, rounded at its top.
  if (brush) cmds.push({ kind: 'rect', rect: { x: x0, y: strip.y - 6.5, w: x1 - x0, h: 7.0 }, fill: 'rgba(130,146,204,0.5)', corners: [2.0, 2.0, 0.0, 0.0] })
  // The handles: ECharts' icon at `handleSize` 100% of the strip — a stem
  // with a rounded grip, 1px inside each end of the window.
  const s = strip.h / 2.0
  const ends: Double[] = [x0 + 1.0, x1 - 1.0]
  for (let k = 0; k < ends.length; k++) {
    const hx = ends[k]!
    cmds.push({ kind: 'line', from: { x: hx, y: strip.y }, to: { x: hx, y: strip.y + 0.38 * s }, stroke: '#c0c9e6', width: 1.0 })
    cmds.push({ kind: 'line', from: { x: hx, y: strip.y + 1.63 * s }, to: { x: hx, y: bottom }, stroke: '#c0c9e6', width: 1.0 })
    const grip: Rect = { x: hx - 0.2 * s, y: strip.y + 0.37 * s, w: 0.4 * s, h: 1.26 * s }
    const r = 0.1 * s
    cmds.push({ kind: 'rect', rect: grip, fill: '#ffffff', corners: [r, r, r, r] })
    cmds.push({ kind: 'polyline', points: [{ x: grip.x, y: grip.y }, { x: grip.x + grip.w, y: grip.y }, { x: grip.x + grip.w, y: grip.y + grip.h }, { x: grip.x, y: grip.y + grip.h }, { x: grip.x, y: grip.y }], stroke: '#c0c9e6', width: 1.0 })
  }
  return cmds
}
