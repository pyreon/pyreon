// ECharts' `lines` series — polylines through data coordinates, with the
// optional animated trail (`effect`): a bright segment of the path that runs
// head-first along each line and loops, the look of a route map.
//
// The trail is a pure function of TIME. A host drives `time` from a frame
// clock (and holds it at 0 under reduced motion); the engine never keeps
// state, so one frame is as testable as any other and web and native draw the
// same pixels for the same instant.

import { withAlpha } from './radar'
import { scaleLinear } from './scale'
import type { Domain, Double, DrawCmd, Pt, Rect } from './types'

export interface LinesSeries {
  /** One flat `[x0, y0, x1, y1, …]` list per line, in data coordinates. */
  coords: Double[][]
  /** Per-line stroke colour and width (index-aligned with `coords`). */
  colors: string[]
  widths: Double[]
  /** Draw the moving trail. */
  effect: boolean
  /** Seconds for the head to travel a whole line once. */
  period: Double
  /** The trail's share of the line, 0..1. */
  trailLength: Double
  /** Trail colour; empty takes the line's own colour. */
  effectColor: string
  /** The head's diameter in pixels. */
  symbolSize: Double
}

/** The points of line `i` placed on the plot. */
export function linePixels(flat: Double[], plot: Rect, xDomain: Domain, yDomain: Domain): Pt[] {
  const out: Pt[] = []
  let k = 0
  while (k + 1 < flat.length) {
    out.push({ x: scaleLinear(xDomain, plot.x, plot.x + plot.w, flat[k]!), y: scaleLinear(yDomain, plot.y + plot.h, plot.y, flat[k + 1]!) })
    k = k + 2
  }
  return out
}

/** The point `dist` pixels along a polyline (clamped to its ends). */
export function pointAlong(pts: Pt[], dist: Double): Pt {
  if (pts.length === 0) return { x: 0.0, y: 0.0 }
  let remaining = dist
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const seg = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))
    if (remaining <= seg && seg > 0.0) {
      const f = remaining / seg
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
    }
    remaining = remaining - seg
  }
  return pts[pts.length - 1]!
}

/** The stretch of a polyline between two distances along it, both ends included. */
export function subPath(pts: Pt[], from: Double, to: Double): Pt[] {
  const out: Pt[] = []
  if (pts.length < 2 || to <= from) return out
  out.push(pointAlong(pts, from))
  let walked = 0.0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    walked = walked + Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))
    if (walked > from && walked < to) out.push(b)
  }
  out.push(pointAlong(pts, to))
  return out
}

/** Total pixel length of a polyline. */
export function pathLength(pts: Pt[]): Double {
  let total = 0.0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    total = total + Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))
  }
  return total
}

/**
 * Draw a lines series at `time` seconds: every line as a polyline, then, when
 * the effect is on, each line's trail and head. The head sits at
 * `(time / period) mod 1` of the way along its line.
 */
export function linesCommands(s: LinesSeries, plot: Rect, xDomain: Domain, yDomain: Domain, time: Double): DrawCmd[] {
  const out: DrawCmd[] = []
  for (let i = 0; i < s.coords.length; i++) {
    const pts = linePixels(s.coords[i]!, plot, xDomain, yDomain)
    if (pts.length < 2) continue
    const color = i < s.colors.length ? s.colors[i]! : '#334155'
    const width = i < s.widths.length ? s.widths[i]! : 1.5
    out.push({ kind: 'polyline', points: pts, stroke: color, width })
  }
  if (!s.effect) return out
  const period = s.period > 0.0 ? s.period : 4.0
  const cycles = time / period
  const phase = cycles - Math.floor(cycles)
  const trail = s.trailLength < 0.0 ? 0.0 : s.trailLength > 1.0 ? 1.0 : s.trailLength
  for (let i = 0; i < s.coords.length; i++) {
    const pts = linePixels(s.coords[i]!, plot, xDomain, yDomain)
    if (pts.length < 2) continue
    const total = pathLength(pts)
    if (!(total > 0.0)) continue
    const color = s.effectColor !== '' ? s.effectColor : i < s.colors.length ? s.colors[i]! : '#334155'
    const width = i < s.widths.length ? s.widths[i]! : 1.5
    const head = phase * total
    const tail = head - trail * total > 0.0 ? head - trail * total : 0.0
    if (trail > 0.0 && head > tail) out.push({ kind: 'polyline', points: subPath(pts, tail, head), stroke: withAlpha(color, 0.85), width: width + 1.0 })
    out.push({ kind: 'circle', center: pointAlong(pts, head), radius: s.symbolSize / 2.0, fill: color })
  }
  return out
}
