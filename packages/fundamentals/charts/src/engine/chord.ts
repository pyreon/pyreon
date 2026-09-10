// Chord — flows between categories drawn as ribbons across a circle, with each
// category holding an arc sized by the total that passes through it.
//
// Written in the native subset and BUNDLED into the generated Swift/Kotlin
// engine (no Infinity sentinels, no spreads, no optional chaining on indices,
// named structs rather than tuples); the svg half lives in family-svg.ts.
//
// The relationship to its neighbours is worth stating, because "we already have
// sankey" is the obvious objection: a sankey lays flows out on an axis, so it
// reads a DIRECTION and needs the graph to be acyclic to look right. A chord
// closes the layout into a circle, which drops the axis and with it the
// acyclicity — so a flow that goes both ways (imports and exports, migration
// between regions, a confusion matrix) is a chord's ordinary case and a
// sankey's awkward one.

import { arcPolygon, fitCircle, pointOnCircle } from './arc'
import { DEFAULT_PALETTE, paletteAt } from './palette'
// `withAlpha` lives in radar.ts and predates chord — reused rather than
// copied. Four modules had already grown their own hex->rgba; this adds none.
import { withAlpha } from './radar'
import { isFiniteNumber } from './scale'
import { approxTextWidth } from './treemap'
import type { Circle } from './arc'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

// Named for this module: the native bundle flattens every engine file into one
// scope, so a bare `TAU` collides with arc.ts's (which is module-private on the
// web and therefore not importable). A local alias is the smallest fix that
// works on both.
const CHORD_TAU = Math.PI * 2.0

export interface ChordNode {
  name: string
  color?: string | undefined
}

export interface ChordLink {
  source: string
  target: string
  value: Double
}

/** A node's arc on the ring, after the gaps are taken out. */
export interface ChordArc {
  index: number
  name: string
  color: string
  start: Double
  end: Double
  /** Total flowing through it — the sum of every link that touches it. */
  total: Double
  /** Outside the ring, where a label sits without overlapping the arc. */
  labelAt: Pt
  /** Anchor side for the label, so text does not read into the circle. */
  labelAlign: 'start' | 'end'
}

/**
 * One flow, as the two spans it occupies.
 *
 * Both ends are kept rather than only the polygon, because a hit test wants the
 * spans and a tooltip wants the endpoints — recovering either from a sampled
 * polygon means guessing which samples belong to which end.
 */
export interface ChordRibbon {
  link: number
  source: number
  target: number
  value: Double
  color: string
  sourceStart: Double
  sourceEnd: Double
  targetStart: Double
  targetEnd: Double
}

export interface ChordLayout {
  arcs: ChordArc[]
  ribbons: ChordRibbon[]
  circle: Circle
  /** Ring thickness in px — the ribbons stop here. */
  thickness: Double
  box: Rect
}

export interface ChordOptions {
  /** Node colours for nodes without one; defaults to the theme palette. */
  palette?: readonly string[] | undefined
  /** Gap between adjacent node arcs, in radians. Default 0.04. */
  padAngle?: Double | undefined
  /** Ring thickness as a fraction of the radius; default 0.08. */
  ringRatio?: Double | undefined
  /** Ribbon fill opacity, 0..1; default 0.62. */
  linkOpacity?: Double | undefined
  showLabels?: boolean | undefined
  fontSize?: Double | undefined
  /**
   * Label text, which sits OUTSIDE the ring on the page ground — so unlike the
   * on-arc families this is theme-derived and defaults to a readable slate.
   */
  labelColor?: string | undefined
  /** Entrance progress 0..1; ribbons grow out of the ring. */
  progress?: Double | undefined
}

function indexOfName(names: string[], name: string): number {
  for (let i = 0; i < names.length; i++) {
    if (names[i] === name) return i
  }
  return -1
}

/**
 * Lay the nodes out around the circle and sub-allocate each arc to its links.
 *
 * A node's arc is sized by the TOTAL through it, and the links inside that arc
 * are packed in the order they appear. Packing in input order rather than
 * sorting is deliberate: a chord redrawn from changing data should keep a given
 * flow in the same place, and a sort makes ribbons jump when a value crosses a
 * neighbour.
 */
