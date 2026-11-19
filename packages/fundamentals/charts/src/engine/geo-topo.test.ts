// TopoJSON decoding against a GeoJSON <-> TopoJSON pair built here: a grid of cells whose shared edges become shared
// arcs, with and without quantisation.
import { describe, expect, it } from 'vitest'
import { isTopology, topoToGeo } from './geo-topo'
import type { Topology } from './geo-topo'
import { geoShapes, getMapDefinition, layoutGeo, listMaps, registerMap } from './geo-web'
import type { GeoJson } from './geo-web'

function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296

    return s / 4294967296
  }
}

interface Cell { col: number; row: number }

/** The ring of one grid cell, clockwise from its top-left corner, closed. */
const cellRing = (c: Cell): number[][] => [[c.col, c.row], [c.col + 1, c.row], [c.col + 1, c.row + 1], [c.col, c.row + 1], [c.col, c.row]]

/**
 * Encode cells as a topology: every cell edge is an arc, shared by the two cells that border it (the second walker
 * takes it reversed, `~i`). With `quantise`, positions are delta-encoded integers under a scale / translate.
 */
function encode(cells: Cell[], quantise: boolean): { geo: GeoJson; topo: Topology } {
  const arcs: number[][][] = []
  const index = new Map<string, number>()
  const edge = (a: number[], b: number[]): number => {
    const fwd = `${a}>${b}`
    const rev = `${b}>${a}`
    if (index.has(rev)) return ~index.get(rev)!
    index.set(fwd, arcs.length)
    arcs.push([a, b])

    return arcs.length - 1
  }
  const geometries = cells.map((c, i) => {
    const ring = cellRing(c)
    const ids: number[] = []
    for (let k = 0; k < ring.length - 1; k++) ids.push(edge(ring[k]!, ring[k + 1]!))

    return { type: 'Polygon', id: i, properties: { name: `c${i}`, col: c.col }, arcs: [ids] }
  })
  const geo: GeoJson = {
    type: 'FeatureCollection',
    features: cells.map((c, i) => ({ type: 'Feature', id: i, properties: { name: `c${i}`, col: c.col }, geometry: { type: 'Polygon', coordinates: [cellRing(c)] } })),
  }
  if (!quantise) return { geo, topo: { type: 'Topology', arcs, objects: { cells: { type: 'GeometryCollection', geometries } } } }
  // Delta-encode each arc's integer positions under scale 0.5 / translate (-10, 7): value = translate + scale * integer.
  const scale: [number, number] = [0.5, 0.5]
  const translate: [number, number] = [-10, 7]
  const q = (p: number[]): number[] => [(p[0]! - translate[0]) / scale[0], (p[1]! - translate[1]) / scale[1]]
  const quantised = arcs.map((arc) => {
    let px = 0
    let py = 0
    return arc.map((p) => {
      const [x, y] = q(p) as [number, number]
      const d = [x - px, y - py]
      px = x
      py = y

      return d
    })
  })

  return { geo, topo: { type: 'Topology', transform: { scale, translate }, arcs: quantised, objects: { cells: { type: 'GeometryCollection', geometries } } } }
}

describe('topoToGeo', () => {
  it('property: decode(encode(cells)) is the same GeoJSON, for random grids, plain and quantised', () => {
    const next = rng(11)
    for (let trial = 0; trial < 80; trial++) {
      const cells: Cell[] = []
      for (let col = 0; col < 5; col++) for (let row = 0; row < 4; row++) if (next() < 0.6) cells.push({ col, row })
      if (cells.length === 0) continue
      const { geo, topo } = encode(cells, trial % 2 === 0)
      const decoded = topoToGeo(topo)
      // quantisation divides and multiplies by 0.5: exact in floating point for these integers
      expect(decoded.features.map((f) => f.geometry)).toEqual(geo.features.map((f) => f.geometry))
      expect(decoded.features.map((f) => f.properties)).toEqual(geo.features.map((f) => f.properties))
      expect(decoded.features.map((f) => f.id)).toEqual(geo.features.map((f) => f.id))
    }
  })

  it('shared borders are stored once: neighbouring cells share an arc, one walking it reversed', () => {
    const { topo } = encode([{ col: 0, row: 0 }, { col: 1, row: 0 }], false)
    expect(topo.arcs.length).toBeLessThan(8)
    const g = (topo.objects.cells as { geometries: { arcs: number[][] }[] }).geometries
    expect(g[1]!.arcs[0]!.some((i) => i < 0)).toBe(true)
  })

  it('a MultiPolygon with a hole stitches every ring', () => {
    const topo: Topology = {
      type: 'Topology',
      arcs: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[3, 3], [3, 6], [6, 6], [6, 3], [3, 3]], [[20, 0], [24, 0], [24, 4], [20, 4], [20, 0]]],
      objects: { land: { type: 'MultiPolygon', arcs: [[[0], [1]], [[2]]] } },
    }
    const geo = topoToGeo(topo)
    expect(geo.features).toHaveLength(1)
    const rings = (geo.features[0]!.geometry as { coordinates: number[][][][] }).coordinates
    expect(rings).toHaveLength(2)
    expect(rings[0]).toHaveLength(2)
    expect(geoShapes(geo)[0]!.holes).toHaveLength(1)
  })

  it('picks the named object, and rejects a missing one with a message that lists the real ones', () => {
    const { topo } = encode([{ col: 0, row: 0 }], false)
    topo.objects.other = { type: 'GeometryCollection', geometries: [] }
    expect(topoToGeo(topo, 'other').features).toEqual([])
    expect(() => topoToGeo(topo, 'nope')).toThrow(/cells, other/)
  })

  it('a point or line geometry becomes a feature with no geometry (skipped by geoShapes)', () => {
    const topo: Topology = { type: 'Topology', arcs: [], objects: { x: { type: 'GeometryCollection', geometries: [{ type: 'Point' }] } } }
    expect(topoToGeo(topo).features[0]!.geometry).toBeNull()
    expect(geoShapes(topoToGeo(topo))).toEqual([])
  })

  it('isTopology tells a topology from GeoJSON', () => {
    expect(isTopology(encode([{ col: 0, row: 0 }], false).topo)).toBe(true)
    expect(isTopology({ type: 'FeatureCollection', features: [] })).toBe(false)
    expect(isTopology(null)).toBe(false)
  })
})

describe('registerMap with TopoJSON and defaults', () => {
  it('decodes once at registration, and keeps the map\'s own projection and property choices', () => {
    const { topo } = encode([{ col: 0, row: 0 }, { col: 1, row: 0 }], true)
    registerMap('grid-test', topo, { projection: 'mercator', nameProperty: 'name', idProperty: 'col' })
    expect(listMaps()).toContain('grid-test')
    const def = getMapDefinition('grid-test')!
    expect(def.projection).toBe('mercator')
    expect(def.geo.features).toHaveLength(2)
    expect(def.idProperty).toBe('col')
  })
  it('a definition carries its defaults, and an explicit option still wins', () => {
    const { topo } = encode([{ col: 0, row: 0 }, { col: 1, row: 0 }], false)
    const def = { data: topo, object: 'cells', projection: 'mercator' as const, idProperty: 'col' }
    const layout = layoutGeo(def, { x: 0, y: 0, w: 200, h: 100 })
    expect(layout.transform.projection).toBe('mercator')
    expect(layout.regions.map((r) => r.name)).toEqual(['0', '1'])
    expect(layoutGeo(def, { x: 0, y: 0, w: 200, h: 100 }, { projection: 'equirectangular' }).transform.projection).toBe('equirectangular')
  })
})
