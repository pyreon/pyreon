// TopoJSON decoding — the web half of the map family, no dependency.
//
// TopoJSON stores each shared border ONCE, as an arc, and a polygon as a list of arc indices (a negative index `~i`
// means arc `i` walked backwards). Quantised files add a `transform` and delta-encode every arc. `topoToGeo` undoes
// both and stitches the arcs into rings, yielding the same `GeoJson` the rest of the map code already reads, so a
// TopoJSON map joins, projects, holes and draws exactly as a GeoJSON one does.
//
// Only Polygon and MultiPolygon geometries are decoded (what `<MapChart>` draws today); a point or a line becomes a
// feature with a null geometry, which `geoShapes` skips.

import type { GeoFeature, GeoJson } from './geo-web'

/** A TopoJSON geometry object: a collection, a polygon or multipolygon with arcs, or anything else (skipped). */
export interface TopoGeometry {
  type: string
  id?: string | number | undefined
  properties?: Record<string, unknown> | null | undefined
  /** Polygon: rings of arc indices; MultiPolygon: polygons of those. */
  arcs?: number[][] | number[][][] | undefined
  geometries?: TopoGeometry[] | undefined
}

export interface Topology {
  type: 'Topology'
  /** Quantisation: a decoded position is `translate + scale * cumulative delta`. */
  transform?: { scale: [number, number]; translate: [number, number] } | undefined
  /** Each arc is a list of positions; with a `transform` they are delta-encoded integers. */
  arcs: number[][][]
  objects: Record<string, TopoGeometry>
}

/** Whether `x` is a TopoJSON topology. */
export function isTopology(x: unknown): x is Topology {
  return typeof x === 'object' && x !== null && (x as { type?: unknown }).type === 'Topology'
}

/** Every arc as absolute coordinates (the transform and the delta encoding undone). */
function decodeArcs(topo: Topology): number[][][] {
  const t = topo.transform
  return topo.arcs.map((arc) => {
    let x = 0
    let y = 0
    return arc.map((p) => {
      if (t === undefined) return [p[0] ?? 0, p[1] ?? 0]
      x += p[0] ?? 0
      y += p[1] ?? 0
      return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]
    })
  })
}

/** The positions of one ring: the listed arcs joined end to end (a repeated joint point dropped), `~i` reversed. */
function stitch(arcIndices: number[], arcs: number[][][]): number[][] {
  const ring: number[][] = []
  for (const index of arcIndices) {
    const reversed = index < 0
    const arc = arcs[reversed ? ~index : index]
    if (arc === undefined) continue
    const points = reversed ? [...arc].reverse() : arc
    for (let k = ring.length === 0 ? 0 : 1; k < points.length; k++) ring.push(points[k]!)
  }

  return ring
}

function geometryOf(g: TopoGeometry, arcs: number[][][]): GeoFeature['geometry'] {
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: ((g.arcs ?? []) as number[][]).map((r) => stitch(r, arcs)) }
  if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: ((g.arcs ?? []) as number[][][]).map((poly) => poly.map((r) => stitch(r, arcs))) }

  return null
}

function featureOf(g: TopoGeometry, arcs: number[][][]): GeoFeature {
  return { type: 'Feature', ...(g.id === undefined ? {} : { id: g.id }), properties: g.properties ?? null, geometry: geometryOf(g, arcs) }
}

/**
 * The features of one named object of a topology (default: the first object, which is the only one in most files),
 * as a GeoJSON FeatureCollection. A collection becomes one feature per geometry; a lone polygon, one feature.
 */
export function topoToGeo(topo: Topology, object?: string): GeoJson {
  const name = object ?? Object.keys(topo.objects)[0]
  const root = name === undefined ? undefined : topo.objects[name]
  if (root === undefined) throw new Error(`[Pyreon] topoToGeo: the topology has no object ${object === undefined ? '(it has none at all)' : `"${object}"`}; its objects are ${Object.keys(topo.objects).join(', ') || '(none)'}.`)
  const arcs = decodeArcs(topo)
  const geometries = root.type === 'GeometryCollection' ? root.geometries ?? [] : [root]

  return { type: 'FeatureCollection', features: geometries.map((g) => featureOf(g, arcs)) }
}
