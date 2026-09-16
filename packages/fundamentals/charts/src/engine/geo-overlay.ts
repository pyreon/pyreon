// Native-safe geographic point and path overlays. Coordinates use named
// fields instead of tuples so the same values lower to Swift and Kotlin.

import { geoProject } from './geo'
import type { GeoLayout } from './geo'
import { arcPolygon, layoutArcs } from './arc'
import type { Slice } from './arc'
import { rampColor } from './heat'
import { withAlpha } from './radar'
import type { Double, DrawCmd, Pt } from './types'

export interface GeoOverlayPoint {
  name?: string | undefined
  lon: Double
  lat: Double
  value?: Double | undefined
  color?: string | undefined
  /** This point draws the effectScatter halo, whatever the shared option says. */
  effect?: boolean | undefined
}

/** A weighted sample of a geo heatmap. */
export interface GeoHeatPoint {
  lon: Double
  lat: Double
  value: Double
}

/** A pie placed at a geographic point (ECharts' pie with `coordinateSystem: 'geo'`). */
export interface GeoPie {
  lon: Double
  lat: Double
  radius: Double
  innerRadius: Double
  slices: Slice[]
}

export interface GeoCoordinate {
  lon: Double
  lat: Double
}

export interface GeoOverlayPath {
  coords: GeoCoordinate[]
  color?: string | undefined
  width?: Double | undefined
}

export interface GeoOverlayOptions {
  radius?: Double | undefined
  color?: string | undefined
  effect?: boolean | undefined
  showLabels?: boolean | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  progress?: Double | undefined
}

export function geoOverlayPointRadii(points: GeoOverlayPoint[], base: Double): Double[] {
  let hi = 0.0
  for (const p of points) {
    const value = p.value ?? 0.0
    if (value > hi) hi = value
  }
  const out: Double[] = []
  for (const p of points) {
    const hasValue = p.value !== undefined
    const value = p.value ?? 0.0
    out.push(!hasValue || hi <= 0.0 ? base : base * (0.6 + 1.4 * Math.sqrt(Math.max(0.0, value) / hi)))
  }
  return out
}

export function renderGeoOverlayPoints(layout: GeoLayout, points: GeoOverlayPoint[], options?: GeoOverlayOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const base = options?.radius ?? 5.0
  const color = options?.color ?? '#b42318'
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const fontSize = options?.fontSize ?? 10.0
  const labelColor = options?.labelColor ?? '#1e293b'
  const radii = geoOverlayPointRadii(points, base)
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const at = geoProject(layout.transform, p.lon, p.lat)
    const r = radii[i]! * progress
    const fill = p.color ?? color
    if (options?.effect === true || p.effect === true) {
      out.push({ kind: 'circle', center: at, radius: r * 2.6, fill: withAlpha(fill, 0.12) })
      out.push({ kind: 'circle', center: at, radius: r * 1.7, fill: withAlpha(fill, 0.25) })
    }
    out.push({ kind: 'circle', center: at, radius: r, fill })
    if (options?.showLabels === true && progress >= 1.0 && p.name !== undefined) {
      out.push({ kind: 'text', text: p.name, at: { x: at.x + r + 3.0, y: at.y }, fill: labelColor, size: fontSize, align: 'start', baseline: 'middle' })
    }
  }
  return out
}

export function renderGeoOverlayPaths(layout: GeoLayout, paths: GeoOverlayPath[], options?: GeoOverlayOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const color = options?.color ?? '#b42318'
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  for (const path of paths) {
    const pts = path.coords.map((c) => geoProject(layout.transform, c.lon, c.lat))
    if (pts.length < 2 || progress <= 0.0) continue
    let length = 0.0
    for (const _p of pts) length = length + 1.0
    const visibleCount = progress >= 1.0 ? length : Math.max(2.0, Math.floor(length * progress))
    const visible: Pt[] = []
    let index = 0.0
    for (const point of pts) {
      if (index < visibleCount) visible.push(point)
      index = index + 1.0
    }
    out.push({ kind: 'polyline', points: visible, stroke: path.color ?? color, width: path.width ?? 1.5 })
  }
  return out
}

export function hitGeoOverlayPoint(layout: GeoLayout, points: GeoOverlayPoint[], px: Double, py: Double, base?: Double): number {
  const radii = geoOverlayPointRadii(points, base ?? 5.0)
  let best = -1
  let bestD = 999999999999.0
  for (let i = 0; i < points.length; i++) {
    const at = geoProject(layout.transform, points[i]!.lon, points[i]!.lat)
    const d = (px - at.x) * (px - at.x) + (py - at.y) * (py - at.y)
    const r = radii[i]! + 3.0
    if (d <= r * r && d < bestD) {
      best = i
      bestD = d
    }
  }
  return best
}

/**
 * A geo heatmap: one soft blob per sample, coloured by its value on the ramp
 * and fading to transparent at `radius` — so dense samples read hot where they
 * overlap. The blob is a radial gradient over a circle polygon, which every
 * backend paints; its solid fill is the fallback.
 */
export function renderGeoHeat(layout: GeoLayout, points: GeoHeatPoint[], stops: readonly string[], radius: Double, progress: Double): DrawCmd[] {
  const out: DrawCmd[] = []
  let lo = 0.0
  let hi = 0.0
  let seen = 0
  for (const p of points) {
    if (seen === 0 || p.value < lo) lo = p.value
    if (seen === 0 || p.value > hi) hi = p.value
    seen = seen + 1
  }
  const span = hi - lo
  const alpha = progress < 0.0 ? 0.0 : progress > 1.0 ? 1.0 : progress
  const ramp: readonly string[] = stops.length > 0 ? stops : ['#3b82f6', '#facc15', '#ef4444']
  for (const p of points) {
    const at = geoProject(layout.transform, p.lon, p.lat)
    const color = rampColor(ramp, span > 0.0 ? (p.value - lo) / span : 1.0)
    const ring = arcPolygon(at, radius, 0.0, 0.0, Math.PI * 2.0)
    out.push({
      kind: 'polygon',
      points: ring,
      fill: withAlpha(color, 0.5 * alpha),
      grad: { from: at, to: { x: at.x + radius, y: at.y }, stops: [{ offset: 0.0, color: withAlpha(color, 0.85 * alpha) }, { offset: 1.0, color: withAlpha(color, 0.0) }], radial: true },
    })
  }
  return out
}

/** The heat ramp: the layer's own stops, else the map's (the theme ramp), else the engine default. */
export function geoHeatStops(stops: string[], fallback: string[] | undefined): string[] {
  if (stops.length > 0) return stops
  return fallback ?? []
}

/** Pies centred on geographic points, each `radius` pixels, sweeping as `progress` grows. */
export function renderGeoPies(layout: GeoLayout, pies: GeoPie[], progress: Double): DrawCmd[] {
  const out: DrawCmd[] = []
  const t = progress < 0.0 ? 0.0 : progress > 1.0 ? 1.0 : progress
  for (const pie of pies) {
    const at = geoProject(layout.transform, pie.lon, pie.lat)
    const inner = pie.radius * (pie.innerRadius < 0.0 ? 0.0 : pie.innerRadius > 0.95 ? 0.95 : pie.innerRadius)
    for (const a of layoutArcs(pie.slices)) {
      if (!(a.end > a.start)) continue
      out.push({ kind: 'polygon', points: arcPolygon(at, pie.radius, inner, a.start * t, a.end * t), fill: a.slice.color })
    }
  }
  return out
}
