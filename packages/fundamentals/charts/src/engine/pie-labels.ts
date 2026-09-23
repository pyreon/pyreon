// Pie labels as ECharts lays them out: outside the slice on a two-segment guide
// line (the default), inside the ring, or at the centre — and, outside, pushed
// apart vertically so neighbours never overlap, then slid back onto the
// ellipse the guide lines trace (`pieLabelLayout` / `avoidOverlap` /
// `shiftLayoutOnXY`).
//
// Parallel arrays rather than an array of records: every step here mutates a
// label's position in place, and the native targets lower a record to a value
// type whose in-place member write does not reach the array.

import type { ArcGeometry } from './arc'
import type { Double, Pt, Rect } from './types'

export interface PieLabelOptions {
  /** 'outside' (a guide line out to the text), 'inside' (mid-ring) or 'center'. */
  position: string
  /** One per slice, by the slice's INPUT index; '' leaves that slice unlabelled. */
  texts: string[]
  fontSize: Double
  /** The text colour; '' leaves it to the renderer (the theme's text), 'inherit' takes the slice's own. */
  color: string
  /** Draw the guide line (outside labels only). */
  line: boolean
  /** The guide line's colour; '' takes the slice's own. */
  lineColor: string
  /** The guide line's first leg, out from the slice (ECharts' `length`). */
  leg1: Double
  /** Its second, horizontal leg (`length2`). */
  leg2: Double
  /** Space between the line's end and the text. */
  distance: Double
  /** Push outside labels apart so they never overlap (ECharts' `avoidLabelOverlap`). */
  avoidOverlap: boolean
  /** The smallest angle, in degrees, the guide line may turn through (0 leaves it as laid). */
  minTurnAngle: Double
  /** The largest angle, in degrees, the line's first leg may make with the slice's surface normal (0 leaves it). */
  maxSurfaceAngle: Double
  /** A slice narrower than this, in radians, goes unlabelled (ECharts' `minShowLabelAngle`). */
  minAngle: Double
  /** 'truncate' cuts an outside label that would leave the view with '...'; 'none' leaves it whole. */
  overflow: string
  /** The room kept between a truncated label and the view's edge; below 0, ECharts' own (10, or 2 on a small chart). */
  bleedMargin: Double
  /** ECharts' `alignTo`: 'none', 'labelLine' (every label's line ends level with the farthest) or 'edge' (labels at the view's edges). */
  alignTo: string
  /** How far an 'edge' label sits from the view's edge, in pixels… */
  edgeDistance: Double
  /** …or, at 0 and above, as a fraction of the view's width (ECharts' default '25%'). */
  edgePercent: Double
  /** '' (level), 'radial', 'tangential', 'tangential-noflip', or 'fixed' to use `rotateDegrees`. A rotated label skips the overlap pass. */
  rotate: string
  /** ECharts' numeric `rotate`: degrees counter-clockwise. */
  rotateDegrees: Double
}

/** ECharts' defaults: outside, 15 + 30 pixel guide lines, 5 pixels to the text. */
export const PIE_LABEL_DEFAULTS: PieLabelOptions = {
  position: 'outside',
  texts: [],
  fontSize: 12.0,
  color: '',
  line: true,
  lineColor: '',
  leg1: 15.0,
  leg2: 30.0,
  distance: 5.0,
  avoidOverlap: true,
  minTurnAngle: 90.0,
  maxSurfaceAngle: 90.0,
  minAngle: 0.0,
  overflow: 'truncate',
  bleedMargin: -1.0,
  alignTo: 'none',
  edgeDistance: 0.0,
  edgePercent: 0.25,
  rotate: '',
  rotateDegrees: 0.0,
}

export interface PieLabel {
  /** The slice's input index. */
  index: number
  text: string
  at: Pt
  align: 'start' | 'middle' | 'end'
  /** The guide line; empty when there is none. */
  line: Pt[]
  color: string
  lineColor: string
  /** Degrees, clockwise (the draw list's convention); 0 for a level label. */
  rotate: Double
}

/**
 * Place a pie's labels. `radius` / `inner` are the pie's outer and inner radii
 * (a rose slice reaches `inner + reach * (radius - inner)`); `view` is the rect
 * outside labels are kept within vertically — ECharts' whole chart.
 */
