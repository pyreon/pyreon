import { describe, expect, it } from 'vitest'
import { layoutGeoShapes } from './geo'
import { renderGeoHeat, renderGeoPies } from './geo-overlay'
import { geoShapes, registerMap } from './geo-web'
import { compileFamily, familyToSvg } from './option-family'
import type { GeoJson } from './geo-web'
import type { DrawCmd } from './types'

const world: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'W' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'E' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
}
registerMap('geo-series-world', world)

describe('every series on a geo draws', () => {
  it('scatter, effectScatter and lines series combine; a later points series keeps its own colour', () => {
    const f = compileFamily({
      geo: { map: 'geo-series-world' },
      series: [
        { type: 'scatter', coordinateSystem: 'geo', itemStyle: { color: '#111111' }, data: [[2, 2]] },
        { type: 'effectScatter', coordinateSystem: 'geo', itemStyle: { color: '#222222' }, data: [[8, 8]] },
        { type: 'lines', coordinateSystem: 'geo', data: [{ coords: [[1, 1], [19, 9]] }] },
      ],
    })!
    expect(f.warnings).toEqual([])
    if (f.plan.kind !== 'geoPoints') throw new Error('kind')
    expect(f.plan.points).toEqual([{ lon: 2, lat: 2 }, { lon: 8, lat: 8, color: '#222222', effect: true }])
    expect(f.plan.options.color).toBe('#111111')
    expect(f.plan.paths).toHaveLength(1)
  })

  it('a heatmap, a pie and a map layer (geoIndex) on the geo each map; the first series may be the map layer', () => {
    const f = compileFamily({
      geo: { map: 'geo-series-world' },
      visualMap: { min: 0, max: 10, inRange: { color: ['#0000ff', '#ff0000'] } },
      series: [
        { type: 'map', geoIndex: 0, data: [{ name: 'W', value: 3 }, { name: 'E', value: 7 }] },
        { type: 'heatmap', coordinateSystem: 'geo', pointSize: 12, data: [[3, 3, 1], [4, 4, 9]] },
        { type: 'pie', coordinateSystem: 'geo', center: [15, 5], radius: [5, 18], data: [{ name: 'a', value: 1 }, { name: 'b', value: 3, itemStyle: { color: '#00ff00' } }] },
      ],
    })!
    expect(f.warnings).toEqual([])
    if (f.plan.kind !== 'geoPoints') throw new Error('kind')
    expect(f.plan.values).toEqual({ W: 3, E: 7 })
    expect(f.plan.heat).toEqual([{ lon: 3, lat: 3, value: 1 }, { lon: 4, lat: 4, value: 9 }])
    expect(f.plan.heatRadius).toBe(12)
    expect(f.plan.heatStops).toEqual(['#0000ff', '#ff0000'])
    expect(f.plan.pies).toHaveLength(1)
    expect(f.plan.pies[0]).toMatchObject({ lon: 15, lat: 5, radius: 18 })
    expect(f.plan.pies[0]!.innerRadius).toBeCloseTo(5 / 18, 6)
    expect(f.plan.pies[0]!.slices[1]!.color).toBe('#00ff00')
    const svg = familyToSvg(f.plan)
    expect(svg).toContain('radialGradient')
    expect(svg).toContain('<polygon')
  })

  it('names what it cannot draw: a series off the geo, a pie with no centre, an unknown type, a trail on geo lines', () => {
    const f = compileFamily({
      geo: { map: 'geo-series-world' },
      series: [
        { type: 'scatter', coordinateSystem: 'geo', data: [[1, 1]] },
        { type: 'line', data: [1, 2] },
        { type: 'pie', coordinateSystem: 'geo', data: [{ value: 1 }] },
        { type: 'bar', coordinateSystem: 'geo', data: [] },
        { type: 'lines', coordinateSystem: 'geo', effect: { show: true }, data: [] },
      ],
    })!
    expect(f.warnings.map((w) => w.path)).toEqual(['series[1].coordinateSystem', 'series[2].center', 'series[3].type', 'series[4].effect'])
  })
})

describe('geo heat and pie overlays', () => {
  const layout = layoutGeoShapes(geoShapes(world), { x: 0, y: 0, w: 200, h: 100 })
  it('heat blobs are radial gradients fading to transparent, hotter values further up the ramp', () => {
    const cmds = renderGeoHeat(layout, [{ lon: 5, lat: 5, value: 0 }, { lon: 15, lat: 5, value: 10 }], ['#0000ff', '#ff0000'], 10, 1)
    const polys = cmds.filter((c): c is Extract<DrawCmd, { kind: 'polygon' }> => c.kind === 'polygon')
    expect(polys).toHaveLength(2)
    expect(polys[0]!.grad?.radial).toBe(true)
    expect(polys[0]!.grad!.stops[1]!.color).toMatch(/,\s*0\)$/)
    expect(polys[0]!.grad!.stops[0]!.color).toContain('0, 0, 255')
    expect(polys[1]!.grad!.stops[0]!.color).toContain('255, 0, 0')
  })

  it('a pie draws one sector per slice around its projected centre, sweeping with progress', () => {
    const pie = { lon: 10, lat: 5, radius: 20, innerRadius: 0, slices: [{ value: 1, label: 'a', color: '#aaaaaa' }, { value: 1, label: 'b', color: '#bbbbbb' }] }
    const full = renderGeoPies(layout, [pie], 1)
    expect(full.map((c) => (c.kind === 'polygon' ? c.fill : ''))).toEqual(['#aaaaaa', '#bbbbbb'])
    const half = renderGeoPies(layout, [pie], 0.5)
    expect(half).toHaveLength(2)
    expect(JSON.stringify(half)).not.toBe(JSON.stringify(full))
  })
})
