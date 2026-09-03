// Points on a map — scatter / effectScatter with `coordinateSystem: 'geo'`.

import { layoutGeo, renderGeo } from './geo'
import type { GeoJson, GeoLayout, GeoOptions } from './geo'
import { withAlpha } from './radar'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText } from './types'

export interface GeoPoint {
  name?: string | undefined
  lon: Double
  lat: Double
  value?: Double | undefined
  color?: string | undefined
}

export interface GeoPath {
  /** [lon, lat] vertices. */
  coords: [Double, Double][]
  color?: string | undefined
  width?: Double | undefined
}

export interface GeoPointsOptions {
  /** Base radius; points with values scale between 0.6× and 2× of it. */
  radius?: Double | undefined
  color?: string | undefined
  /** Halo rings under each point (effectScatter). */
  effect?: boolean | undefined
  showLabels?: boolean | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  progress?: Double | undefined
}

/** Radius of each point at the shared value scale. */
export function geoPointRadii(points: GeoPoint[], base: Double): Double[] {
  let hi = 0.0
  for (const p of points) if (p.value !== undefined && p.value > hi) hi = p.value
  return points.map((p) => (p.value === undefined || hi <= 0.0 ? base : base * (0.6 + 1.4 * Math.sqrt(Math.max(0.0, p.value) / hi))))
}

/** Render points over an already-laid-out map. */
export function renderGeoPoints(layout: GeoLayout, points: GeoPoint[], options?: GeoPointsOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const base = options?.radius ?? 5.0
  const color = options?.color ?? '#b42318'
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const fontSize = options?.fontSize ?? 10.0
  const labelColor = options?.labelColor ?? '#1e293b'
  void (measure ?? measureApprox())
  const radii = geoPointRadii(points, base)
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const at = layout.project(p.lon, p.lat)
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

/** Render `lines`-series paths over an already-laid-out map (drawn before points). */
export function renderGeoPaths(layout: GeoLayout, paths: GeoPath[], options?: GeoPointsOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const color = options?.color ?? '#b42318'
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  for (const path of paths) {
    const pts = path.coords.map((c) => layout.project(c[0], c[1]))
    const count = progress >= 1.0 ? pts.length : Math.max(2, Math.floor(pts.length * progress))
    if (pts.length < 2 || progress <= 0.0) continue
    out.push({ kind: 'polyline', points: pts.slice(0, count), stroke: path.color ?? color, width: path.width ?? 1.5 })
  }
  return out
}

/** The nearest point whose symbol (plus a halo) contains the pixel, or -1. */
export function hitGeoPoint(layout: GeoLayout, points: GeoPoint[], px: Double, py: Double, base?: Double): number {
  const radii = geoPointRadii(points, base ?? 5.0)
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < points.length; i++) {
    const at = layout.project(points[i]!.lon, points[i]!.lat)
    const d = (px - at.x) * (px - at.x) + (py - at.y) * (py - at.y)
    const r = radii[i]! + 3.0
    if (d <= r * r && d < bestD) {
      best = i
      bestD = d
    }
  }
  return best
}

export interface GeoPointsToSvgOptions {
  geo: GeoJson
  points: GeoPoint[]
  paths?: GeoPath[] | undefined
  width?: Double
  height?: Double
  map?: GeoOptions
  options?: GeoPointsOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Map + points → `<svg>` string, server-safe. */
export function geoPointsToSvg(o: GeoPointsToSvgOptions): string {
  const width = o.width ?? 640.0
  const height = o.height ?? 400.0
  const layout = layoutGeo(o.geo, { x: 0.0, y: 0.0, w: width, h: height }, o.map)
  const m = o.measure ?? measureApprox()
  const paths = o.paths ?? []
  const cmds = [...renderGeo(layout, {}, o.map, m), ...renderGeoPaths(layout, paths, o.options), ...renderGeoPoints(layout, o.points, o.options, m)]
  const description = o.description ?? (o.title !== undefined ? `${o.title}: ${o.points.length} points and ${paths.length} paths over ${layout.regions.length} regions.` : undefined)
  return renderSvg(cmds, width, height, {
    ...o.svg,
    ...(o.title !== undefined ? { title: o.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
