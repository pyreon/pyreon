import { describe, expect, it } from 'vitest'
import { geoDomain, geoToSvg, getMap, hitGeo, layoutGeo, listMaps, projectLonLat, registerMap, renderGeo } from './geo'
import type { GeoJson } from './geo'
import { compileFamily, familyToSvg } from './option-family'

// Two squares side by side (10° each) plus a multipolygon of two smaller squares.
const world: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'West' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'East' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
    { type: 'Feature', properties: { name: 'Isles' }, geometry: { type: 'MultiPolygon', coordinates: [[[[0, 12], [2, 12], [2, 14], [0, 14], [0, 12]]], [[[18, 12], [20, 12], [20, 14], [18, 14], [18, 12]]]] } },
  ],
}
const box = { x: 0, y: 0, w: 400, h: 300 }

describe('geo layout', () => {
  it('projects, fits into the box preserving aspect, flips north up, and names regions from properties', () => {
    const l = layoutGeo(world, box, { padding: 0 })
    expect(l.regions.map((r) => r.name)).toEqual(['West', 'East', 'Isles'])
    const west = l.regions[0]!
    const east = l.regions[1]!
    expect(west.bbox.w).toBeCloseTo(east.bbox.w, 9)
    expect(east.bbox.x).toBeCloseTo(west.bbox.x + west.bbox.w, 9)
    // 20° wide × 14° tall into 400×300: width-limited → scale 20px/°; height 280 centred.
    expect(west.bbox.w).toBeCloseTo(200, 9)
    expect(west.bbox.y + west.bbox.h).toBeCloseTo(290, 9)
    expect(l.regions[2]!.rings).toHaveLength(2)
    expect(l.regions[2]!.bbox.y).toBeLessThan(west.bbox.y)
    expect(west.centroid).toEqual({ x: 100, y: 190 })
    expect(l.project(10, 10)).toEqual({ x: 200, y: 90 })
  })
  it('mercator stretches latitude and clamps the poles; a missing geometry or name is tolerated', () => {
    const o = projectLonLat(0, 0, 'mercator')
    expect(o.x).toBeCloseTo(0, 9)
    expect(o.y).toBeCloseTo(0, 9)
    expect(projectLonLat(0, 60, 'mercator').y).toBeGreaterThan(60)
    expect(projectLonLat(0, 89, 'mercator').y).toBeCloseTo(projectLonLat(0, 85, 'mercator').y, 9)
    // A feature without properties is named by its index; one without geometry draws nothing and is skipped.
    const l = layoutGeo({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: null, geometry: world.features[0]!.geometry }, { type: 'Feature', properties: null, geometry: null }, world.features[1]!] }, box)
    expect(l.regions.map((r) => r.name)).toEqual(['Region 1', 'East'])
    expect(l.regions[0]!.rings).toHaveLength(1)
    expect(layoutGeo({ type: 'FeatureCollection', features: [] }, box).regions).toEqual([])
  })
  it('renders fills by value (empty colour for no data), borders, labels only where they fit; entrance fades', () => {
    const l = layoutGeo(world, box)
    const values = { West: 1, East: 9 }
    expect(geoDomain(l, values)).toEqual([1, 9])
    // A wide measure so the 40px islands cannot hold their 50px label.
    const cmds = renderGeo(l, values, { showLabels: true }, (text, size) => text.length * size)
    const polys = cmds.filter((c) => c.kind === 'polygon')
    expect(polys).toHaveLength(4)
    const f = (i: number) => (polys[i]!.kind === 'polygon' ? polys[i]!.fill : '')
    expect(f(0)).not.toBe(f(1))
    expect(f(2)).toBe('#e2e8f0')
    expect(cmds.filter((c) => c.kind === 'polyline')).toHaveLength(4)
    const labels = cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))
    // Isles: the label does not fit either island's own box (the union box would have fooled a naive check).
    expect(labels).toEqual(['West', 'East'])
    const half = renderGeo(l, values, { progress: 0.5 })
    expect(half.filter((c) => c.kind === 'text')).toHaveLength(0)
    const hf = half.filter((c) => c.kind === 'polygon')[1]!
    if (hf.kind !== 'polygon') throw new Error('polygon')
    expect(hf.fill).not.toBe(f(1))
  })
  it('hit-testing finds the region under a point (inside a ring, not just the bbox)', () => {
    const l = layoutGeo(world, box, { padding: 0 })
    expect(hitGeo(l, 100, 190)!.name).toBe('West')
    expect(hitGeo(l, 300, 190)!.name).toBe('East')
    expect(hitGeo(l, 200, 30)).toBeNull()
    expect(hitGeo(l, 20, 20)!.name).toBe('Isles')
  })
  it('registry + svg', () => {
    registerMap('squares', world)
    expect(listMaps()).toContain('squares')
    expect(getMap('squares')!.features).toHaveLength(3)
    expect(getMap('nope')).toBeNull()
    const svg = geoToSvg({ geo: world, values: { West: 2 }, title: 'Squares' })
    expect(svg).toContain('<polygon')
    expect(svg).toContain('3 regions, 1 with values from 2 to 2')
  })
})

describe('map option mapping', () => {
  it('type map resolves the registered map, fills by data, honours visualMap, labels and border style', () => {
    registerMap('squares', world)
    const f = compileFamily({
      visualMap: { min: 0, max: 10, inRange: { color: ['#ffffff', '#000000'] } },
      series: [{ type: 'map', map: 'squares', label: { show: true }, itemStyle: { borderColor: '#ff0000' }, data: [{ name: 'West', value: 3 }, { name: 'East', value: 7 }, { nope: 1 }] }],
    })!
    if (f.plan.kind !== 'map') throw new Error('kind')
    expect(f.plan.values).toEqual({ West: 3, East: 7 })
    expect(f.plan.options).toMatchObject({ showLabels: true, borderColor: '#ff0000', domain: [0, 10], stops: ['#ffffff', '#000000'] })
    expect(f.warnings.map((w) => w.code)).toEqual(['series-data-shape'])
    expect(familyToSvg(f.plan)).toContain('<polygon')
    const missing = compileFamily({ series: [{ type: 'map', map: 'not-registered', data: [] }] })!
    expect(missing.warnings.map((w) => w.code)).toContain('series-option-unsupported')
  })
})
