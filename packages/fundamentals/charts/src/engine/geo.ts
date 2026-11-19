// Geo — GeoJSON regions projected into a box, filled by value.
//
// The registry is module-level on purpose: maps are static assets registered
// once at startup (ECharts' registerMap shape), bounded by the app's map
// count, and looked up by name when a `<MapChart map>` names one.

import { HEAT_RAMP, rampColor, visualOutside } from './heat'
import { approxTextWidth } from './treemap'
import type { ChartPattern, Domain, Double, DrawCmd, MeasureText, Pt, Rect } from './types'
import { isFiniteNumber } from './scale'
import { geoProjectionParams, projectLonLatWith, unprojectLonLatWith } from './geo-projection'
import type { GeoProjectionParams } from './geo-projection'

/**
 * The default colour ramps of a MAP, low to high, one per ground. They are the map's own, not the theme's ramp, because
 * a map has to stay readable at BOTH ends: the theme's dark ramp starts at `#172033`, which is the page, so the lowest
 * regions vanished. Every stop here keeps at least 3:1 against the dark page (`#141821`) and the light ramp's lightest
 * stop 1.4:1 against white (a light map's lightest region sits beside white borders by design), and contrast rises with
 * the value on both. A test locks the numbers.
 */
export const GEO_RAMP_LIGHT: readonly string[] = ['#b0d0fc', '#60a5fa', '#2563eb', '#1e3a8a']
export const GEO_RAMP_DARK: readonly string[] = ['#3f64c8', '#5b8def', '#9ec1ff', '#d6e6ff']

export type GeoProjection = 'equirectangular' | 'mercator' | 'equalEarth' | 'naturalEarth1' | 'albers' | 'albersUsa'