export function layoutPieLabels(
  arcs: ArcGeometry[],
  center: Pt,
  radius: Double,
  inner: Double,
  view: Rect,
  o: PieLabelOptions,
  measure: (text: string, size: Double) => Double,
): PieLabel[] {
  const idx: number[] = []
  const texts: string[] = []
  const tx: Double[] = []
  const ty: Double[] = []
  const aligns: string[] = []
  const nxs: Double[] = []
  const nys: Double[] = []
  const outside: boolean[] = []
  const l0x: Double[] = []
  const l0y: Double[] = []
  const l1x: Double[] = []
  const l1y: Double[] = []
  const l2x: Double[] = []
  const l2y: Double[] = []
  // zrender rotations: radians counter-clockwise.
  const rots: Double[] = []
  const isOut = o.position !== 'inside' && o.position !== 'inner' && o.position !== 'center'
  const edgeDist = o.edgePercent >= 0.0 ? o.edgePercent * view.w : o.edgeDistance
  for (const a of arcs) {
    const text = a.index < o.texts.length ? o.texts[a.index]! : ''
    if (text === '' || a.end - a.start < o.minAngle) continue
    const nx = Math.cos(a.mid)
    const ny = Math.sin(a.mid)
    const rs = inner + a.reach * (radius - inner)
    idx.push(a.index)
    texts.push(text)
    nxs.push(nx)
    nys.push(ny)
    outside.push(isOut)
    rots.push(labelRotation(o, a.mid, nx, ny))
    if (o.position === 'center') {
      tx.push(center.x)
      ty.push(center.y)
      aligns.push('middle')
      l0x.push(0.0)
      l0y.push(0.0)
      l1x.push(0.0)
      l1y.push(0.0)
      l2x.push(0.0)
      l2y.push(0.0)
    } else if (!isOut) {
      const x1 = ((rs + inner) / 2.0) * nx + center.x
      const y1 = ((rs + inner) / 2.0) * ny + center.y
      tx.push(x1 + nx * 3.0)
      ty.push(y1 + ny * 3.0)
      aligns.push('middle')
      l0x.push(x1)
      l0y.push(y1)
      l1x.push(x1)
      l1y.push(y1)
      l2x.push(x1)
      l2y.push(y1)
    } else {
      const x1 = rs * nx + center.x
      const y1 = rs * ny + center.y
      const x2 = x1 + nx * (o.leg1 + radius - rs)
      const y2 = y1 + ny * (o.leg1 + radius - rs)
      const x3 = x2 + (nx < 0.0 ? -1.0 : 1.0) * o.leg2
      const edge = o.alignTo === 'edge'
      tx.push(edge ? (nx < 0.0 ? view.x + edgeDist : view.x + view.w - edgeDist) : x3 + (nx < 0.0 ? -o.distance : o.distance))
      ty.push(y2)
      // ECharts: 'left' for nx > 0, 'right' otherwise (a label straight up or down hangs to the left); an edge label hangs inward.
      aligns.push(edge ? (nx > 0.0 ? 'end' : 'start') : nx > 0.0 ? 'start' : 'end')
      l0x.push(x1)
      l0y.push(y1)
      l1x.push(x2)
      l1y.push(y2)
      l2x.push(x3)
      l2y.push(y2)
    }
  }

  let rotated = false
  for (const r of rots) if (r !== 0.0) rotated = true
  if (isOut && o.avoidOverlap && !rotated) {
    // The label's box height as ECharts measures it: one line, a pixel of margin above and below.
    const rh = o.fontSize + 2.0
    // Each label's room between its anchor and the view's edge; a label wider than that is cut (ECharts' `constrainTextWidth`).
    const bleed = o.bleedMargin >= 0.0 ? o.bleedMargin : Math.min(view.w, view.h) > 200.0 ? 10.0 : 2.0
    let leftmost = 1000000000.0
    let rightmost = -1000000000.0
    for (let i = 0; i < tx.length; i++) {
      if (tx[i]! < center.x) leftmost = Math.min(leftmost, tx[i]!)
      else rightmost = Math.max(rightmost, tx[i]!)
    }
    const full: string[] = []
    const fullW: Double[] = []
    const target: Double[] = []
    for (let i = 0; i < tx.length; i++) {
      full.push(texts[i]!)
      const w = measure(texts[i]!, o.fontSize)
      fullW.push(w)
      const onLeft = tx[i]! < center.x
      let room = onLeft ? tx[i]! - view.x - bleed : view.x + view.w - tx[i]! - bleed
      if (o.alignTo === 'edge') room = onLeft ? l2x[i]! - o.distance - view.x - edgeDist : view.x + view.w - edgeDist - l2x[i]! - o.distance
      else if (o.alignTo === 'labelLine') room = onLeft ? leftmost - view.x - bleed : view.x + view.w - rightmost - bleed
      target.push(room)
      if (o.overflow === 'truncate' && room < w) texts[i] = truncateLabel(texts[i]!, room, o.fontSize, measure)
    }
    const left: number[] = []
    const right: number[] = []
    for (let i = 0; i < tx.length; i++) {
      if (tx[i]! < center.x) left.push(i)
      else right.push(i)
    }
    const sides: number[][] = [right, left]
    for (let s = 0; s < 2; s++) {
      const list = sides[s]!
      const dir = s === 0 ? 1.0 : -1.0
      if (list.length < 2) continue
      // 'labelLine': every line on this side ends level with the farthest label.
      if (o.alignTo === 'labelLine') {
        const farthest = s === 0 ? rightmost : leftmost
        for (const i of list) {
          l1x[i] = l1x[i]! + (tx[i]! - farthest)
          tx[i] = farthest
        }
      }
      const moved = shiftOnY(list, ty, rh, view.y, view.y + view.h)
      for (let k = 0; k < moved.order.length; k++) ty[moved.order[k]!] = moved.ys[k]!
      if (moved.adjusted && o.alignTo === 'none') {
        // Slide each label back onto the ellipse its guide lines trace, per half of the pie.
        for (let half = 0; half < 2; half++) {
          let maxY = 0.0
          let rB = 0.0
          const members: number[] = []
          for (const i of moved.order) {
            const bottom = ty[i]! > center.y
            if ((half === 0 && bottom) || (half === 1 && !bottom)) continue
            const dy = Math.abs(ty[i]! - center.y)
            if (dy >= maxY) {
              const dx = tx[i]! - center.x - o.leg2 * dir
              const rA = radius + o.leg1
              rB = Math.abs(dx) < rA ? Math.sqrt((dy * dy) / (1.0 - (dx * dx) / rA / rA)) : rA
              maxY = dy
            }
            members.push(i)
          }
          for (const i of members) {
            const dy = Math.abs(ty[i]! - center.y)
            const rA = radius + o.leg1
            const dx = Math.sqrt(Math.abs((1.0 - (dy * dy) / (rB * rB)) * rA * rA))
            const nx = center.x + (dx + o.leg2) * dir
            // The label's room moved with it: cut it afresh from the whole text.
            const room = target[i]! - (nx - tx[i]!) * dir
            if (o.overflow === 'truncate') texts[i] = room > fullW[i]! ? full[i]! : truncateLabel(full[i]!, room, o.fontSize, measure)
            tx[i] = nx
          }
        }
      }
    }
    // The guide line's elbow and end follow the moved text; an edge label's line stops at its text.
    for (let i = 0; i < tx.length; i++) {
      const dist = l1x[i]! - l2x[i]!
      const onLeft = tx[i]! < center.x
      if (o.alignTo === 'edge') {
        const w = measure(texts[i]!, o.fontSize)
        l2x[i] = onLeft ? view.x + edgeDist + w + o.distance : view.x + view.w - edgeDist - w - o.distance
      } else {
        l2x[i] = onLeft ? tx[i]! + o.distance : tx[i]! - o.distance
        l1x[i] = l2x[i]! + dist
      }
      l1y[i] = ty[i]!
      l2y[i] = ty[i]!
    }
  }

  const out: PieLabel[] = []
  for (let i = 0; i < tx.length; i++) {
    const color = colorOf(arcs, idx[i]!)
    const line: Pt[] = []
    if (outside[i]! && o.line) {
      const p1 = limitLine(l0x[i]!, l0y[i]!, l1x[i]!, l1y[i]!, l2x[i]!, l2y[i]!, nxs[i]!, nys[i]!, o.minTurnAngle, o.maxSurfaceAngle)
      line.push({ x: l0x[i]!, y: l0y[i]! })
      line.push(p1)
      line.push({ x: l2x[i]!, y: l2y[i]! })
    }
    const al = aligns[i]!
    out.push({
      index: idx[i]!,
      text: texts[i]!,
      at: { x: tx[i]!, y: ty[i]! },
      align: al === 'start' ? 'start' : al === 'end' ? 'end' : 'middle',
      line,
      color: o.color === 'inherit' ? color : o.color,
      lineColor: o.lineColor === '' ? color : o.lineColor,
      rotate: rots[i]! === 0.0 ? 0.0 : (-rots[i]! * 180.0) / Math.PI,
    })
  }
  return out
}

