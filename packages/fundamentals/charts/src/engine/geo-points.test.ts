import { describe, expect, it } from 'vitest'
import { geoPointRadii, geoPointsToSvg, hitGeoPoint, renderGeoPaths, renderGeoPoints } from './geo-points'
import { layoutGeo, registerMap } from './geo'
import type { GeoJson } from './geo'
import { compileFamily, familyToSvg, isFamilyOption } from './option-family'

const world: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'West' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'East' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
}
const box = { x: 0, y: 0, w: 400, h: 200 }
const points = [{ name: 'p', lon: 5, lat: 5, value: 1 }, { name: 'q', lon: 15, lat: 5, value: 4 }, { lon: 0, lat: 0 }]

describe('points on a map', () => {
  it('places points through the map projection; radius scales with value; halos and labels are opt-in', () => {
    const l = layoutGeo(world, box, { padding: 0 })
    const r = geoPointRadii(points, 5)
    expect(r[1]! / r[0]!).toBeCloseTo((0.6 + 1.4) / (0.6 + 1.4 * 0.5), 9)
    expect(r[2]).toBe(5)
    const cmds = renderGeoPoints(l, points)
    const circles = cmds.filter((c) => c.kind === 'circle')
    expect(circles).toHaveLength(3)
    const p = circles[0]!
    if (p.kind !== 'circle') throw new Error('circle')
    expect(p.center).toEqual({ x: 100, y: 100 })
    expect(cmds.filter((c) => c.kind === 'text')).toHaveLength(0)
    const rich = renderGeoPoints(l, points, { effect: true, showLabels: true })
    expect(rich.filter((c) => c.kind === 'circle')).toHaveLength(9)
    expect(rich.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))).toEqual(['p', 'q'])
    expect(renderGeoPoints(l, points, { progress: 0 }).filter((c) => c.kind === 'circle' && c.radius > 0)).toHaveLength(0)
  })
  it('paths (lines on geo) project every vertex and draw before points; entrance shortens them', () => {
    const l = layoutGeo(world, box, { padding: 0 })
    const cmds = renderGeoPaths(l, [{ coords: [[0, 0], [10, 10], [20, 0]], color: '#00ff00', width: 3 }, { coords: [[5, 5]] }])
    expect(cmds).toHaveLength(1)
    const pl = cmds[0]!
    if (pl.kind !== 'polyline') throw new Error('polyline')
    expect(pl.points).toEqual([{ x: 0, y: 200 }, { x: 200, y: 0 }, { x: 400, y: 200 }])
    expect(pl.stroke).toBe('#00ff00')
    expect(pl.width).toBe(3)
    const half = renderGeoPaths(l, [{ coords: [[0, 0], [10, 10], [20, 0], [20, 10]] }], { progress: 0.5 })
    if (half[0]!.kind !== 'polyline') throw new Error('polyline')
    expect(half[0]!.points).toHaveLength(2)
    const svg = geoPointsToSvg({ geo: world, points: [], paths: [{ coords: [[0, 0], [20, 10]] }], title: 'Routes' })
    expect(svg).toContain('<polyline')
    expect(svg).toContain('0 points and 1 paths')
  })
  it('hit-testing finds the point under a pixel', () => {
    const l = layoutGeo(world, box, { padding: 0 })
    expect(hitGeoPoint(l, points, 101, 101)).toBe(0)
    expect(hitGeoPoint(l, points, 300, 100)).toBe(1)
    expect(hitGeoPoint(l, points, 200, 20)).toBe(-1)
  })
  it('geoPointsToSvg draws the map under the points', () => {
    const svg = geoPointsToSvg({ geo: world, points, title: 'Cities' })
    expect(svg).toContain('<polygon')
    expect(svg).toContain('<circle')
    expect(svg).toContain('3 points and 0 paths over 2 regions')
  })
})

describe('geo coordinate option mapping', () => {
  it('scatter/effectScatter on coordinateSystem geo lower over the geo map; other types warn', () => {
    registerMap('squares-geo', world)
    const option = {
      geo: { map: 'squares-geo', itemStyle: { borderColor: '#000000' } },
      series: [{ type: 'effectScatter', coordinateSystem: 'geo', symbolSize: 12, label: { show: true }, itemStyle: { color: '#123456' }, data: [{ name: 'p', value: [5, 5, 3] }, [15, 5, 9], 'junk'] }],
    }
    expect(isFamilyOption(option)).toBe(true)
    const f = compileFamily(option)!
    if (f.plan.kind !== 'geoPoints') throw new Error('kind')
    expect(f.plan.points).toEqual([{ name: 'p', lon: 5, lat: 5, value: 3 }, { lon: 15, lat: 5, value: 9 }])
    expect(f.plan.options).toMatchObject({ radius: 6, effect: true, showLabels: true, color: '#123456' })
    expect(f.plan.map.borderColor).toBe('#000000')
    expect(f.warnings.map((w) => w.code)).toEqual(['series-data-shape'])
    expect(familyToSvg(f.plan)).toContain('<circle')
    const bad = compileFamily({ geo: { map: 'squares-geo' }, series: [{ type: 'bar', coordinateSystem: 'geo', data: [] }] })!
    expect(bad.warnings.map((w) => w.code)).toContain('series-type-unsupported')
    const lines = compileFamily({ geo: { map: 'squares-geo' }, series: [{ type: 'lines', coordinateSystem: 'geo', lineStyle: { color: '#00ff00', width: 2 }, data: [{ coords: [[0, 0], [20, 10]] }, { coords: [[1, 1]] }] }] })!
    if (lines.plan.kind !== 'geoPoints') throw new Error('kind')
    expect(lines.plan.paths).toEqual([{ coords: [[0, 0], [20, 10]], color: '#00ff00', width: 2 }])
    expect(lines.warnings.map((w) => w.code)).toEqual(['series-data-shape'])
    expect(familyToSvg(lines.plan)).toContain('<polyline')
    const missing = compileFamily({ geo: { map: 'nope' }, series: [{ type: 'scatter', coordinateSystem: 'geo', data: [] }] })!
    expect(missing.warnings.map((w) => w.code)).toContain('series-option-unsupported')
  })
})
