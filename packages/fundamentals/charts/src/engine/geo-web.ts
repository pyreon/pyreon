// The web-facing half of the geo family: GeoJSON parsing, the name registry,
// the record → value-list adapter, and the SVG helper.
//
// The geometry in `geo.ts` is the half that crosses into the native engine,
// and it speaks in `GeoShape` rings and `GeoValue` lists — the shapes that
// have a native form. Two things kept here specifically because they do not:
//
//   - GeoJSON's `geometry` is a `Polygon | MultiPolygon` union whose
//     `coordinates` are `number[][][]` and `number[][][][]`, one field at two
//     array depths, which the fat-struct lowering refuses to merge.
//   - `Record<string, Double>` subscripts to an Optional on Swift, and the
//     `!== undefined` narrowing does not carry to the target.
//
// Same split, and the same reasons, as `calendar.ts` / `calendar-web.ts`.

import { geoDomainAligned, geoOptionParams, layoutGeoShapes, renderGeoAligned } from './geo'
import { geoProjectionParams, projectLonLatWith } from './geo-projection'
import { geoWrapsLongitude } from './geo-projection'
import type { GeoProjectionParams } from './geo-projection'
import type { GeoLayout, GeoOptions, GeoProjection, GeoShape, GeoValue } from './geo'
import { renderGeoBelow, renderGeoFlows, renderGeoSizeLegend } from './geo-layers'
import type { GeoFlow, GeoFlowOptions, GeoSizeLegendOptions } from './geo-layers'
import { geoHeatStops, renderGeoHeat, renderGeoOverlayPaths, renderGeoOverlayPoints, renderGeoPies } from './geo-overlay'
import type { GeoHeatPoint, GeoOverlayOptions, GeoOverlayPath, GeoOverlayPoint, GeoPie } from './geo-overlay'
import { isTopology, topoToGeo } from './geo-topo'
import type { Topology } from './geo-topo'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

export interface GeoFeature {
  type: 'Feature'
  /** The feature's own id (joined against with `idProperty: 'id'`). */
  id?: string | number | undefined
  properties?: Record<string, unknown> | null | undefined
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
    | { type: 'Point'; coordinates: number[] }
    | { type: 'MultiPoint'; coordinates: number[][] }
    | { type: 'LineString'; coordinates: number[][] }
    | { type: 'MultiLineString'; coordinates: number[][][] }
    | null
}

