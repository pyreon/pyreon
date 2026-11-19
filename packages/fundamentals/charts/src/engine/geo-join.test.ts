// Joining values to features by name, id or any property, the region-aligned values, and geoToSvg's layers.
import { describe, expect, it } from 'vitest'
import { geoAlign, geoValueOf, layoutGeoShapes, renderGeo, renderGeoAligned } from './geo'
import { alignGeoValues, geoFeatures, geoShapes, geoToSvg } from './geo-web'
import type { GeoJson } from './geo-web'

const sq = (x: number): number[][][] => [[[x, 0], [x + 4, 0], [x + 4, 4], [x, 4], [x, 0]]]
const GEO: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'f1', properties: { name: 'Alpha', iso: 'AL', pop: 3 }, geometry: { type: 'Polygon', coordinates: sq(0) } },
    { type: 'Feature', id: 7, properties: { name: 'Beta', iso: 'BE', pop: 5 }, geometry: { type: 'Polygon', coordinates: sq(6) } },
    { type: 'Feature', properties: { name: 'Gamma' }, geometry: { type: 'Polygon', coordinates: sq(12) } },
  ],
}

describe('join key', () => {
  it('by default the display name is the key', () => {
    const { shapes } = geoFeatures(GEO)
    expect(shapes.map((s) => s.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(shapes[0]!.label, 'no separate label when the key is the name').toBeUndefined()
  })
  it('idProperty "id" joins on the feature id, numeric ids as strings, and keeps the label', () => {
    const { shapes } = geoFeatures(GEO, 'equirectangular', 'name', 'id')
    expect(shapes.map((s) => s.name)).toEqual(['f1', '7', 'Gamma'])
    expect(shapes.map((s) => s.label ?? s.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })
  it('any property is a key, and a feature without it falls back to its name', () => {
    expect(geoShapes(GEO, 'equirectangular', 'name', 'iso').map((s) => s.name)).toEqual(['AL', 'BE', 'Gamma'])
  })
  it('the feature properties come back beside the shapes, in order', () => {
    const { properties } = geoFeatures(GEO)
    expect(properties.map((p) => p?.pop)).toEqual([3, 5, undefined])
  })
  it('a layout carries the label and the key, and draws the label', () => {
    const layout = layoutGeoShapes(geoShapes(GEO, 'equirectangular', 'name', 'id'), { x: 0, y: 0, w: 300, h: 100 })
    expect(layout.regions.map((r) => [r.name, r.label])).toEqual([['f1', 'Alpha'], ['7', 'Beta'], ['Gamma', 'Gamma']])
    const text = renderGeo(layout, [], { showLabels: true, fontSize: 8 }).filter((c) => c.kind === 'text').map((c) => (c as { text: string }).text)
    expect(text).toContain('Alpha')
    expect(text).not.toContain('f1')
  })
})

describe('region-aligned values', () => {
  const layout = layoutGeoShapes(geoShapes(GEO), { x: 0, y: 0, w: 300, h: 100 })
  it('alignGeoValues reads a record or a list into region order, NaN for a gap', () => {
    const names = layout.regions.map((r) => r.name)
    expect(alignGeoValues(names, { Alpha: 1, Gamma: 3 })).toEqual([1, Number.NaN, 3])
    expect(alignGeoValues(names, [{ region: 'Beta', value: 2 }])).toEqual([Number.NaN, 2, Number.NaN])
  })
  it('a record with an inherited key (toString) is not a value', () => {
    expect(alignGeoValues(['toString'], {})).toEqual([Number.NaN])
  })
  it('the aligned and the list paths paint the same commands', () => {
    const list = [{ region: 'Alpha', value: 4 }, { region: 'Beta', value: 9 }]
    expect(renderGeoAligned(layout, geoAlign(layout, list))).toEqual(renderGeo(layout, list))
    expect(geoAlign(layout, list)[0]).toBe(geoValueOf(list, 'Alpha'))
  })
})

describe('geoToSvg draws the live host\'s layers', () => {
  const layers = { points: [{ lon: 2, lat: 2, name: 'P', color: '#ff0000' }], paths: [{ coords: [{ lon: 1, lat: 1 }, { lon: 14, lat: 3 }], color: '#00ff00' }], heat: [{ lon: 8, lat: 2, value: 5 }], heatStops: ['#0000ff', '#ff00ff'], pies: [{ lon: 13, lat: 2, radius: 12, innerRadius: 0, slices: [{ value: 1, label: 'a', color: '#abcdef' }] }] }
  it('a map with overlays adds them in the draw order points > pies > paths > heat over the regions', () => {
    const plain = geoToSvg({ geo: GEO, values: { Alpha: 1 }, width: 320, height: 160 })
    const full = geoToSvg({ geo: GEO, values: { Alpha: 1 }, width: 320, height: 160, ...layers })
    expect(full.length).toBeGreaterThan(plain.length)
    for (const colour of ['#ff0000', '#00ff00', '#abcdef']) expect(full).toContain(colour)
    expect(plain).not.toContain('#ff0000')
  })
  it('values may be the crossing list as well as a record', () => {
    expect(geoToSvg({ geo: GEO, values: [{ region: 'Alpha', value: 1 }], width: 200, height: 100 })).toBe(geoToSvg({ geo: GEO, values: { Alpha: 1 }, width: 200, height: 100 }))
  })
})
