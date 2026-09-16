// ECharts' `graphic` elements as draw-list geometry.
//
// The option facade resolves each element's POSITION (x/y, left/top,
// right/bottom, and a group's offset) against the canvas and hands this module
// a flat, already-absolute description. Everything below is pure geometry, so
// the same elements draw on the web canvas, in SVG and — through the generated
// engine — on iOS and Android.
//
// One flat struct rather than a discriminated union: the native struct
// synthesizer needs a concrete field type for every field, and an optional it
// cannot narrow is worse than a field that some kinds ignore.

import { arcPolygon } from './arc'
import type { DrawCmd, Double, Pt } from './types'

/** A `graphic` element, positioned and styled — `kind` says which fields matter. */
export interface GraphicElement {
  /** text | rect | circle | line | polygon | polyline | arc | ring | sector | bezier */
  kind: string
  /** The element's resolved origin; every shape field below is relative to it. */
  x: Double
  y: Double
  /** rect: its size. */
  w: Double
  h: Double
  fill: string
  stroke: string
  lineWidth: Double
  /** text: its content, size and horizontal anchor (`start` | `middle` | `end`). */
  text: string
  fontSize: Double
  align: string
  /** circle / arc / ring / sector: the centre, the outer radius, and the inner radius (ring, sector). */
  cx: Double
  cy: Double
  r: Double
  r0: Double
  /** arc / sector: the sweep, in radians, and which way it runs. */
  startAngle: Double
  endAngle: Double
  clockwise: boolean
  /**
   * line: `[from, to]`. polygon / polyline: the vertices. bezier: the control
   * polygon — 3 points is a quadratic, 4 a cubic.
   */
  points: Pt[]
}

// `arc.ts` owns the module-level `TAU`; the generated engine flattens every
// module into one namespace, so a second one is a redeclaration.
const FULL_TURN = Math.PI * 2.0
/** Samples along a bezier — the same order the arc tessellation uses, so the two read alike at any size. */
const BEZIER_STEPS = 48

/**
 * The forward sweep that draws the intended region.
 *
 * `arcPolygon` always walks forward from its start, so a counter-clockwise
 * element is expressed as the same arc walked from its END. Angles run
 * clockwise on screen because the canvas y axis points down, which is the
 * sense ECharts' `clockwise: true` default already has.
 */
export function arcSweep(startAngle: Double, endAngle: Double, clockwise: boolean): Pt {
  let from = clockwise ? startAngle : endAngle
  let to = clockwise ? endAngle : startAngle
  if (to < from) to = to + FULL_TURN * Math.ceil((from - to) / FULL_TURN)
  if (to - from > FULL_TURN) to = from + FULL_TURN
  return { x: from, y: to }
}

/** A cubic (4 control points) or quadratic (3) bezier, sampled into a polyline. */
export function bezierPoints(control: Pt[]): Pt[] {
  const out: Pt[] = []
  if (control.length < 3) return control
  const cubic = control.length >= 4
  const p0 = control[0]!
  const c1 = control[1]!
  const c2 = cubic ? control[2]! : control[1]!
  const p1 = cubic ? control[3]! : control[2]!
  for (let i = 0; i <= BEZIER_STEPS; i++) {
    const t = i / BEZIER_STEPS
    const u = 1.0 - t
    const x = u * u * u * p0.x + 3.0 * u * u * t * c1.x + 3.0 * u * t * t * c2.x + t * t * t * p1.x
    const y = u * u * u * p0.y + 3.0 * u * u * t * c1.y + 3.0 * u * t * t * c2.y + t * t * t * p1.y
    out.push({ x, y })
  }
  return out
}

/** The commands one graphic element draws — empty when it describes nothing (a zero radius, one point). */
export function graphicElementCommands(e: GraphicElement): DrawCmd[] {
  const out: DrawCmd[] = []
  const at = (p: Pt): Pt => ({ x: e.x + p.x, y: e.y + p.y })
  const centre: Pt = { x: e.x + e.cx, y: e.y + e.cy }
  if (e.kind === 'text') {
    const align = e.align === 'middle' ? 'middle' : e.align === 'end' ? 'end' : 'start'
    out.push({ kind: 'text', text: e.text, at: { x: e.x, y: e.y }, fill: e.fill, size: e.fontSize, align, baseline: 'top' })
    return out
  }
  if (e.kind === 'rect') {
    out.push({ kind: 'rect', rect: { x: e.x + e.cx, y: e.y + e.cy, w: e.w, h: e.h }, fill: e.fill })
    return out
  }
  if (e.kind === 'circle') {
    out.push({ kind: 'circle', center: centre, radius: e.r, fill: e.fill })
    return out
  }
  if (e.kind === 'line') {
    const zero: Pt = { x: 0.0, y: 0.0 }
    out.push({ kind: 'line', from: at(e.points.length > 0 ? e.points[0]! : zero), to: at(e.points.length > 1 ? e.points[1]! : zero), stroke: e.stroke, width: e.lineWidth })
    return out
  }
  if (e.kind === 'polygon') {
    const pts = e.points.map(at)
    if (pts.length >= 2) out.push({ kind: 'polygon', points: pts, fill: e.fill })
    return out
  }
  if (e.kind === 'polyline') {
    const pts = e.points.map(at)
    if (pts.length >= 2) out.push({ kind: 'polyline', points: pts, stroke: e.stroke, width: e.lineWidth })
    return out
  }
  if (e.kind === 'bezier') {
    const pts = bezierPoints(e.points).map(at)
    if (pts.length >= 2) out.push({ kind: 'polyline', points: pts, stroke: e.stroke, width: e.lineWidth })
    return out
  }
  if (e.kind === 'ring') {
    // A full band: the inner radius is the hole.
    if (e.r > 0.0) out.push({ kind: 'polygon', points: arcPolygon(centre, e.r, e.r0, 0.0, FULL_TURN), fill: e.fill })
    return out
  }
  if (e.kind === 'sector') {
    const sweep = arcSweep(e.startAngle, e.endAngle, e.clockwise)
    if (e.r > 0.0 && sweep.y > sweep.x) out.push({ kind: 'polygon', points: arcPolygon(centre, e.r, e.r0, sweep.x, sweep.y), fill: e.fill })
    return out
  }
  if (e.kind === 'arc') {
    // An OPEN arc: the outer edge only, stroked — a sector's outline would
    // close through the centre, which is a different shape.
    const sweep = arcSweep(e.startAngle, e.endAngle, e.clockwise)
    if (e.r > 0.0 && sweep.y > sweep.x) {
      // A zero inner radius makes `arcPolygon` close through the CENTRE, so the
      // outer edge is every point but the last. (Halving a two-edge band would
      // need `length / 2` as an Int, which the native subset does not give.)
      const fan = arcPolygon(centre, e.r, 0.0, sweep.x, sweep.y)
      const edge: Pt[] = []
      for (let i = 0; i < fan.length - 1; i++) edge.push(fan[i]!)
      if (edge.length >= 2) out.push({ kind: 'polyline', points: edge, stroke: e.stroke, width: e.lineWidth })
    }
    return out
  }
  return out
}

/** Every element's commands, in order — later elements paint over earlier ones. */
export function graphicDrawCommands(elements: GraphicElement[]): DrawCmd[] {
  const out: DrawCmd[] = []
  for (const e of elements) for (const c of graphicElementCommands(e)) out.push(c)
  return out
}
