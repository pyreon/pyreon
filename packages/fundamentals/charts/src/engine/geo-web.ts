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

import { geoDomain, layoutGeoShapes, projectLonLat, renderGeo } from './geo'
import type { GeoLayout, GeoOptions, GeoProjection, GeoShape, GeoValue } from './geo'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, MeasureText, Pt, Rect } from './types'

export interface GeoFeature {
  type: 'Feature'
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

/**
 * GeoJSON to normalised shapes — the WEB half, and the only part that touches
 * the `Polygon | MultiPolygon` union or the untyped `properties` bag. Both are
 * why the geo host does not cross; reducing here means everything downstream
 * works on `GeoShape[]`, which does.
 */
export function geoShapes(geo: GeoJson, projection: GeoProjection = 'equirectangular', nameProperty = 'name'): GeoShape[] {
  const out: GeoShape[] = []
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
      for (const c of outer) ring.push(projectLonLat(c[0] ?? 0.0, c[1] ?? 0.0, projection))
      rings.push(ring)
    }
    const propName = f.properties?.[nameProperty]
    out.push({ name: typeof propName === 'string' ? propName : 'Region ' + String(fi + 1), rings })
  }
  return out
}

/** Project every feature's outer rings and fit them into `box` (aspect preserved, centred). */
export function layoutGeo(geo: GeoJson, box: Rect, options?: GeoOptions): GeoLayout {
  return layoutGeoShapes(geoShapes(geo, options?.projection ?? 'equirectangular', options?.nameProperty ?? 'name'), box, options)
}

/**
 * Normalised shapes to a laid-out map. This is the CROSSING half: `GeoShape[]`
 * in, `GeoLayout` out, no union and no closure anywhere in the signature.
 */
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
  const cmds = renderGeo(layout, geoValues(o.values), o.options, o.measure ?? measureApprox())
  const dom = geoDomain(layout, geoValues(o.values))
  const lo = dom.min
  const hi = dom.max
  let filled = 0
  for (const r of layout.regions) if (o.values[r.name] !== undefined) filled++
  const description = o.description ?? (o.title !== undefined ? `${o.title}: ${layout.regions.length} regions, ${filled} with values from ${lo} to ${hi}.` : undefined)
  return renderSvg(cmds, width, height, {
    ...o.svg,
    ...(o.title !== undefined ? { title: o.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