export function layoutChord(
  nodes: ChordNode[],
  links: ChordLink[],
  box: Rect,
  options?: ChordOptions,
  measure?: MeasureText,
): ChordLayout {
  const palette = options?.palette ?? DEFAULT_PALETTE
  const padAngle = options?.padAngle ?? 0.04
  const ringRatio = options?.ringRatio ?? 0.08
  const fontSize = options?.fontSize ?? 11.0
  const m: MeasureText = measure ?? approxTextWidth

  const names: string[] = []
  for (const n of nodes) names.push(n.name)

  // Totals first: an arc is sized by everything that touches it, in either
  // direction, so a node that only receives is as visible as one that only
  // sends.
  const totals: Double[] = []
  for (let i = 0; i < names.length; i++) totals.push(0.0)
  const valid: ChordLink[] = []
  for (const l of links) {
    const s = indexOfName(names, l.source)
    const t = indexOfName(names, l.target)
    if (s < 0 || t < 0) continue
    if (!isFiniteNumber(l.value) || l.value <= 0.0) continue
    valid.push(l)
    totals[s] = totals[s]! + l.value
    totals[t] = totals[t]! + l.value
  }

  let grand = 0.0
  for (const t of totals) grand = grand + t

  // Label width decides how much room the ring can take: a long name outside a
  // ring that already fills the box is a name drawn off the edge.
  let widest = 0.0
  if (options?.showLabels !== false) {
    for (const n of names) {
      const w = m(n, fontSize)
      if (w > widest) widest = w
    }
  }
  const outer = fitCircle(box)
  const radius = Math.max(8.0, outer.radius - widest - 8.0)
  const circle: Circle = { center: outer.center, radius }
  const thickness = Math.max(3.0, radius * ringRatio)

  const arcs: ChordArc[] = []
  const ribbons: ChordRibbon[] = []
  if (grand <= 0.0 || names.length === 0) {
    return { arcs, ribbons, circle, thickness, box }
  }

  // Gaps come out of the circle before anything is scaled, so the ribbons stay
  // proportional to the values rather than to what is left over.
  const gaps = padAngle * names.length
  const usable = Math.max(0.0, CHORD_TAU - gaps)

  let angle = -Math.PI / 2.0
  const starts: Double[] = []
  const cursors: Double[] = []
  for (let i = 0; i < names.length; i++) {
    const span = (totals[i]! / grand) * usable
    const start = angle
    const end = angle + span
    const mid = (start + end) / 2.0
    const labelR = radius + 6.0
    const at = pointOnCircle(circle.center, labelR, mid)
    // Right half reads outward from the ring, left half reads inward — so text
    // never crosses the circle it belongs to.
    const cosMid = Math.cos(mid)
    arcs.push({
      index: i,
      name: names[i]!,
      color: nodes[i]!.color ?? paletteAt(palette, i),
      start,
      end,
      total: totals[i]!,
      labelAt: at,
      labelAlign: cosMid >= 0.0 ? 'start' : 'end',
    })
    starts.push(start)
    cursors.push(start)
    angle = end + padAngle
  }

  for (let k = 0; k < valid.length; k++) {
    const l = valid[k]!
    const s = indexOfName(names, l.source)
    const t = indexOfName(names, l.target)
    const span = (l.value / grand) * usable
    const sStart = cursors[s]!
    const sEnd = sStart + span
    cursors[s] = sEnd
    const tStart = cursors[t]!
    const tEnd = tStart + span
    cursors[t] = tEnd
    ribbons.push({
      link: k,
      source: s,
      target: t,
      value: l.value,
      color: arcs[s]!.color,
      sourceStart: sStart,
      sourceEnd: sEnd,
      targetStart: tStart,
      targetEnd: tEnd,
    })
  }

  return { arcs, ribbons, circle, thickness, box }
}

/**
 * The closed shape of one ribbon: along the source span, across to the target
 * span, along it, and back.
 *
 * The crossing is a quadratic Bézier whose control point is the circle's
 * centre, sampled rather than emitted as a curve — the draw list has no curve
 * primitive for the same reason it has no arc one (see `arcPolygon`), and a
 * polygon fills identically on canvas, SVG, Core Graphics and Compose.
 */
