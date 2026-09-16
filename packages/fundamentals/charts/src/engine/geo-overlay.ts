// Native-safe geographic point and path overlays. Coordinates use named
// fields instead of tuples so the same values lower to Swift and Kotlin.

import { geoProject } from './geo'
import type { GeoLayout } from './geo'
import { withAlpha } from './radar'
import type { Double, DrawCmd, Pt } from './types'

export interface GeoOverlayPoint {
  name?: string | undefined
  lon: Double
  lat: Double
  value?: Double | undefined
  color?: string | undefined
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
    if (options?.effect === true) {
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