export interface GeoJson {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

/**
 * A map as a module ships it: the data (GeoJSON, or TopoJSON with the object to read) and the choices that go with
 * it. `<MapChart map={definition}>` and `registerMap(name, definition)` take one; a per-map default (a projection
 * that suits it, the property that names its regions) lives here so the call site does not repeat it, and an
 * explicit `options` still wins.
 */
export interface MapDefinition {
  data: GeoJson | Topology
  /** The TopoJSON object to read; default the first. */
  object?: string | undefined
  projection?: GeoProjection | undefined
  nameProperty?: string | undefined
  idProperty?: string | undefined
}

/** Whether `x` is a `MapDefinition` (an object carrying `data`). */
export function isMapDefinition(x: unknown): x is MapDefinition {
  return typeof x === 'object' && x !== null && 'data' in x && (isTopology((x as { data: unknown }).data) || (x as { data: { type?: unknown } }).data?.type === 'FeatureCollection')
}

/** What the registry keeps per name: the decoded GeoJSON and the map's own defaults. */
interface RegisteredMap {
  geo: GeoJson
  projection?: GeoProjection | undefined
  nameProperty?: string | undefined
  idProperty?: string | undefined
}

const registry = new Map<string, RegisteredMap>()

/** Decode a map source (GeoJSON, TopoJSON or a definition) to GeoJSON plus the defaults it carries. */
export function resolveMapSource(source: GeoJson | Topology | MapDefinition, object?: string): RegisteredMap {
  if (isMapDefinition(source)) {
    const data = source.data
    return { geo: isTopology(data) ? topoToGeo(data, source.object ?? object) : data, projection: source.projection, nameProperty: source.nameProperty, idProperty: source.idProperty }
  }

  return { geo: isTopology(source) ? topoToGeo(source, object) : source }
}

/**
 * Register (or replace) a map under a name, for `<MapChart map="name">`. The source is GeoJSON, TopoJSON (decoded
 * once, here) or a `MapDefinition`; `projection`, `nameProperty`, `idProperty` and `object` set that map's defaults
 * (an explicit chart option still wins).
 */
export function registerMap(name: string, source: GeoJson | Topology | MapDefinition, options: { projection?: GeoProjection; nameProperty?: string; idProperty?: string; object?: string } = {}): void {
  const base = resolveMapSource(source, options.object)
  registry.set(name, {
    geo: base.geo,
    projection: options.projection ?? base.projection,
    nameProperty: options.nameProperty ?? base.nameProperty,
    idProperty: options.idProperty ?? base.idProperty,
  })
}

/** A registered map as GeoJSON, or null. */
export function getMap(name: string): GeoJson | null {
  return registry.get(name)?.geo ?? null
}

/** A registered map with its defaults, or null. */
export function getMapDefinition(name: string): RegisteredMap | null {
  return registry.get(name) ?? null
}

/** Registered map names. */
export function listMaps(): string[] {
  return Array.from(registry.keys())
}

/** Longitude/latitude → unit-ish coordinates (x east, y NORTH-up; flipped at fit time). */

/**
 * `{ West: 10 }` → `[{ name: 'West', value: 10 }]`.
 *
 * The record is the ergonomic shape for a caller and the list is the one that
 * crosses, so the conversion lives on the web side — exactly as
 * `calendar-web.ts` adapts a date record into `{ date, value }` entries.
 */
export function geoValues(values: Record<string, Double>): GeoValue[] {
  const out: GeoValue[] = []
  for (const name of Object.keys(values)) {
    const v = values[name]
    if (v !== undefined) out.push({ region: name, value: v })
  }

  return out
}

/** The region values aligned to `names`, in order (`NaN` for a region without one): one pass over a record or a list, whatever its size. */
export function alignGeoValues(names: readonly string[], values: Record<string, Double> | readonly GeoValue[]): Double[] {
  const out: Double[] = []
  if (Array.isArray(values)) {
    const byName = new Map<string, Double>()
    for (const v of values as readonly GeoValue[]) byName.set(v.region, v.value)
    for (const n of names) out.push(byName.get(n) ?? Number.NaN)

    return out
  }
  const rec = values as Record<string, Double>
  for (const n of names) out.push(Object.hasOwn(rec, n) ? (rec[n] as Double) : Number.NaN)

  return out
}

/** The shapes of a GeoJSON and, beside them, each feature's own properties (web-only: the tooltip formatter reads them). */
export interface GeoSource {
  shapes: GeoShape[]
  properties: (Record<string, unknown> | null)[]
  /** The Point and MultiPoint features, as point marks (named by the feature's name property). */
  points: GeoOverlayPoint[]
  /** The LineString and MultiLineString features, as geographic paths. */
  lines: GeoOverlayPath[]
}

/**
 * GeoJSON to normalised shapes — the WEB half, and the only part that touches
 * the `Polygon | MultiPolygon` union or the untyped `properties` bag. Both are
 * why the geo host does not cross; reducing here means everything downstream
 * works on `GeoShape[]`, which does.
 *
 * `nameProperty` is the DISPLAY name (default `name`). `idProperty` picks what values are joined
 * against: `'id'` (the feature's own `id`) or any property key; absent, the display name is the key.
 */
export function geoFeatures(geo: GeoJson, projection: GeoProjection = 'equirectangular', nameProperty = 'name', idProperty?: string, params: GeoProjectionParams = geoProjectionParams(projection)): GeoSource {
  const shapes: GeoShape[] = []
  const properties: (Record<string, unknown> | null)[] = []
  const points: GeoOverlayPoint[] = []
  const lines: GeoOverlayPath[] = []
  for (let fi = 0; fi < geo.features.length; fi++) {
    const f = geo.features[fi]!
    const g = f.geometry
    if (g === null) continue
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') {
      collectMarks(g, typeof f.properties?.[nameProperty] === 'string' ? (f.properties[nameProperty] as string) : undefined, points, lines)
      continue
    }
    const { rings, holes, holeHost } = featureRings(g.type === 'Polygon' ? [g.coordinates] : g.coordinates, projection, params)
    const propName = f.properties?.[nameProperty]
    const label = typeof propName === 'string' ? propName : 'Region ' + String(fi + 1)
    const key = joinKey(f, idProperty) ?? label
    const base = key === label ? { name: key, rings } : { name: key, label, rings }
    shapes.push(holes.length > 0 ? { ...base, holes, holeHost } : base)
    properties.push(f.properties ?? null)
  }

  return { shapes, properties, points, lines }
}

/** A Point, MultiPoint, LineString or MultiLineString feature as point marks and geographic paths. */
function collectMarks(g: NonNullable<GeoFeature['geometry']>, name: string | undefined, points: GeoOverlayPoint[], lines: GeoOverlayPath[]): void {
  const at = (c: number[]): { lon: number; lat: number } => ({ lon: c[0] ?? 0, lat: c[1] ?? 0 })
  if (g.type === 'Point') points.push({ ...at(g.coordinates), ...(name === undefined ? {} : { name }) })
  else if (g.type === 'MultiPoint') for (const c of g.coordinates) points.push({ ...at(c), ...(name === undefined ? {} : { name }) })
  else if (g.type === 'LineString') lines.push({ coords: g.coordinates.map(at) })
  else if (g.type === 'MultiLineString') for (const line of g.coordinates) lines.push({ coords: line.map(at) })
}