export function ribbonPolygon(layout: ChordLayout, r: ChordRibbon, progress: Double): Pt[] {
  const c: Pt = layout.circle.center
  const inner = Math.max(0.0, layout.circle.radius - layout.thickness)
  // Entrance pulls the crossing toward the ring, so ribbons grow inward out of
  // their arcs rather than fading in place.
  const p = progress < 0.0 ? 0.0 : progress > 1.0 ? 1.0 : progress
  const pts: Pt[] = []

  const sSweep = r.sourceEnd - r.sourceStart
  const sSteps = Math.max(2, Math.ceil((Math.abs(sSweep) / CHORD_TAU) * 64.0))
  for (let i = 0; i <= sSteps; i++) {
    pts.push(pointOnCircle(c, inner, r.sourceStart + (sSweep * i) / sSteps))
  }

  const a = pointOnCircle(c, inner, r.sourceEnd)
  const b = pointOnCircle(c, inner, r.targetStart)
  for (const q of quadPoints(a, c, b, p)) pts.push(q)

  const tSweep = r.targetEnd - r.targetStart
  const tSteps = Math.max(2, Math.ceil((Math.abs(tSweep) / CHORD_TAU) * 64.0))
  for (let i = 0; i <= tSteps; i++) {
    pts.push(pointOnCircle(c, inner, r.targetStart + (tSweep * i) / tSteps))
  }

  const a2 = pointOnCircle(c, inner, r.targetEnd)
  const b2 = pointOnCircle(c, inner, r.sourceStart)
  for (const q of quadPoints(a2, c, b2, p)) pts.push(q)

  return pts
}

/**
 * Sample a quadratic Bézier from `from` to `to`, with `control` pulled toward
 * the straight chord by `1 - progress`.
 *
 * It RETURNS its points rather than appending to an out-parameter. The native
 * subset has no notion of a void helper that mutates an argument — the
 * generator reads one as a component and silently guts it ("no return
 * statement found"), which is a function that compiles and draws nothing.
 */
function quadPoints(from: Pt, control: Pt, to: Pt, progress: Double): Pt[] {
  const out: Pt[] = []
  const steps = 24
  const mx = (from.x + to.x) / 2.0
  const my = (from.y + to.y) / 2.0
  // At progress 0 the control sits on the chord itself, so the ribbon collapses
  // to the ring; at 1 it is the centre.
  const cx = mx + (control.x - mx) * progress
  const cy = my + (control.y - my) * progress
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1.0 - t
    const x = u * u * from.x + 2.0 * u * t * cx + t * t * to.x
    const y = u * u * from.y + 2.0 * u * t * cy + t * t * to.y
    out.push({ x, y })
  }
  return out
}

/** Draw the ribbons, then the ring over them, then the labels. */
export function renderChord(layout: ChordLayout, options?: ChordOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const opacity = options?.linkOpacity ?? 0.62
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#5a6b7a'
  const m: MeasureText = measure ?? approxTextWidth
  if (progress <= 0.0 || layout.arcs.length === 0) return out

  // Ribbons first: the ring is drawn over them so a flow reads as leaving from
  // under its own arc rather than butting against it.
  for (const r of layout.ribbons) {
    out.push({ kind: 'polygon', points: ribbonPolygon(layout, r, progress), fill: withAlpha(r.color, opacity) })
  }

  const c: Pt = layout.circle.center
  const inner = Math.max(0.0, layout.circle.radius - layout.thickness)
  for (const a of layout.arcs) {
    out.push({ kind: 'polygon', points: arcPolygon(c, layout.circle.radius, inner, a.start, a.end), fill: a.color })
  }

  if (options?.showLabels !== false) {
    for (const a of layout.arcs) {
      // A name wider than the room outside the ring is dropped rather than
      // clipped: half a country name is worse than none, and the tooltip still
      // has it.
      if (m(a.name, fontSize) > layout.box.w / 2.0) continue
      out.push({
        kind: 'text',
        text: a.name,
        at: a.labelAt,
        fill: labelColor,
        size: fontSize,
        align: a.labelAlign,
        baseline: 'middle',
      })
    }
  }

  return out
}

/** The arc under a point, or -1. Ring only — a ribbon hit is `hitChordRibbon`. */
export function hitChordIndex(layout: ChordLayout, px: Double, py: Double): number {
  const dx = px - layout.circle.center.x
  const dy = py - layout.circle.center.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const inner = Math.max(0.0, layout.circle.radius - layout.thickness)
  if (dist < inner || dist > layout.circle.radius) return -1
  // `atan2` gives (-PI, PI]; the arcs start at -PI/2 and run past PI, so a
  // point in the last arc only matches once 2*PI is added back. Both are
  // tested in one pass, without reassigning — a top-level reassignment is not
  // emitted on native, so the two-pass form would compile and never find the
  // wrapped arc there.
  //
  // Testing both in the same iteration is safe because they name the SAME
  // direction: exactly one of the two lies inside the 2*PI the arcs span, so
  // at most one condition can ever fire for a given point.
  const raw = Math.atan2(dy, dx)
  const wrapped = raw + CHORD_TAU
  for (const a of layout.arcs) {
    if (raw >= a.start && raw <= a.end) return a.index
    if (wrapped >= a.start && wrapped <= a.end) return a.index
  }
  return -1
}
