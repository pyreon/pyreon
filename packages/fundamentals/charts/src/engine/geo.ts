// Geo — GeoJSON regions projected into a box, filled by value.
//
// The registry is module-level on purpose: maps are static assets registered
// once at startup (ECharts' registerMap shape), bounded by the app's map
// count, and looked up by name from the option facade.

import { HEAT_RAMP } from './heat'
import { colorRamp } from './heat-ramp'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

export type GeoProjection = 'equirectangular' | 'mercator'

export interface GeoFeature {
  type: 'Feature'
  properties?: Record<string, unknown> | null | undefined
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] } | null
}

export interface GeoJson {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

export interface GeoRegion {
  name: string
  /** Outer rings in pixel space (holes are dropped). */
  rings: Pt[][]
  centroid: Pt
  bbox: Rect
}

export interface GeoLayout {
  regions: GeoRegion[]
  /** Pixel transform used, so overlays (scatter on geo) can reuse it. */
  project: (lon: Double, lat: Double) => Pt
}

export interface GeoOptions {
  projection?: GeoProjection | undefined
  padding?: Double | undefined
  /** Property holding the region name; default `name`. */
  nameProperty?: string | undefined
  stops?: string[] | undefined
  domain?: [Double, Double] | undefined
  emptyColor?: string | undefined
  borderColor?: string | undefined
  borderWidth?: Double | undefined
  showLabels?: boolean | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  /** Entrance progress 0..1; regions fade in from the empty colour. */
  progress?: Double | undefined
}

const registry = new Map<string, GeoJson>()

/** Register (or replace) a map under a name for `type: 'map'` options. */
export function registerMap(name: string, geo: GeoJson): void {
  registry.set(name, geo)
}

/** A registered map, or null. */
export function getMap(name: string): GeoJson | null {
  return registry.get(name) ?? null
}

/** Registered map names. */
export function listMaps(): string[] {
  return Array.from(registry.keys())
}

/** Longitude/latitude → unit-ish coordinates (x east, y NORTH-up; flipped at fit time). */
export function projectLonLat(lon: Double, lat: Double, projection: GeoProjection): Pt {
  if (projection === 'mercator') {
    const clamped = lat > 85.0 ? 85.0 : lat < -85.0 ? -85.0 : lat
    const phi = (clamped * Math.PI) / 180.0
    return { x: lon, y: (Math.log(Math.tan(Math.PI / 4.0 + phi / 2.0)) * 180.0) / Math.PI }
  }
  return { x: lon, y: lat }
}

function ringArea(ring: Pt[]): Double {
  let a = 0.0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a = a + (ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y)
  return a / 2.0
}

function ringCentroid(ring: Pt[]): Pt | null {
  const a = ringArea(ring)
  if (Math.abs(a) < 1e-12) return null
  let cx = 0.0
  let cy = 0.0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y
    cx = cx + (ring[j]!.x + ring[i]!.x) * f
    cy = cy + (ring[j]!.y + ring[i]!.y) * f
  }
  return { x: cx / (6.0 * a), y: cy / (6.0 * a) }
}

/** Project every feature's outer rings and fit them into `box` (aspect preserved, centred). */
export function layoutGeo(geo: GeoJson, box: Rect, options?: GeoOptions): GeoLayout {
  const projection = options?.projection ?? 'equirectangular'
  const pad = options?.padding ?? 4.0
  const nameProp = options?.nameProperty ?? 'name'
  const raw: { name: string; rings: Pt[][] }[] = []
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let fi = 0; fi < geo.features.length; fi++) {
    const f = geo.features[fi]!
    const g = f.geometry
    if (g === null) continue
    const polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
    const rings: Pt[][] = []
    for (const poly of polys) {
      const outer = poly[0]
      if (outer === undefined || outer.length < 3) continue
      const ring: Pt[] = []
      for (const c of outer) {
        const p = projectLonLat(c[0] ?? 0.0, c[1] ?? 0.0, projection)
        ring.push(p)
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
      }
      rings.push(ring)
    }
    const propName = f.properties?.[nameProp]
    raw.push({ name: typeof propName === 'string' ? propName : 'Region ' + String(fi + 1), rings })
  }
  const innerW = Math.max(0.0, box.w - pad * 2.0)
  const innerH = Math.max(0.0, box.h - pad * 2.0)
  const spanX = maxX - minX
  const spanY = maxY - minY
  const scale = raw.length === 0 || spanX <= 0.0 || spanY <= 0.0 ? 1.0 : Math.min(innerW / spanX, innerH / spanY)
  const ox = box.x + pad + (innerW - spanX * scale) / 2.0
  const oy = box.y + pad + (innerH - spanY * scale) / 2.0
  const toPx = (p: Pt): Pt => ({ x: ox + (p.x - minX) * scale, y: oy + (maxY - p.y) * scale })
  const regions: GeoRegion[] = raw.map((r) => {
    const rings = r.rings.map((ring) => ring.map(toPx))
    let bx0 = Infinity
    let by0 = Infinity
    let bx1 = -Infinity
    let by1 = -Infinity
    let best: Pt[] | null = null
    let bestArea = -1.0
    for (const ring of rings) {
      for (const p of ring) {
        if (p.x < bx0) bx0 = p.x
        if (p.y < by0) by0 = p.y
        if (p.x > bx1) bx1 = p.x
        if (p.y > by1) by1 = p.y
      }
      const a = Math.abs(ringArea(ring))
      if (a > bestArea) {
        bestArea = a
        best = ring
      }
    }
    const bbox: Rect = bx0 === Infinity ? { x: box.x, y: box.y, w: 0.0, h: 0.0 } : { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }
    const centroid = (best === null ? null : ringCentroid(best)) ?? { x: bbox.x + bbox.w / 2.0, y: bbox.y + bbox.h / 2.0 }
    return { name: r.name, rings, centroid, bbox }
  })
  return { regions, project: (lon, lat) => toPx(projectLonLat(lon, lat, projection)) }
}