export interface GeoRegion {
  /** The join key values are matched against (the feature's name, or its id / chosen property). */
  name: string
  /** What is drawn and announced: the feature's display name. Equals `name` unless a join property was chosen. */
  label: string
  /** Outer rings in pixel space. */
  rings: Pt[][]
  /** Inner rings (holes: lakes, enclaves) in pixel space; stroked, and cut out of the fill. */
  holes: Pt[][]
  /**
   * What is FILLED and hit-tested, one ring per outer ring: the outer ring itself, or, when it has holes, one ring
   * that runs into each hole along a zero-width bridge and back out (a "keyhole" polygon). A plain polygon with
   * that ring fills as the outer shape with the holes cut out under EVERY fill rule, so no draw executor (canvas,
   * SVG, either native runtime, the tween, the mirror) needed to learn about holes.
   */
  fills: Pt[][]
  /** For each hole, the index of the outer ring (in `rings`) it cuts out of. */
  holeHost: number[]
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
  /** The join key (see `GeoRegion.name`). */
  name: string
  /** The display name; absent means `name`. */
  label?: string | undefined
  rings: readonly (readonly Pt[])[]
  /** Inner rings (lakes, enclaves); absent for a shape without any. */
  holes?: readonly (readonly Pt[])[] | undefined
  /** For each hole, the index of the outer ring in `rings` it belongs to. */
  holeHost?: readonly number[] | undefined
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
export function geoValueOf(values: readonly GeoValue[], name: string): Double {
  for (const v of values) if (v.region === name) return v.value
  return GEO_NA
}

/**
 * The values in REGION order, one entry per region (`NaN` for none): what a frame reads, so a roam frame does one
 * array read per region instead of scanning the value list for each. Built once per (regions, values) change.
 */
export function geoAlign(layout: GeoLayout, values: readonly GeoValue[]): Double[] {
  const out: Double[] = []
  for (const r of layout.regions) out.push(geoValueOf(values, r.name))

  return out
}

export interface GeoTransform {
  minX: Double
  maxY: Double
  scale: Double
  ox: Double
  oy: Double
  projection: GeoProjection
  /** The projection's numeric parameters (central meridian, origin latitude, Albers parallels). */
  params: GeoProjectionParams
}

export interface GeoLayout {
  regions: GeoRegion[]
  /** Pixel transform used, so overlays (scatter on geo) can reuse it. */
  transform: GeoTransform
}

/** The `layout.project(lon, lat)` closure, as a free function over the data. */
export function geoProject(t: GeoTransform, lon: Double, lat: Double): Pt {
  const p = projectLonLatWith(lon, lat, t.projection, t.params)
  return { x: t.ox + (p.x - t.minX) * t.scale, y: t.oy + (t.maxY - p.y) * t.scale }
}

/**
 * The inverse of `geoProject`: a pixel on the map to `{ x: lon, y: lat }` in degrees (what a tooltip or a drawing tool
 * wants). Valid inside the projection's domain; a pixel off the map's shape unprojects to a meaningless point.
 */
export function geoUnproject(t: GeoTransform, px: Double, py: Double): Pt {
  return unprojectLonLatWith((px - t.ox) / t.scale + t.minX, t.maxY - (py - t.oy) / t.scale, t.projection, t.params)
}

export interface GeoOptions {
  projection?: GeoProjection | undefined
  padding?: Double | undefined
  /** The central meridian of a world or Albers projection, degrees (default 0; -96 for `albers`). */
  centerLon?: Double | undefined
  /** The latitude of origin of an Albers conic, degrees (it only shifts the picture; the fit removes it). */
  centerLat?: Double | undefined
  /** The first Albers standard parallel, degrees (default 29.5). */
  parallel1?: Double | undefined
  /** The second Albers standard parallel, degrees (default 45.5). */
  parallel2?: Double | undefined
  /** Property holding the region's DISPLAY name; default `name`. */
  nameProperty?: string | undefined
  /** What values are joined against: `'id'` (the feature's own `id`) or a property key; absent, the display name. Web-only: it reads GeoJSON. */
  idProperty?: string | undefined
  stops?: readonly string[] | undefined
  domain?: Domain | undefined
  emptyColor?: string | undefined
  /** When set, a region with NO value is hatched in this colour over the empty fill, so it reads as "no data" and not as a low value. */
  hatchColor?: string | undefined
  borderColor?: string | undefined
  borderWidth?: Double | undefined
  showLabels?: boolean | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  /** Entrance progress 0..1; regions fade in from the empty colour. */
  progress?: Double | undefined
  /** Roam view: magnification about the fitted map's centre (1 = fitted). */
  zoom?: Double | undefined
  /** Roam view: pixel offset applied after the zoom. */
  panX?: Double | undefined
  panY?: Double | undefined
  /** The region index the pointer is over (emphasis outline); absent or -1 for none. */
  hover?: number | undefined
  /** The selected region indices (selection outline). */
  selected?: readonly number[] | undefined
  /** Outline colour of the hovered region. */
  emphasisColor?: string | undefined
  /** Outline colour of the selected regions. */
  selectColor?: string | undefined
  /** visualMap selection: values outside it paint `outColor` (see `visualOutside`). */
  inRange?: Domain | undefined
  outBands?: Double[] | undefined
  outColor?: string | undefined
}

/** lon/lat to the plane of `projection` with its default parameters (see `projectLonLatWith`). */
export function projectLonLat(lon: Double, lat: Double, projection: GeoProjection): Pt {
  return projectLonLatWith(lon, lat, projection, geoProjectionParams(projection))
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

/** The projection parameters a set of options names, defaults filled in. */
export function geoOptionParams(projection: GeoProjection, options?: GeoOptions): GeoProjectionParams {
  return geoProjectionParams(projection, options?.centerLon, options?.centerLat, options?.parallel1, options?.parallel2)
}

export function layoutGeoShapes(shapes: readonly GeoShape[], box: Rect, options?: GeoOptions): GeoLayout {
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
  const fitScale = raw.length === 0 || spanX <= 0.0 || spanY <= 0.0 ? 1.0 : Math.min(innerW / spanX, innerH / spanY)
  const fitOx = box.x + pad + (innerW - spanX * fitScale) / 2.0
  const fitOy = box.y + pad + (innerH - spanY * fitScale) / 2.0
  // Roam: zoom about the box centre, then pan. Every pixel below (regions,
  // centroids, bboxes, and the transform overlays reuse) goes through these.
  const zoom = (options?.zoom ?? 1.0) > 0.0 ? options?.zoom ?? 1.0 : 1.0
  const cx = box.x + box.w / 2.0
  const cy = box.y + box.h / 2.0
  const scale = fitScale * zoom
  const ox = cx + (fitOx - cx) * zoom + (options?.panX ?? 0.0)
  const oy = cy + (fitOy - cy) * zoom + (options?.panY ?? 0.0)
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
    const holes = (r.holes ?? []).map((ring) => ring.map(toPx))
    const bbox: Rect = bseen === 0 ? { x: box.x, y: box.y, w: 0.0, h: 0.0 } : { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }
    const fallback: Pt = { x: bbox.x + bbox.w / 2.0, y: bbox.y + bbox.h / 2.0 }
    const centroid = bestAt < 0 ? fallback : ringCentroid(rings[bestAt]!) ?? fallback
    const host = [...(r.holeHost ?? [])]
    const fills = rings.map((ring, ri) => bridgeHoles(ring, holes.filter((_h, k) => k < host.length && host[k] === ri)))

    return { name: r.name, label: r.label ?? r.name, rings, holes, holeHost: host, fills, centroid, bbox }
  })

