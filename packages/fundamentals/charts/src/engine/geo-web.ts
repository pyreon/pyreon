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

import { geoDomainAligned, layoutGeoShapes, projectLonLat, renderGeoAligned } from './geo'
import type { GeoLayout, GeoOptions, GeoProjection, GeoShape, GeoValue } from './geo'
import { geoHeatStops, renderGeoHeat, renderGeoOverlayPaths, renderGeoOverlayPoints, renderGeoPies } from './geo-overlay'
import type { GeoHeatPoint, GeoOverlayOptions, GeoOverlayPath, GeoOverlayPoint, GeoPie } from './geo-overlay'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

export interface GeoFeature {
  type: 'Feature'
  /** The feature's own id (joined against with `idProperty: 'id'`). */
  id?: string | number | undefined
  properties?: Record<string, unknown> | null | undefined
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] } | null
}

export interface GeoJson {
  type: 'FeatureCollection'
  features: GeoFeature[]
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
export function geoFeatures(geo: GeoJson, projection: GeoProjection = 'equirectangular', nameProperty = 'name', idProperty?: string): GeoSource {
  const shapes: GeoShape[] = []
  const properties: (Record<string, unknown> | null)[] = []
  for (let fi = 0; fi < geo.features.length; fi++) {
    const f = geo.features[fi]!
    const g = f.geometry
    if (g === null) continue
    const { rings, holes, holeHost } = featureRings(g.type === 'Polygon' ? [g.coordinates] : g.coordinates, projection)
    const propName = f.properties?.[nameProperty]
    const label = typeof propName === 'string' ? propName : 'Region ' + String(fi + 1)
    const key = joinKey(f, idProperty) ?? label
    const base = key === label ? { name: key, rings } : { name: key, label, rings }
    shapes.push(holes.length > 0 ? { ...base, holes, holeHost } : base)
    properties.push(f.properties ?? null)
  }

  return { shapes, properties }
}

/** What a feature's values are joined on: its own id, a property, or nothing (the caller falls back to the display name). */
function joinKey(f: GeoFeature, idProperty: string | undefined): string | undefined {
  if (idProperty === undefined) return undefined
  const raw = idProperty === 'id' ? f.id : f.properties?.[idProperty]

  return raw === undefined || raw === null ? undefined : String(raw)
}

/** The projected outer rings of a feature's polygons, with each polygon's inner rings and the outer ring each cuts. */
function featureRings(polys: number[][][][], projection: GeoProjection): { rings: Pt[][]; holes: Pt[][]; holeHost: number[] } {
  const rings: Pt[][] = []
  const holes: Pt[][] = []
  const holeHost: number[] = []
  for (const poly of polys) {
    const outer = poly[0]
    if (outer === undefined || outer.length < 3) continue
    rings.push(projectRing(outer, projection))
    // Inner rings belong to THIS polygon's outer ring.
    for (let hi = 1; hi < poly.length; hi++) {
      const inner = poly[hi]!
      if (inner.length < 3) continue
      holes.push(projectRing(inner, projection))
      holeHost.push(rings.length - 1)
    }
  }

  return { rings, holes, holeHost }
}

/** `geoFeatures(...).shapes`. */
export function geoShapes(geo: GeoJson, projection: GeoProjection = 'equirectangular', nameProperty = 'name', idProperty?: string): GeoShape[] {
  return geoFeatures(geo, projection, nameProperty, idProperty).shapes
}

function projectRing(coords: number[][], projection: GeoProjection): Pt[] {
  const ring: Pt[] = []
  for (const c of coords) ring.push(projectLonLat(c[0] ?? 0.0, c[1] ?? 0.0, projection))

  return ring
}

/** Project every feature's outer rings and fit them into `box` (aspect preserved, centred). */
export function layoutGeo(geo: GeoJson, box: Rect, options?: GeoOptions): GeoLayout {
  return layoutGeoShapes(geoShapes(geo, options?.projection ?? 'equirectangular', options?.nameProperty ?? 'name', options?.idProperty), box, options)
}

export interface GeoToSvgOptions {
  geo: GeoJson
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
    ...renderGeoPies(layout, o.pies ?? [], 1.0),
    ...renderGeoOverlayPoints(layout, o.points ?? [], o.overlayOptions),
  ]
}

/** Map → `<svg>` string, server-safe: the same layers, in the same order, as the live `<MapChart>`. */
export function geoToSvg(o: GeoToSvgOptions): string {
  const width = o.width ?? 640.0
  const height = o.height ?? 400.0
  const layout = layoutGeo(o.geo, { x: 0.0, y: 0.0, w: width, h: height }, o.options)
  const m = o.measure ?? measureApprox()
  const aligned = alignGeoValues(layout.regions.map((r) => r.name), o.values)
  const cmds = [...renderGeoAligned(layout, aligned, o.options, m), ...geoOverlayCmds(layout, o)]
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