/** Value extent over the regions that have data. */
export function geoDomain(layout: GeoLayout, values: Record<string, Double>): [Double, Double] {
  let lo = Infinity
  let hi = -Infinity
  for (const r of layout.regions) {
    const v = values[r.name]
    if (v === undefined || v !== v) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return lo === Infinity ? [0.0, 0.0] : [lo, hi]
}

/** Render fills, borders, then labels. */
export function renderGeo(layout: GeoLayout, values: Record<string, Double>, options?: GeoOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const ramp = colorRamp(options?.stops ?? HEAT_RAMP)
  const emptyColor = options?.emptyColor ?? '#e2e8f0'
  const border = options?.borderColor ?? '#ffffff'
  const borderWidth = options?.borderWidth ?? 1.0
  const [lo, hi] = options?.domain ?? geoDomain(layout, values)
  const span = hi - lo
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const fontSize = options?.fontSize ?? 10.0
  const labelColor = options?.labelColor ?? '#1e293b'
  const m = measure ?? measureApprox()
  for (const r of layout.regions) {
    const v = values[r.name]
    const has = v !== undefined && v === v && progress > 0.0
    const t = !has ? 0.0 : span <= 0.0 ? 1.0 : ((v - lo) / span) * progress
    const fill = has ? ramp(t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t) : emptyColor
    for (const ring of r.rings) out.push({ kind: 'polygon', points: ring, fill })
  }
  for (const r of layout.regions) for (const ring of r.rings) out.push({ kind: 'polyline', points: [...ring, ring[0]!], stroke: border, width: borderWidth })
  if (options?.showLabels === true && progress >= 1.0) {
    for (const r of layout.regions) {
      // A label goes on LAND: the centroid must sit inside one of the region's
      // rings (a multi-island region's centroid is usually in the water between
      // them), and the text must fit THAT ring's box, not the union's.
      let host: Pt[] | null = null
      for (const ring of r.rings) if (pointInRing(ring, r.centroid.x, r.centroid.y)) host = ring
      if (host === null) continue
      const b = ringBox(host)
      if (m(r.name, fontSize) > b.w || fontSize > b.h) continue
      out.push({ kind: 'text', text: r.name, at: r.centroid, fill: labelColor, size: fontSize, align: 'middle', baseline: 'middle' })
    }
  }
  return out
}

function ringBox(ring: Pt[]): Rect {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of ring) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return x0 === Infinity ? { x: 0.0, y: 0.0, w: 0.0, h: 0.0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function pointInRing(ring: Pt[], px: Double, py: Double): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The region under a point (last drawn wins), or null. */
export function hitGeo(layout: GeoLayout, px: Double, py: Double): GeoRegion | null {
  for (let i = layout.regions.length - 1; i >= 0; i--) {
    const r = layout.regions[i]!
    if (px < r.bbox.x || px > r.bbox.x + r.bbox.w || py < r.bbox.y || py > r.bbox.y + r.bbox.h) continue
    for (const ring of r.rings) if (pointInRing(ring, px, py)) return r
  }
  return null
}

export interface GeoToSvgOptions {
  geo: GeoJson
  values: Record<string, Double>
  width?: Double
  height?: Double
  options?: GeoOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Map → `<svg>` string, server-safe. */
export function geoToSvg(o: GeoToSvgOptions): string {
  const width = o.width ?? 640.0
  const height = o.height ?? 400.0
  const layout = layoutGeo(o.geo, { x: 0.0, y: 0.0, w: width, h: height }, o.options)
  const cmds = renderGeo(layout, o.values, o.options, o.measure ?? measureApprox())
  const [lo, hi] = geoDomain(layout, o.values)
  let filled = 0
  for (const r of layout.regions) if (o.values[r.name] !== undefined) filled++
  const description = o.description ?? (o.title !== undefined ? `${o.title}: ${layout.regions.length} regions, ${filled} with values from ${lo} to ${hi}.` : undefined)
  return renderSvg(cmds, width, height, {
    ...o.svg,
    ...(o.title !== undefined ? { title: o.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