/** A label's rotation as ECharts computes it: zrender radians, counter-clockwise. */
function labelRotation(o: PieLabelOptions, mid: Double, nx: Double, ny: Double): Double {
  if (o.rotate === 'fixed') return (o.rotateDegrees * Math.PI) / 180.0
  if (o.position === 'center') return 0.0
  if (o.rotate === 'radial') return nx < 0.0 ? -mid + Math.PI : -mid
  // ECharts only turns an outside label for plain 'tangential' ('tangential-noflip' applies inside).
  const out = o.position !== 'inside' && o.position !== 'inner'
  if (o.rotate === 'tangential' || (o.rotate === 'tangential-noflip' && !out)) {
    let rad = Math.atan2(nx, ny)
    if (rad < 0.0) rad = Math.PI * 2.0 + rad
    if (ny > 0.0 && o.rotate !== 'tangential-noflip') rad = Math.PI + rad
    return rad - Math.PI
  }
  return 0.0
}

/**
 * zrender's `truncateText` on one line: fit `text` into `width`, ending it in
 * '...' (dropped when even that does not fit). Two refining passes, as zrender's.
 */
export function truncateLabel(text: string, width: Double, size: Double, measure: (text: string, size: Double) => Double): string {
  const container = Math.max(0.0, width - 1.0)
  if (container <= 0.0) return ''
  let ellipsis = '...'
  let ellipsisW = measure(ellipsis, size)
  if (ellipsisW > container) {
    ellipsis = ''
    ellipsisW = 0.0
  }
  const content = container - ellipsisW
  let line = text
  let lineW = measure(line, size)
  if (lineW <= container) return line
  for (let j = 0; j < 3; j++) {
    if (lineW <= content || j >= 2) {
      line = line + ellipsis
      break
    }
    let sub = 0
    if (j === 0) {
      // As many characters as fit, measured one at a time.
      let w = 0.0
      while (sub < line.length && w < content) {
        w = w + measure(line.slice(sub, sub + 1), size)
        sub = sub + 1
      }
    } else if (lineW > 0.0) {
      // The whole characters in proportion to the room: floor(length * content / width).
      const limit = line.length * content
      let more = true
      // A Double twin of the count: the width it asks for is fractional.
      let count = 0.0
      while (more && sub < line.length) {
        const need = lineW * (count + 1.0)
        if (need <= limit) {
          sub = sub + 1
          count = count + 1.0
        } else more = false
      }
    }
    line = line.slice(0, sub)
    lineW = measure(line, size)
  }
  return line
}

