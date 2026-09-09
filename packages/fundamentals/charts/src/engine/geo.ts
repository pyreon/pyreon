// Geo — GeoJSON regions projected into a box, filled by value.
//
// The registry is module-level on purpose: maps are static assets registered
// once at startup (ECharts' registerMap shape), bounded by the app's map
// count, and looked up by name from the option facade.

import { HEAT_RAMP, rampColor } from './heat'
import { approxTextWidth } from './treemap'
import type { Domain, Double, DrawCmd, MeasureText, Pt, Rect } from './types'
import { isFiniteNumber } from './scale'

export type GeoProjection = 'equirectangular' | 'mercator'

export interface GeoRegion {
  name: string
  /** Outer rings in pixel space (holes are dropped). */
  rings: Pt[][]
  centroid: Pt
  bbox: Rect
}

/**
 * A feature reduced to its outer rings in PROJECTION space (lon/lat run
 * through `projectLonLat`), before the fit into a box.
 *
 * This is the shape that crosses. GeoJSON's own `geometry` is a
 * `Polygon | MultiPolygon` union whose `coordinates` are `number[][][]` and
 * `number[][][][]` — one field at two array depths, which the fat-struct
 * lowering refuses to merge rather than producing an `Any`. Normalising to
 * rings up front removes the union, and `Pt[][]` compiles on both targets.
 */
export interface GeoShape {
  name: string
  rings: Pt[][]
}

/**
 * The fit-into-box transform, as DATA rather than a closure.
 *
 * It was `project: (lon, lat) => Pt`, which reads well and cannot cross — a
 * generated struct is `Codable`, and a function field is not. The same
 * information as five numbers plus the projection lets `geoProject` do the
 * work, and overlays reuse it exactly as before.
 */
/**
 * One region's value, as a LIST entry rather than a record key.
 *
 * `Record<string, Double>` is the natural web shape and does not cross: the
 * emitted Swift subscripts a dictionary, which yields `Double?`, and PMTC's
 * `!== undefined` narrowing does not carry to the target — so the lookup fails
 * to compile. The same trade is already made in `calendar-web.ts`, whose
 * crossing half "speaks in `{ date, value }` lists — the shapes that have a
 * native form". `geoValues()` in `geo-web.ts` is the adapter.
 */
export interface GeoValue {
  /** The region name, matched against `GeoRegion.name`. */
  region: string
  value: Double
}

/**
 * A region with no value. `NaN` and `Infinity` are JS globals that emit
 * VERBATIM in a crossing file — no lowering, and no warning either, so the
 * generated Swift says `cannot find 'NaN' in scope`. `0.0 / 0.0` is the
 * engine's spelling for a gap (see `indicator-values.ts`).
 */
const GEO_NA: Double = 0.0 / 0.0

/** Linear scan for a region's value; the list is one entry per region. */
export function geoValueOf(values: GeoValue[], name: string): Double {
  for (const v of values) if (v.region === name) return v.value
  return GEO_NA
}

export interface GeoTransform {
  minX: Double
  maxY: Double
  scale: Double
  ox: Double
  oy: Double
  projection: GeoProjection
}

export interface GeoLayout {
  regions: GeoRegion[]
  /** Pixel transform used, so overlays (scatter on geo) can reuse it. */
  transform: GeoTransform
}

/** The `layout.project(lon, lat)` closure, as a free function over the data. */
export function geoProject(t: GeoTransform, lon: Double, lat: Double): Pt {
  const p = projectLonLat(lon, lat, t.projection)
  return { x: t.ox + (p.x - t.minX) * t.scale, y: t.oy + (t.maxY - p.y) * t.scale }
}

export interface GeoOptions {
  projection?: GeoProjection | undefined
  padding?: Double | undefined
  /** Property holding the region name; default `name`. */
  nameProperty?: string | undefined
  stops?: readonly string[] | undefined
  domain?: Domain | undefined
  emptyColor?: string | undefined
  borderColor?: string | undefined
  borderWidth?: Double | undefined
  showLabels?: boolean | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  /** Entrance progress 0..1; regions fade in from the empty colour. */
  progress?: Double | undefined
}

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
  for (let i = 0; i < ring.length; i++) {
    const j = i === 0 ? ring.length - 1 : i - 1
    a = a + (ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y)
  }
  return a / 2.0
}

function ringCentroid(ring: Pt[]): Pt | null {
  const a = ringArea(ring)
  if (Math.abs(a) < 1e-12) return null
  let cx = 0.0
  let cy = 0.0
  for (let i = 0; i < ring.length; i++) {
    const j = i === 0 ? ring.length - 1 : i - 1
    const f = ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y
    cx = cx + (ring[j]!.x + ring[i]!.x) * f
    cy = cy + (ring[j]!.y + ring[i]!.y) * f
  }
  return { x: cx / (6.0 * a), y: cy / (6.0 * a) }
}