  return { regions, transform: { minX, maxY, scale, ox, oy, projection, params: geoOptionParams(projection, options) } }
}

/** A roam view: the zoom and pan a host keeps between frames. */
export interface GeoView {
  zoom: Double
  panX: Double
  panY: Double
}

/**
 * Zoom a view by `factor` about the pointer at (px, py), keeping the map point
 * under the pointer fixed, with the zoom clamped to [minZoom, maxZoom].
 */
export function geoRoamZoom(view: GeoView, factor: Double, px: Double, py: Double, box: Rect, minZoom: Double, maxZoom: Double): GeoView {
  const lo = minZoom > 0.0 ? minZoom : 0.1
  const hi = maxZoom >= lo ? maxZoom : lo
  const wanted = view.zoom * factor
  const zoom = wanted < lo ? lo : wanted > hi ? hi : wanted
  const k = zoom / view.zoom
  const cx = box.x + box.w / 2.0
  const cy = box.y + box.h / 2.0
  // A point p on screen came from cx + (q - cx)*z + pan; holding p fixed across
  // the zoom change solves for the new pan.
  const panX = (px - cx) - (px - cx - view.panX) * k
  const panY = (py - cy) - (py - cy - view.panY) * k

  return { zoom, panX, panY }
}

/** Pan a view by a pointer delta. */
export function geoRoamPan(view: GeoView, dx: Double, dy: Double): GeoView {
  return { zoom: view.zoom, panX: view.panX + dx, panY: view.panY + dy }
}

/** Value extent over the regions that have data. */
export function geoDomain(layout: GeoLayout, values: readonly GeoValue[]): Domain {
  return geoDomainAligned(geoAlign(layout, values))
}