/** The colour of the slice at input index `index`, or '' when no arc has it. */
function colorOf(arcs: ArcGeometry[], index: number): string {
  for (const a of arcs) if (a.index === index) return a.slice.color
  return ''
}

/** Labels after the overlap pass: their order by position, their new y in that order, and whether any moved. */
export type Shifted = { order: number[]; ys: Double[]; adjusted: boolean }

/**
 * ECharts' `shiftLayoutOnXY` on y: push boxes (height `rh`, centred on each
 * y) down past their predecessors, then pull the column back inside
 * [minBound, maxBound], squeezing the gaps when it does not fit.
 */
export function shiftOnY(list: number[], ty: Double[], rh: Double, minBound: Double, maxBound: Double): Shifted {
  const order: number[] = []
  for (const i of list) order.push(i)
  order.sort((a, b) => ty[a]! - ty[b]!)
  const len = order.length
  const start: Double[] = []
  for (const i of order) start.push(ty[i]!)
  if (len < 2) return { order, ys: start, adjusted: false }
  const half = rh / 2.0
  const p0: Double[] = []
  let lastPos = 0.0
  for (let k = 0; k < len; k++) {
    const delta = start[k]! - half - lastPos
    const y = delta < 0.0 ? start[k]! - delta : start[k]!
    p0.push(y)
    lastPos = y - half + rh
  }
  const gapTop = (pos: Double[]): Double => pos[0]! - half - minBound
  const gapBottom = (pos: Double[]): Double => maxBound - (pos[len - 1]! - half) - rh
  const p1 = gapTop(p0) < 0.0 ? squeezeGaps(p0, rh, -gapTop(p0), 0.8) : p0
  const p2 = gapBottom(p1) < 0.0 ? squeezeGaps(p1, rh, gapBottom(p1), 0.8) : p1
  const p3 = takeBoundsGap(p2, rh, gapTop(p2), gapBottom(p2), 1.0)
  const p4 = takeBoundsGap(p3, rh, gapBottom(p3), gapTop(p3), -1.0)
  const p5 = gapTop(p4) < 0.0 ? squeezeWhenBailout(p4, -gapTop(p4)) : p4
  const pos = gapBottom(p5) < 0.0 ? squeezeWhenBailout(p5, gapBottom(p5)) : p5
  let adjusted = false
  for (let k = 0; k < len; k++) if (pos[k]! !== start[k]!) adjusted = true
  return { order, ys: pos, adjusted }
}