/** What a feature's values are joined on: its own id, a property, or nothing (the caller falls back to the display name). */
function joinKey(f: GeoFeature, idProperty: string | undefined): string | undefined {
  if (idProperty === undefined) return undefined
  const raw = idProperty === 'id' ? f.id : f.properties?.[idProperty]

  return raw === undefined || raw === null ? undefined : String(raw)
}

/** The projected outer rings of a feature's polygons, with each polygon's inner rings and the outer ring each cuts. */
/** The ring as an array without its closing duplicate, longitudes made continuous (a step of more than 180 degrees is the seam: shift by a turn). */
function unwrapRing(coords: number[][]): number[][] {
  const open = coords.length > 1 && coords[0]![0] === coords[coords.length - 1]![0] && coords[0]![1] === coords[coords.length - 1]![1] ? coords.slice(0, -1) : coords
  const out: number[][] = []
  let prev = 0
  for (let i = 0; i < open.length; i++) {
    let lon = open[i]![0] ?? 0
    if (i > 0) {
      while (lon - prev > 180) lon -= 360
      while (lon - prev < -180) lon += 360
    }
    out.push([lon, open[i]![1] ?? 0])
    prev = lon
  }

  return out
}

/** Sutherland-Hodgman against one vertical line of longitude: keep the side where `keep(lon)` holds. */
function clipLon(ring: number[][], edge: number, keep: (lon: number) => boolean): number[][] {
  const out: number[][] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const ka = keep(a[0]!)
    const kb = keep(b[0]!)
    if (ka) out.push(a)
    if (ka !== kb) out.push([edge, a[1]! + ((b[1]! - a[1]!) * (edge - a[0]!)) / (b[0]! - a[0]!)])
  }

  return out
}

/**
 * A ring cut at the seam half a turn either side of the central meridian `lon0`: the pieces that fall inside the window
 * `[lon0 - 180, lon0 + 180]`, each closed along the seam. A ring that never reaches the seam comes back whole (shifted by
 * whole turns into the window). This is what keeps Russia, Fiji or the Aleutians from drawing a chord across the map.
 */
export function cutRingAtSeam(coords: number[][], lon0: number): number[][][] {
  const lo = lon0 - 180
  const hi = lon0 + 180
  const ring = unwrapRing(coords)
  if (ring.length < 3) return []
  const first = ring[0]![0]!
  const turn = Math.round((first - lon0) / 360) * 360
  const shifted = ring.map((p) => [p[0]! - turn, p[1]!])
  if (shifted.every((p) => p[0]! >= lo && p[0]! <= hi)) return [[...shifted, shifted[0]!]]
  const pieces: number[][][] = []
  for (const k of [-1, 0, 1]) {
    const moved = shifted.map((p) => [p[0]! + 360 * k, p[1]!])
    const cut = clipLon(clipLon(moved, lo, (lon) => lon >= lo), hi, (lon) => lon <= hi)
    if (cut.length >= 3) pieces.push([...cut, cut[0]!])
  }

  return pieces
}

/** A hole moved by whole turns to sit where its outer ring was put by `cutRingAtSeam` (the same shift), unwrapped like it. */
function alignHole(inner: number[][], outer: number[][], lon0: number): number[][] {
  const ring = unwrapRing(outer)
  const turn = Math.round((ring[0]![0]! - lon0) / 360) * 360
  const hole = unwrapRing(inner)
  const near = Math.round((hole[0]![0]! - ring[0]![0]!) / 360) * 360

  return [...hole.map((p) => [p[0]! - near - turn, p[1]!]), [hole[0]![0]! - near - turn, hole[0]![1]!]]
}

function featureRings(polys: number[][][][], projection: GeoProjection, params: GeoProjectionParams): { rings: Pt[][]; holes: Pt[][]; holeHost: number[] } {
  const rings: Pt[][] = []
  const holes: Pt[][] = []
  const holeHost: number[] = []
  for (const poly of polys) {
    const outer = poly[0]
    if (outer === undefined || outer.length < 3) continue
    for (const piece of geoWrapsLongitude(projection) ? cutRingAtSeam(outer, params.lon0) : [outer]) rings.push(projectRing(piece, projection, params))
    // Inner rings belong to THIS polygon's outer ring.
    for (let hi = 1; hi < poly.length; hi++) {
      const inner = poly[hi]!
      if (inner.length < 3) continue
      holes.push(projectRing(geoWrapsLongitude(projection) ? alignHole(inner, outer, params.lon0) : inner, projection, params))
      holeHost.push(rings.length - 1)
    }
  }

  return { rings, holes, holeHost }
}