/** `geoDomain` over region-aligned values (see `geoAlign`). */
export function geoDomainAligned(aligned: readonly Double[]): Domain {
  let lo = 0.0
  let hi = 0.0
  let seen = 0
  for (const v of aligned) {
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
export function renderGeo(layout: GeoLayout, values: readonly GeoValue[], options?: GeoOptions, measure?: MeasureText): DrawCmd[] {
  return renderGeoAligned(layout, geoAlign(layout, values), options, measure)
}

/** `renderGeo` over region-aligned values (see `geoAlign`): one array read per region, no lookup. */
export function renderGeoAligned(layout: GeoLayout, aligned: readonly Double[], options?: GeoOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const stops = options?.stops ?? HEAT_RAMP
  const emptyColor = options?.emptyColor ?? '#e2e8f0'
  const border = options?.borderColor ?? '#ffffff'
  const borderWidth = options?.borderWidth ?? 1.0
  const dom = options?.domain ?? geoDomainAligned(aligned)
  const lo = dom.min
  const hi = dom.max
  const span = hi - lo
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const fontSize = options?.fontSize ?? 10.0
  const labelColor = options?.labelColor ?? '#1e293b'
  const m: MeasureText = measure ?? approxTextWidth
  for (let i = 0; i < layout.regions.length; i++) {
    const r = layout.regions[i]!
    const v = i < aligned.length ? aligned[i]! : GEO_NA
    const has = isFiniteNumber(v) && progress > 0.0
    const t = !has ? 0.0 : span <= 0.0 ? 1.0 : ((v - lo) / span) * progress
    const hatched = !has && (options?.hatchColor ?? '') !== ''
    const fill = !has ? emptyColor : visualOutside(v, options?.inRange, options?.outBands) ? options?.outColor ?? '#cccccc' : rampColor(stops, t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t)
    const hatch: ChartPattern | undefined = hatched ? { kind: 'diagonal', color: options?.hatchColor ?? '#64748b', spacing: 5.0, width: 1.0 } : undefined
    for (const ring of r.fills) out.push({ kind: 'polygon', points: ring, fill, pattern: hatch })
  }
  for (const r of layout.regions) {
    for (const ring of r.rings) out.push(closedLine(ring, border, borderWidth))
    for (const ring of r.holes) out.push(closedLine(ring, border, borderWidth))
  }
  // Emphasis and selection outlines go over every border, so a neighbour's edge never hides them.
  const hover = options?.hover ?? -1
  for (const si of options?.selected ?? []) for (const c of outlineRegion(layout, si, options?.selectColor ?? '#2563eb', borderWidth + 2.0)) out.push(c)
  for (const c of outlineRegion(layout, hover, options?.emphasisColor ?? '#0f172a', borderWidth + 1.5)) out.push(c)
  if (options?.showLabels === true && progress >= 1.0) {
    for (const r of layout.regions) {
      // A label goes on LAND: the centroid must sit inside one of the region's
      // rings (a multi-island region's centroid is usually in the water between
      // them), and the text must fit THAT ring's box, not the union's.
      let hostAt = -1
      for (let hri = 0; hri < r.rings.length; hri++) if (pointInRing(r.rings[hri]!, r.centroid.x, r.centroid.y)) hostAt = hri
      if (hostAt < 0) continue
      const b = ringBox(r.rings[hostAt]!)
      if (m(r.label, fontSize) > b.w || fontSize > b.h) continue
      out.push({ kind: 'text', text: r.label, at: r.centroid, fill: labelColor, size: fontSize, align: 'middle', baseline: 'middle' })
    }
  }

  return out
}

/** A heavier closed outline around every ring of region `ri` (nothing for an index out of range). */
function outlineRegion(layout: GeoLayout, ri: number, stroke: string, width: Double): DrawCmd[] {
  const out: DrawCmd[] = []
  if (ri < 0 || ri >= layout.regions.length) return out
  const r = layout.regions[ri]!
  for (const ring of r.rings) out.push(closedLine(ring, stroke, width))
  for (const ring of r.holes) out.push(closedLine(ring, stroke, width))

  return out
}

/**
 * `outer` with each of `holes` joined in along a zero-width bridge: the ring walks to the nearest outer vertex a hole
 * can see, around the hole, and back along the same edge. Filled, it is the outer shape with the holes cut out under
 * the nonzero and the even-odd rule alike (a hole is wound against the outer ring), and a crossing-number test sees
 * the bridge twice. A hole with no visible vertex is left out of the fill (it is still stroked).
 */
export function bridgeHoles(outer: Pt[], holes: Pt[][]): Pt[] {
  if (holes.length === 0) return outer
  const sign = ringArea(outer) >= 0.0 ? 1.0 : -1.0
  let ring = outer
  for (let hi = 0; hi < holes.length; hi++) {
    const raw = holes[hi]!
    // Wound AGAINST the outer ring.
    const hole = ringArea(raw) * sign > 0.0 ? reversedRing(raw) : raw
    ring = bridgeOne(ring, hole, holes)
  }

  return ring
}

/** The ring in the opposite direction. */
function reversedRing(ring: Pt[]): Pt[] {
  const out: Pt[] = []
  for (let k = ring.length - 1; k >= 0; k--) out.push(ring[k]!)

  return out
}

/** One hole bridged into `ring`: from its rightmost vertex to the nearest ring vertex that sees it, or `ring` unchanged. */
function bridgeOne(ring: Pt[], hole: Pt[], all: Pt[][]): Pt[] {
  let mi = 0
  for (let k = 1; k < hole.length; k++) if (hole[k]!.x > hole[mi]!.x) mi = k
  const m = hole[mi]!
  // The ring's vertices nearest-first WITHOUT a mutable marker array: each pass takes the smallest (distance, index)
  // after the previous pick.
  let prevD = -1.0
  let prevK = -1
  for (let attempt = 0; attempt < ring.length; attempt++) {
    let best = -1
    let bestD = 0.0
    for (let k = 0; k < ring.length; k++) {
      const d = (ring[k]!.x - m.x) * (ring[k]!.x - m.x) + (ring[k]!.y - m.y) * (ring[k]!.y - m.y)
      const after = d > prevD || (d === prevD && k > prevK)
      if (after && (best < 0 || d < bestD)) {
        best = k
        bestD = d
      }
    }
    if (best < 0) break
    prevD = bestD
    prevK = best
    if (!bridgeClear([ring, ...all], m, ring[best]!)) continue
    const out: Pt[] = []
    for (let k = 0; k <= best; k++) out.push(ring[k]!)
    for (let k = 0; k < hole.length; k++) out.push(hole[(mi + k) % hole.length]!)
    out.push(m)
    for (let k = best; k < ring.length; k++) out.push(ring[k]!)

    return out
  }

  return ring
}

/** The bridge m -> o crosses no edge of any blocking ring (the outline and every hole; edges that share an endpoint with it do not count). */
function bridgeClear(blockers: Pt[][], m: Pt, o: Pt): boolean {
  for (const ring of blockers) if (ringHitsBridge(ring, m, o)) return false

  return true
}

function ringHitsBridge(ring: Pt[], m: Pt, o: Pt): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[i === ring.length - 1 ? 0 : i + 1]!
    if (samePt(a, m) || samePt(b, m) || samePt(a, o) || samePt(b, o)) continue
    if (segmentsCross(m, o, a, b)) return true
  }

  return false
}