/** Move positions [from, to) by `d`. */
function shiftRange(pos: Double[], d: Double, from: number, to: number): Double[] {
  const out: Double[] = []
  for (let k = 0; k < pos.length; k++) out.push(k >= from && k < to ? pos[k]! + d : pos[k]!)
  return out
}

/** Close up to `maxPct` of the gaps between boxes to move the column by `d`. */
function squeezeGaps(pos0: Double[], rh: Double, d: Double, maxPct: Double): Double[] {
  const len = pos0.length
  const gaps: Double[] = []
  let total = 0.0
  for (let k = 1; k < len; k++) {
    const g = Math.max(pos0[k]! - pos0[k - 1]! - rh, 0.0)
    gaps.push(g)
    total = total + g
  }
  if (total === 0.0) return pos0
  const pct = Math.min(Math.abs(d) / total, maxPct)
  let pos = pos0
  if (d > 0.0) {
    for (let k = 0; k < len - 1; k++) pos = shiftRange(pos, gaps[k]! * pct, 0, k + 1)
  } else {
    for (let k = len - 1; k > 0; k--) pos = shiftRange(pos, -gaps[k - 1]! * pct, k, len)
  }
  return pos
}

/** Take an overrun at one bound out of the room at the other, then out of the gaps. */
function takeBoundsGap(pos0: Double[], rh: Double, gapThis: Double, gapOther: Double, moveDir: Double): Double[] {
  if (gapThis >= 0.0) return pos0
  const moveFromOther = Math.min(gapOther, -gapThis)
  if (moveFromOther > 0.0) {
    const pos = shiftRange(pos0, moveFromOther * moveDir, 0, pos0.length)
    const remained = moveFromOther + gapThis
    return remained < 0.0 ? squeezeGaps(pos, rh, -remained * moveDir, 1.0) : pos
  }
  return squeezeGaps(pos0, rh, -gapThis * moveDir, 1.0)
}

/** No room left: overlap the boxes evenly rather than leave the bounds. */
function squeezeWhenBailout(pos0: Double[], d: Double): Double[] {
  const len = pos0.length
  const dir = d < 0.0 ? -1.0 : 1.0
  let rest = Math.abs(d)
  const each = Math.ceil(rest / (len - 1))
  let pos = pos0
  for (let k = 0; k < len - 1; k++) {
    pos = dir > 0.0 ? shiftRange(pos, each, 0, k + 1) : shiftRange(pos, -each, len - k - 1, len)
    rest = rest - each
    if (rest <= 0.0) return pos
  }
  return pos
}

