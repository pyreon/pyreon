// Pie, donut, gauge — the radial family.
//
// Second-biggest real usage after bars. Kept in its own module so a bar chart
// never pays for the trigonometry: nothing here is reachable unless a radial
// mark is imported.

import type { DrawCmd, Double, Pt, Rect } from './types'
import { layoutPieLabels } from './pie-labels'
import type { PieLabelOptions } from './pie-labels'

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
  /** The slice's position in the input — slices that draw nothing are skipped, so it can differ from the arc's own. */
  index: number
  /** How far out the slice reaches, 0..1 between the inner and outer radius — below 1 only on a rose. */
  reach: Double
}

/**
 * How slices are laid round the circle — ECharts' pie keys. Angles are in
 * radians on the canvas, where they grow clockwise from 3 o'clock.
 */
export interface ArcConfig {
  /** Where the first slice starts (ECharts' `startAngle` of 90 is -PI/2). */
  start: Double
  /** How much of the turn the slices share — TAU for a whole pie (ECharts' `endAngle`). */
  sweep: Double
  clockwise: boolean
  /** No slice narrower than this. */
  minAngle: Double
  /** A gap between neighbouring slices, taken out of both. */
  padAngle: Double
  /** '' for a pie; 'radius' or 'area' for a Nightingale rose. */
  rose: string
  /** ECharts' treatment of zeros: a zero slice is kept (a zero-width slice, or minAngle wide), and an all-zero pie splits evenly. */
  zeros: boolean
}

const TAU = Math.PI * 2.0
/** 12 o'clock. Canvas angles start at 3 o'clock, and every convention for a
 *  pie chart starts at the top, so every angle here is offset by a quarter turn. */
const START = -Math.PI / 2.0

/** Canvas angles as a pie has always drawn them: from 12 o'clock, clockwise, no gaps. */
export const DEFAULT_ARCS: ArcConfig = { start: START, sweep: TAU, clockwise: true, minAngle: 0.0, padAngle: 0.0, rose: '', zeros: false }

/**
 * Lay slices out around the circle.
 *
 * Negative values are dropped rather than reflected: a negative slice has no
 * meaningful angular width, and silently taking its absolute value would show a
 * loss as though it were a gain. A caller wanting that can map the data first.
 */
export function layoutArcs(slices: Slice[]): ArcGeometry[] {
  return layoutArcsWith(slices, DEFAULT_ARCS)
}

/**
 * Lay slices out as ECharts' pie layout does: the start angle and direction,
 * `minAngle` (a slice narrower than it is widened and the rest share what is
 * left), `padAngle` (taken half off each side) and `roseType` ('radius' sizes
 * the angle AND the reach by value; 'area' gives every slice the same angle).
 * The returned arcs always run start < end, whichever way they were laid.
 */