/** `geoFeatures(...).shapes`. */
export function geoShapes(geo: GeoJson, projection: GeoProjection = 'equirectangular', nameProperty = 'name', idProperty?: string, params: GeoProjectionParams = geoProjectionParams(projection)): GeoShape[] {
  return geoFeatures(geo, projection, nameProperty, idProperty, params).shapes
}

function projectRing(coords: number[][], projection: GeoProjection, params: GeoProjectionParams): Pt[] {
  const ring: Pt[] = []
  for (const c of coords) ring.push(projectLonLatWith(c[0] ?? 0.0, c[1] ?? 0.0, projection, params))

  return ring
}

/** Project every feature's outer rings and fit them into `box` (aspect preserved, centred). */
export function layoutGeo(geo: GeoJson | Topology | MapDefinition, box: Rect, options?: GeoOptions): GeoLayout {
  const base = resolveMapSource(geo)
  const projection = options?.projection ?? base.projection ?? 'equirectangular'

  return layoutGeoShapes(geoShapes(base.geo, projection, options?.nameProperty ?? base.nameProperty ?? 'name', options?.idProperty ?? base.idProperty, geoOptionParams(projection, options)), box, { ...options, projection })
}

export interface GeoToSvgOptions {
  /** GeoJSON, TopoJSON or a `MapDefinition`. */
  geo: GeoJson | Topology | MapDefinition
  values: Record<string, Double> | readonly GeoValue[]
  width?: Double
  height?: Double
  options?: GeoOptions
  /** Point marks over the regions (the live host's `points`). */
  points?: readonly GeoOverlayPoint[] | undefined
  /** Geographic paths below the points (`paths`). */
  paths?: readonly GeoOverlayPath[] | undefined
  /** A heat layer (`heat`, `heatRadius`, `heatStops`). */
  heat?: readonly GeoHeatPoint[] | undefined
  heatRadius?: Double | undefined
  heatStops?: readonly string[] | undefined
  /** Pies at geographic points (`pies`). */
  pies?: readonly GeoPie[] | undefined
  /** Appearance of the point and path overlays (`overlayOptions`). */
  overlayOptions?: GeoOverlayOptions | undefined
  /** Great-circle flows and their options (`flows`, `flowOptions`). */
  flows?: readonly GeoFlow[] | undefined
  flowOptions?: GeoFlowOptions | undefined
  /** A size key for the point marks (`sizeLegend`). */
  sizeLegend?: boolean | GeoSizeLegendOptions | undefined
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** The overlay layers of a `geoToSvg` call, in the live host's order: heat, paths, pies, points. */
function geoOverlayCmds(layout: GeoLayout, o: GeoToSvgOptions): DrawCmd[] {
  return [
    ...renderGeoHeat(layout, o.heat ?? [], geoHeatStops([...(o.heatStops ?? [])], [...(o.options?.stops ?? [])]), o.heatRadius ?? 20.0, 1.0),
    ...renderGeoOverlayPaths(layout, o.paths ?? [], o.overlayOptions),
    ...renderGeoFlows(layout, o.flows ?? [], o.flowOptions),
    ...renderGeoPies(layout, o.pies ?? [], 1.0),
    ...renderGeoOverlayPoints(layout, o.points ?? [], o.overlayOptions),
    ...(o.sizeLegend === undefined || o.sizeLegend === false ? [] : renderGeoSizeLegend(o.points ?? [], { x: 0.0, y: 0.0, w: o.width ?? 640.0, h: o.height ?? 400.0 }, { radius: o.overlayOptions?.radius, color: o.overlayOptions?.color, ...(o.sizeLegend === true ? {} : o.sizeLegend) })),
  ]
}

/** Map → `<svg>` string, server-safe: the same layers, in the same order, as the live `<MapChart>`. */
export function geoToSvg(o: GeoToSvgOptions): string {
  const width = o.width ?? 640.0
  const height = o.height ?? 400.0
  const layout = layoutGeo(o.geo, { x: 0.0, y: 0.0, w: width, h: height }, o.options)
  const m = o.measure ?? measureApprox()
  const aligned = alignGeoValues(layout.regions.map((r) => r.name), o.values)
  const cmds = [...renderGeoBelow(layout, o.options), ...renderGeoAligned(layout, aligned, o.options, m), ...geoOverlayCmds(layout, o)]
  const dom = geoDomainAligned(aligned)
  const filled = aligned.filter((v) => Number.isFinite(v)).length
  const overlays = (o.points?.length ?? 0) + (o.paths?.length ?? 0)
  const description = o.description ?? (o.title !== undefined ? `${o.title}: ${layout.regions.length} regions, ${filled} with values from ${dom.min} to ${dom.max}${overlays > 0 ? `, ${overlays} points and paths` : ''}.` : undefined)

  return renderSvg(cmds, width, height, {
    ...o.svg,
    ...(o.title !== undefined ? { title: o.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
