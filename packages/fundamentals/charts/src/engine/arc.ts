// Pie, donut, gauge — the radial family.
//
// Second-biggest real usage after bars. Kept in its own module so a bar chart
// never pays for the trigonometry: nothing here is reachable unless a radial
// mark is imported.

import type { DrawCmd, Double, Pt, Rect } from './types'

export interface Slice {
  value: Double
  label: string
  color: string
}

/** One laid-out slice, in radians, clockwise from 12 o'clock. */
export interface ArcGeometry {
  start: Double
  end: Double
  /** Midpoint angle — where a label or callout is anchored. */
  mid: Double
  slice: Slice
  /** Share of the total, 0..1. Zero when every value is zero. */
  fraction: Double
}

const TAU = Math.PI * 2.0
/** 12 o'clock. Canvas angles start at 3 o'clock, and every convention for a
 *  pie chart starts at the top, so every angle here is offset by a quarter turn. */
const START = -Math.PI / 2.0

/**
 * Lay slices out around the circle.
 *
 * Negative values are dropped rather than reflected: a negative slice has no
 * meaningful angular width, and silently taking its absolute value would show a
 * loss as though it were a gain. A caller wanting that can map the data first.
 */
export function layoutArcs(slices: Slice[]): ArcGeometry[] {
  let total = 0.0
  for (const s of slices) if (s.value > 0.0) total = total + s.value
  const out: ArcGeometry[] = []
  if (total <= 0.0) return out
  let angle = START
  for (const s of slices) {
    if (s.value <= 0.0) continue
    const fraction = s.value / total
    const sweep = fraction * TAU
    out.push({ start: angle, end: angle + sweep, mid: angle + sweep / 2.0, slice: s, fraction })
    angle = angle + sweep
  }
  return out
}

/** The largest circle centred in a rect. */
/**
 * A fitted circle. NAMED (not an inline object type) so PMTC synthesizes a
 * real struct — an inline return annotation lowers to a Swift tuple that
 * cannot match the struct the body constructs.
 */
export type Circle = { center: Pt; radius: Double }

export function fitCircle(box: Rect): Circle {
  const r = Math.min(box.w, box.h) / 2.0
  return { center: { x: box.x + box.w / 2.0, y: box.y + box.h / 2.0 }, radius: Math.max(0.0, r) }
}

/** A point on a circle at a given angle. */
export function pointOnCircle(center: Pt, radius: Double, angle: Double): Pt {
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
}

/**
 * Approximate an arc band as a polygon.
 *
 * The draw list has no arc primitive on purpose: a polygon is the one shape
 * every backend fills identically, and an arc would need a per-backend
 * translation with its own winding and sweep-direction rules. The cost is
 * segment count, and segments scale with the sweep so a thin slice is not
 * over-tessellated while a half-circle stays smooth.
 */
export function arcPolygon(
  center: Pt,
  outerR: Double,
  innerR: Double,
  start: Double,
  end: Double,
): Pt[] {
  const sweep = Math.abs(end - start)
  const steps = Math.max(2, Math.ceil((sweep / TAU) * 64.0))
  const pts: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    pts.push(pointOnCircle(center, outerR, start + (sweep * i) / steps))
  }
  if (innerR > 0.0) {
    // Walk the inner edge back the other way, so the ring closes as a band
    // rather than crossing itself into a bow tie.
    for (let i = steps; i >= 0; i--) {
      pts.push(pointOnCircle(center, innerR, start + (sweep * i) / steps))
    }
  } else {
    pts.push(center)
  }
  return pts
}

export interface PieOptions {
  /** 0 for a pie, 0..1 for a donut — the hole as a fraction of the radius. */
  innerRadius: Double
  /** Draw the percentage inside each slice. */
  showLabels: boolean
  labelColor: string
  fontSize: Double
}

/** Draw commands for a pie or donut. */
export function renderPie(slices: Slice[], box: Rect, opts: PieOptions): DrawCmd[] {
  const { center, radius } = fitCircle(box)
  const inner = radius * Math.max(0.0, Math.min(0.95, opts.innerRadius))
  const out: DrawCmd[] = []
  const arcs = layoutArcs(slices)
  for (const a of arcs) {
    out.push({
      kind: 'polygon',
      points: arcPolygon(center, radius, inner, a.start, a.end),
      fill: a.slice.color,
    })
  }
  if (opts.showLabels) {
    for (const a of arcs) {
      // Skip slivers: a label on a 1% slice overlaps its neighbours and reads
      // as noise. The legend is where small slices get named.
      if (a.fraction < 0.05) continue
      const at = pointOnCircle(center, (radius + inner) / 2.0, a.mid)
      out.push({
        kind: 'text',
        text: `${Math.round(a.fraction * 100.0)}%`,
        at,
        fill: opts.labelColor,
        size: opts.fontSize,
        align: 'middle',
        baseline: 'middle',
      })
    }
  }
  return out
}

/** Which slice a point falls in, or -1. */
export function hitArc(
  arcs: ArcGeometry[],
  center: Pt,
  outerR: Double,
  innerR: Double,
  p: Pt,
): number {
  const dx = p.x - center.x
  const dy = p.y - center.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > outerR || dist < innerR) return -1
  // atan2 returns (-PI, PI]; the arcs start at -PI/2, so normalise the angle
  // into the same turn before comparing or a slice spanning 12 o'clock misses.
  let ang = Math.atan2(dy, dx)
  for (let i = 0; i < arcs.length; i++) {
    const a = arcs[i]!
    let s = a.start
    let e = a.end
    while (e > Math.PI) {
      s = s - TAU
      e = e - TAU
    }
    const cand = ang > e ? ang - TAU : ang
    if (cand >= s && cand <= e) return i
  }
  return -1
}

export interface GaugeOptions {
  min: Double
  max: Double
  /** Total sweep in radians; a half-circle by default. */
  sweep: Double
  thickness: Double
  trackColor: string
  valueColor: string
}

/**
 * A gauge: a track arc with a value arc over it.
 *
 * The value is clamped to the domain rather than allowed to overshoot — a
 * reading past the maximum would wrap around the circle and display as a small
 * value, which is the most dangerous possible failure for a gauge.
 */
export function renderGauge(value: Double, box: Rect, opts: GaugeOptions): DrawCmd[] {
  const { center, radius } = fitCircle(box)
  const inner = Math.max(0.0, radius - opts.thickness)
  const span = opts.max - opts.min
  const t = span <= 0.0 ? 0.0 : Math.max(0.0, Math.min(1.0, (value - opts.min) / span))
  const start = Math.PI - (opts.sweep - Math.PI) / 2.0
  return [
    {
      kind: 'polygon',
      points: arcPolygon(center, radius, inner, start, start + opts.sweep),
      fill: opts.trackColor,
    },
    {
      kind: 'polygon',
      points: arcPolygon(center, radius, inner, start, start + opts.sweep * t),
      fill: opts.valueColor,
    },
  ]
}