function samePt(a: Pt, b: Pt): boolean {
  return a.x === b.x && a.y === b.y
}

/** Proper crossing of segments p1p2 and p3p4 (the orientation test; touching and collinear overlap do not count). */
function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = (p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)
  const d2 = (p4.x - p3.x) * (p2.y - p3.y) - (p4.y - p3.y) * (p2.x - p3.x)
  const d3 = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)
  const d4 = (p2.x - p1.x) * (p4.y - p1.y) - (p2.y - p1.y) * (p4.x - p1.x)

  return ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0)) && ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
}

/** A ring as a closed stroked polyline. */
function closedLine(ring: Pt[], stroke: string, width: Double): DrawCmd {
  const closed: Pt[] = []
  for (const p of ring) closed.push(p)
  closed.push(ring[0]!)

  return { kind: 'polyline', points: closed, stroke, width }
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
  const i = hitGeoIndex(layout, px, py)
  return i < 0 ? null : layout.regions[i]!
}

/**
 * The INDEX of the region under a point, or -1 — the multiplatform-safe twin
 * of `hitGeo`, and the one a native host can call. `hitGeo` returns
 * `GeoRegion | null`, and the web side derived the index with
 * `regions.indexOf(...)`, which is a second linear scan and has no place in a
 * crossing file. Same shape as `hitCalendarIndex` / `hitTreemapIndex`.
 */
export function hitGeoIndex(layout: GeoLayout, px: Double, py: Double): number {
  for (let i = layout.regions.length - 1; i >= 0; i--) {
    const r = layout.regions[i]!
    if (px < r.bbox.x || px > r.bbox.x + r.bbox.w || py < r.bbox.y || py > r.bbox.y + r.bbox.h) continue
    // A point in a lake is not in the country: the fill ring has its holes cut out, and the crossing test counts
    // each bridge twice, so it cancels.
    for (const ring of r.fills) if (pointInRing(ring, px, py)) return i
  }

  return -1
}

