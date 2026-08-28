// Radar / spider charts.

import { pointOnCircle } from './arc'
import type { DrawCmd, Double, Pt, Rect } from './types'

export interface RadarAxis {
  label: string
  max: Double
}

export interface RadarSeries {
  values: Double[]
  color: string
  /** Fill opacity 0..1; the outline is always drawn at full strength. */
  fillAlpha: Double
}

const START = -Math.PI / 2.0

/** Where each axis points, evenly around the circle from 12 o'clock. */
export function radarAngles(count: number): Double[] {
  const out: Double[] = []
  if (count <= 0) return out
  for (let i = 0; i < count; i++) out.push(START + (Math.PI * 2.0 * i) / count)
  return out
}

/**
 * A series' polygon.
 *
 * Each axis normalises by its OWN max, so axes in different units — revenue in
 * millions beside a satisfaction score out of 5 — are comparable on one chart.
 * A shared scale would flatten every small-range axis to the centre.
 */
export function radarPolygon(
  values: Double[],
  axes: RadarAxis[],
  center: Pt,
  radius: Double,
): Pt[] {
  const n = Math.min(values.length, axes.length)
  const angles = radarAngles(n)
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const max = axes[i]!.max
    const t = max <= 0.0 ? 0.0 : Math.max(0.0, Math.min(1.0, values[i]! / max))
    out.push(pointOnCircle(center, radius * t, angles[i]!))
  }
  return out
}

export interface RadarOptions {
  rings: number
  gridColor: string
  labelColor: string
  fontSize: Double
  showLabels: boolean
}

/** Draw commands for the web of axes plus every series polygon. */
export function renderRadar(
  axes: RadarAxis[],
  series: RadarSeries[],
  box: Rect,
  opts: RadarOptions,
): DrawCmd[] {
  const out: DrawCmd[] = []
  const n = axes.length
  if (n < 3) return out // fewer than three axes has no area to enclose

  // Leave room for the outer labels, or they render outside the box.
  const pad = opts.showLabels ? opts.fontSize * 3.0 : 0.0
  const radius = Math.max(0.0, Math.min(box.w, box.h) / 2.0 - pad)
  const center: Pt = { x: box.x + box.w / 2.0, y: box.y + box.h / 2.0 }
  const angles = radarAngles(n)

  for (let r = 1; r <= opts.rings; r++) {
    const rr = (radius * r) / opts.rings
    const ring: Pt[] = []
    for (const a of angles) ring.push(pointOnCircle(center, rr, a))
    ring.push(ring[0]!)
    out.push({ kind: 'polyline', points: ring, stroke: opts.gridColor, width: 1.0 })
  }
  for (const a of angles) {
    out.push({
      kind: 'line',
      from: center,
      to: pointOnCircle(center, radius, a),
      stroke: opts.gridColor,
      width: 1.0,
    })
  }

  for (const s of series) {
    const poly = radarPolygon(s.values, axes, center, radius)
    if (poly.length < 3) continue
    out.push({ kind: 'polygon', points: poly, fill: withAlpha(s.color, s.fillAlpha) })
    const closed: Pt[] = []
    for (const p of poly) closed.push(p)
    closed.push(poly[0]!)
    out.push({ kind: 'polyline', points: closed, stroke: s.color, width: 2.0 })
  }

  if (opts.showLabels) {
    for (let i = 0; i < n; i++) {
      const at = pointOnCircle(center, radius + opts.fontSize * 1.2, angles[i]!)
      // Anchor by which side of the circle the label sits on, so text grows
      // outward instead of overlapping the web.
      const dx = at.x - center.x
      const align = Math.abs(dx) < 1.0 ? 'middle' : dx > 0.0 ? 'start' : 'end'
      out.push({
        kind: 'text',
        text: axes[i]!.label,
        at,
        fill: opts.labelColor,
        size: opts.fontSize,
        align,
        baseline: 'middle',
      })
    }
  }
  return out
}

/**
 * Apply an alpha to a colour.
 *
 * Handles `#rgb`/`#rrggbb` and passes anything else through unchanged — a
 * caller using `rgb()`/`hsl()`/a named colour keeps their value rather than
 * getting a mangled string, at the cost of no fill translucency there.
 */
export function withAlpha(color: string, alpha: Double): string {
  const a = Math.max(0.0, Math.min(1.0, alpha))
  if (!color.startsWith('#')) return color
  const hex = color.slice(1)
  const full =
    hex.length === 3
      ? `${hex[0]!}${hex[0]!}${hex[1]!}${hex[1]!}${hex[2]!}${hex[2]!}`
      : hex.length === 6
        ? hex
        : ''
  if (full === '') return color
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