export function layoutArcsWith(slices: Slice[], cfg: ArcConfig): ArcGeometry[] {
  const out: ArcGeometry[] = []
  const kept: number[] = []
  let total = 0.0
  let peak = 0.0
  for (let i = 0; i < slices.length; i++) {
    const v = slices[i]!.value
    if (v > 0.0 || (cfg.zeros && v === 0.0)) {
      kept.push(i)
      if (v > 0.0) total = total + v
      if (v > peak) peak = v
    }
  }
  const count = kept.length
  if (count === 0 || (total <= 0.0 && !cfg.zeros)) return out
  const dir = cfg.clockwise ? 1.0 : -1.0
  const unit = TAU / (total > 0.0 ? total : count)
  const minPad = cfg.minAngle + cfg.padAngle
  const halfPad = cfg.padAngle / 2.0
  // First pass: each slice's own angle, widened to minAngle + padAngle; what the widening took comes out of the rest.
  const angles: Double[] = []
  let rest = cfg.sweep
  let bigSum = 0.0
  for (let k = 0; k < count; k++) {
    const v = slices[kept[k]!]!.value
    let a = cfg.rose === 'area' ? cfg.sweep / count : total > 0.0 ? v * unit : unit
    if (a < minPad) {
      a = minPad
      rest = rest - minPad
    } else {
      bigSum = bigSum + v
    }
    angles.push(a)
  }
  // Second pass (ECharts): when any slice was widened, or the slices share less than a turn, the rest
  // share what is left by value — or evenly, when nothing is.
  if (rest < TAU) {
    for (let k = 0; k < count; k++) {
      const v = slices[kept[k]!]!.value
      if (rest <= 0.001) angles[k] = cfg.sweep / count
      else if (angles[k]! !== minPad) angles[k] = v * (rest / bigSum)
    }
  }
  let at = cfg.start
  for (let k = 0; k < count; k++) {
    const s = slices[kept[k]!]!
    const a = angles[k]!
    // A gap wider than the slice leaves it a line at its middle.
    const from = cfg.padAngle > a ? at + (dir * a) / 2.0 : at + dir * halfPad
    const to = cfg.padAngle > a ? from : at + dir * a - dir * halfPad
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    const reach = cfg.rose === '' ? 1.0 : peak > 0.0 ? s.value / peak : 0.0
    out.push({ start: lo, end: hi, mid: (lo + hi) / 2.0, slice: s, fraction: total > 0.0 ? s.value / total : 0.0, index: kept[k]!, reach })
    at = at + dir * a
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
  /** How the slices are laid round; the classic 12 o'clock clockwise pie without it. */
  arcs?: ArcConfig | undefined
  /** ECharts' labels (outside with a guide line, inside, or centred); the percentages above without it. */
  labels?: PieLabelOptions | undefined
  /** The rect outside labels keep within — the whole chart; the pie's own box without it. */
  view?: Rect | undefined
  /** With no slices, draw the ring in this colour (ECharts' empty circle); '' draws nothing. */
  empty?: string | undefined
  /** Measures label text, for cutting an outside label that would leave the view; an estimate from its length without it. */
  measure?: ((text: string, size: Double) => Double) | undefined
}

/** Draw commands for a pie or donut. */
export function renderPie(slices: Slice[], box: Rect, opts: PieOptions): DrawCmd[] {
  const { center, radius } = fitCircle(box)
  const inner = radius * Math.max(0.0, Math.min(0.95, opts.innerRadius))
  const out: DrawCmd[] = []
  const cfg = opts.arcs ?? DEFAULT_ARCS
  const arcs = layoutArcsWith(slices, cfg)
  const emptyFill = opts.empty ?? ''
  if (arcs.length === 0 && emptyFill !== '') {
    const from = cfg.clockwise ? cfg.start : cfg.start - cfg.sweep
    out.push({ kind: 'polygon', points: arcPolygon(center, radius, inner, from, from + cfg.sweep), fill: emptyFill })
  }
  for (const a of arcs) {
    if (a.end <= a.start) continue
    out.push({
      kind: 'polygon',
      points: arcPolygon(center, inner + a.reach * (radius - inner), inner, a.start, a.end),
      fill: a.slice.color,
    })
  }
  const lab = opts.labels
  if (lab !== undefined) {
    const placed = layoutPieLabels(arcs, center, radius, inner, opts.view ?? box, lab, opts.measure ?? estimateWidth)
    for (const l of placed) {
      if (l.line.length > 1) out.push({ kind: 'polyline', points: l.line, stroke: l.lineColor, width: 1.0 })
      // A label cut to nothing (no room at all) keeps its line and draws no text, as ECharts'.
      const fill = l.color === '' ? opts.labelColor : l.color
      // An unrotated label carries no rotate, so it serializes as it always has.
      if (l.text !== '' && l.rotate !== 0.0) out.push({ kind: 'text', text: l.text, at: l.at, fill, size: lab.fontSize, align: l.align, baseline: 'middle', rotate: l.rotate })
      else if (l.text !== '') out.push({ kind: 'text', text: l.text, at: l.at, fill, size: lab.fontSize, align: l.align, baseline: 'middle' })
    }
    return out
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

/** A text width from its length alone, for a caller with no measurer. */
function estimateWidth(text: string, size: Double): Double {
  return text.length * size * 0.6
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
  const ang = Math.atan2(dy, dx)
  for (let i = 0; i < arcs.length; i++) {
    const a = arcs[i]!
    // A rose slice reaches only part of the way out.
    if (dist > innerR + a.reach * (outerR - innerR)) continue
    // The angle past the slice's start, taken into [0, TAU): arcs may start anywhere on the turn.
    const off = ang - a.start
    const d = off - Math.floor(off / TAU) * TAU
    if (d <= a.end - a.start) return i
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