/**
 * ECharts' `limitTurnAngle` then `limitSurfaceAngle`: move the guide line's
 * elbow so the line never doubles back on itself, and its first leg never
 * dives into the slice. Returns the new elbow.
 */
export function limitLine(
  x0: Double,
  y0: Double,
  x1: Double,
  y1: Double,
  x2: Double,
  y2: Double,
  nx: Double,
  ny: Double,
  minTurnDeg: Double,
  maxSurfaceDeg: Double,
): Pt {
  let ex = x1
  let ey = y1
  if (minTurnDeg <= 180.0 && minTurnDeg > 0.0) {
    const turn = (minTurnDeg / 180.0) * Math.PI
    const ax = x0 - ex
    const ay = y0 - ey
    const bx = x2 - ex
    const by = y2 - ey
    const la = Math.sqrt(ax * ax + ay * ay)
    const lb = Math.sqrt(bx * bx + by * by)
    if (la >= 0.001 && lb >= 0.001) {
      const ux = bx / lb
      const uy = by / lb
      const turnCos = (ax / la) * ux + (ay / la) * uy
      if (Math.cos(turn) < turnCos) {
        const proj = project(ex, ey, x2, y2, x0, y0)
        const px = proj.x + ux * (proj.d / Math.tan(Math.PI - turn))
        const py = proj.y + uy * (proj.d / Math.tan(Math.PI - turn))
        const t = x2 !== ex ? (px - ex) / (x2 - ex) : (py - ey) / (y2 - ey)
        if (t === t) {
          if (t < 0.0) {
            // The elbow stays put.
          } else if (t > 1.0) {
            ex = x2
            ey = y2
          } else {
            ex = px
            ey = py
          }
        }
      }
    }
  }
  if (maxSurfaceDeg <= 180.0 && maxSurfaceDeg > 0.0) {
    const surf = (maxSurfaceDeg / 180.0) * Math.PI
    const ax = ex - x0
    const ay = ey - y0
    const bx = x2 - ex
    const by = y2 - ey
    const la = Math.sqrt(ax * ax + ay * ay)
    const lb = Math.sqrt(bx * bx + by * by)
    if (la >= 0.001 && lb >= 0.001) {
      const ux = bx / lb
      const uy = by / lb
      const surfCos = (ax / la) * nx + (ay / la) * ny
      if (surfCos < Math.cos(surf)) {
        const proj = project(ex, ey, x2, y2, x0, y0)
        const angle2 = Math.acos(ux * nx + uy * ny)
        const newAngle = Math.PI / 2.0 + angle2 - surf
        if (newAngle >= Math.PI / 2.0) {
          ex = x2
          ey = y2
        } else {
          const px = proj.x + ux * (proj.d / Math.tan(Math.PI / 2.0 - newAngle))
          const py = proj.y + uy * (proj.d / Math.tan(Math.PI / 2.0 - newAngle))
          const t = x2 !== ex ? (px - ex) / (x2 - ex) : (py - ey) / (y2 - ey)
          if (t === t) {
            if (t < 0.0) {
              // The elbow stays put.
            } else if (t > 1.0) {
              ex = x2
              ey = y2
            } else {
              ex = px
              ey = py
            }
          }
        }
      }
    }
  }
  return { x: ex, y: ey }
}

/** A point projected onto the line through (x1, y1)–(x2, y2), and its distance from the line. */
export type Projection = { x: Double; y: Double; d: Double }

function project(x1: Double, y1: Double, x2: Double, y2: Double, x: Double, y: Double): Projection {
  const dx1r = x2 - x1
  const dy1r = y2 - y1
  const len = Math.sqrt(dx1r * dx1r + dy1r * dy1r)
  const ux = dx1r / len
  const uy = dy1r / len
  const t = (x - x1) * ux + (y - y1) * uy
  const ox = x1 + t * ux
  const oy = y1 + t * uy
  return { x: ox, y: oy, d: Math.sqrt((ox - x) * (ox - x) + (oy - y) * (oy - y)) }
}