export function layoutGeoShapes(shapes: GeoShape[], box: Rect, options?: GeoOptions): GeoLayout {
  const projection = options?.projection ?? 'equirectangular'
  const pad = options?.padding ?? 4.0
  const raw = shapes
  // Seeded from the first point rather than Infinity sentinels — `river.ts`
  // and `treemap.ts` carry the same note, for the same reason.
  let minX = 0.0
  let maxX = 0.0
  let minY = 0.0
  let maxY = 0.0
  let seen = 0
  for (const sh of raw) {
    for (const ring of sh.rings) {
      for (const p of ring) {
        if (seen === 0) {
          minX = p.x
          maxX = p.x
          minY = p.y
          maxY = p.y
        }
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
        seen = seen + 1
      }
    }
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
    let bx0 = 0.0
    let by0 = 0.0
    let bx1 = 0.0
    let by1 = 0.0
    let bseen = 0
    // An index rather than `Pt[] | null`: a null-initialised typed local has
    // no contextual type on either target ('nil' requires a contextual type /
    // Nothing? expected).
    let bestAt = -1
    let bestArea = -1.0
    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri]!
      for (const p of ring) {
        if (bseen === 0) {
          bx0 = p.x
          by0 = p.y
          bx1 = p.x
          by1 = p.y
        }
        if (p.x < bx0) bx0 = p.x
        if (p.y < by0) by0 = p.y
        if (p.x > bx1) bx1 = p.x
        if (p.y > by1) by1 = p.y
        bseen = bseen + 1
      }
      const a = Math.abs(ringArea(ring))
      if (a > bestArea) {
        bestArea = a
        bestAt = ri
      }
    }
    const bbox: Rect = bseen === 0 ? { x: box.x, y: box.y, w: 0.0, h: 0.0 } : { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }
    const fallback: Pt = { x: bbox.x + bbox.w / 2.0, y: bbox.y + bbox.h / 2.0 }
    const centroid = bestAt < 0 ? fallback : ringCentroid(rings[bestAt]!) ?? fallback
    return { name: r.name, rings, centroid, bbox }
  })
  return { regions, transform: { minX, maxY, scale, ox, oy, projection } }
}

/** Value extent over the regions that have data. */
export function geoDomain(layout: GeoLayout, values: GeoValue[]): Domain {
  let lo = 0.0
  let hi = 0.0
  let seen = 0
  for (const r of layout.regions) {
    const v = geoValueOf(values, r.name)
    if (!isFiniteNumber(v)) continue
    if (seen === 0) {
      lo = v
      hi = v
    }
    if (v < lo) lo = v
    if (v > hi) hi = v
    seen = seen + 1
  }
  return seen === 0 ? { min: 0.0, max: 0.0 } : { min: lo, max: hi }
}

/** Render fills, borders, then labels. */
export function renderGeo(layout: GeoLayout, values: GeoValue[], options?: GeoOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const stops = options?.stops ?? HEAT_RAMP
  const emptyColor = options?.emptyColor ?? '#e2e8f0'
  const border = options?.borderColor ?? '#ffffff'
  const borderWidth = options?.borderWidth ?? 1.0
  const dom = options?.domain ?? geoDomain(layout, values)
  const lo = dom.min
  const hi = dom.max
  const span = hi - lo
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const fontSize = options?.fontSize ?? 10.0
  const labelColor = options?.labelColor ?? '#1e293b'
  const m: MeasureText = measure ?? approxTextWidth
  for (const r of layout.regions) {
    const v = geoValueOf(values, r.name)
    const has = isFiniteNumber(v) && progress > 0.0
    const t = !has ? 0.0 : span <= 0.0 ? 1.0 : ((v - lo) / span) * progress
    const fill = has ? rampColor(stops, t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t) : emptyColor
    for (const ring of r.rings) out.push({ kind: 'polygon', points: ring, fill })
  }
  for (const r of layout.regions) {
    for (const ring of r.rings) {
      const closed: Pt[] = []
      for (const p of ring) closed.push(p)
      closed.push(ring[0]!)
      out.push({ kind: 'polyline', points: closed, stroke: border, width: borderWidth })
    }
  }
  if (options?.showLabels === true && progress >= 1.0) {
    for (const r of layout.regions) {
      // A label goes on LAND: the centroid must sit inside one of the region's
      // rings (a multi-island region's centroid is usually in the water between
      // them), and the text must fit THAT ring's box, not the union's.
      let hostAt = -1
      for (let hri = 0; hri < r.rings.length; hri++) if (pointInRing(r.rings[hri]!, r.centroid.x, r.centroid.y)) hostAt = hri
      if (hostAt < 0) continue
      const b = ringBox(r.rings[hostAt]!)
      if (m(r.name, fontSize) > b.w || fontSize > b.h) continue
      out.push({ kind: 'text', text: r.name, at: r.centroid, fill: labelColor, size: fontSize, align: 'middle', baseline: 'middle' })
    }
  }
  return out
}

function ringBox(ring: Pt[]): Rect {
  let x0 = 0.0
  let y0 = 0.0
  let x1 = 0.0
  let y1 = 0.0
  let seen = 0
  for (const p of ring) {
    if (seen === 0) {
      x0 = p.x
      y0 = p.y
      x1 = p.x
      y1 = p.y
    }
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
    seen = seen + 1
  }
  return seen === 0 ? { x: 0.0, y: 0.0, w: 0.0, h: 0.0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function pointInRing(ring: Pt[], px: Double, py: Double): boolean {
  let inside = false
  for (let i = 0; i < ring.length; i++) {
    const j = i === 0 ? ring.length - 1 : i - 1
    const a = ring[i]!
    const b = ring[j]!
    // Parenthesised: Swift puts `>` and `!==` in the same non-associative
    // precedence group, so the chained form is a compile error there even
    // though JS reads it fine.
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
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

