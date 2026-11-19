// GeoJSON inner rings (holes): kept end to end, filled even-odd, hit-tested, and a lake is not in the country.
import { describe, expect, it } from 'vitest'
import { FLORIDA_LAKE, ITALY_ENCLAVES, SOUTH_AFRICA_LESOTHO } from './__fixtures__/geo-holes'
import { bridgeHoles, hitGeoIndex, layoutGeoShapes, renderGeo } from './geo'
import { geoShapes } from './geo-web'
import type { DrawCmd } from './types'

const BOX = { x: 0, y: 0, w: 400, h: 300 }
const centroidOf = (ring: { x: number; y: number }[]): { x: number; y: number } => ({ x: ring.reduce((a, p) => a + p.x, 0) / ring.length, y: ring.reduce((a, p) => a + p.y, 0) / ring.length })

describe('geoShapes keeps inner rings', () => {
  it('records each hole against the outer ring it cuts', () => {
    const [za, ls] = geoShapes(SOUTH_AFRICA_LESOTHO)
    expect(za!.holes).toHaveLength(1)
    expect(za!.holeHost).toEqual([0])
    expect(ls!.holes, 'a shape without holes carries none (byte-stable)').toBeUndefined()
  })
  it('a multipolygon keeps each polygon\'s holes with ITS outer ring', () => {
    const outer = (x: number): number[][] => [[x, 0], [x + 4, 0], [x + 4, 4], [x, 4], [x, 0]]
    const hole = (x: number): number[][] => [[x + 1, 1], [x + 2, 1], [x + 2, 2], [x + 1, 2], [x + 1, 1]]
    const [s] = geoShapes({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'M' }, geometry: { type: 'MultiPolygon', coordinates: [[outer(0)], [outer(10), hole(10)]] } }] })
    expect(s!.holeHost).toEqual([1])
  })
})

const area = (ring: { x: number; y: number }[]): number => {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const j = i === 0 ? ring.length - 1 : i - 1
    a += ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y
  }

  return a / 2
}

describe('fill rings (keyhole bridging)', () => {
  const layout = layoutGeoShapes(geoShapes(SOUTH_AFRICA_LESOTHO), BOX)
  const cmds = renderGeo(layout, [])
  const polys = cmds.filter((c): c is DrawCmd & { kind: 'polygon' } => c.kind === 'polygon')

  it('a country with a hole fills ONE ring whose area is the outline minus the hole; one without is its own ring', () => {
    const za = layout.regions[0]!
    expect(polys).toHaveLength(2)
    expect(Math.abs(area(polys[0]!.points))).toBeCloseTo(Math.abs(area(za.rings[0]!)) - Math.abs(area(za.holes[0]!)), 6)
    expect(polys[1]!.points).toEqual(layout.regions[1]!.rings[0])
  })
  it('the bridge is walked twice (in and back out) and the hole is wound against the outline', () => {
    const fill = layout.regions[0]!.fills[0]!
    const ring = layout.regions[0]!.rings[0]!
    expect(fill.length).toBe(ring.length + layout.regions[0]!.holes[0]!.length + 2)
    expect(Math.sign(area(fill))).toBe(Math.sign(area(ring)))
  })
  it('the border strokes the outline and the hole, never the bridge', () => {
    const lines = cmds.filter((c) => c.kind === 'polyline')
    expect(lines).toHaveLength(3)
    expect((lines[0] as DrawCmd & { kind: 'polyline' }).points).toHaveLength(layout.regions[0]!.rings[0]!.length + 1)
  })
  it('a concave outline whose nearest vertex is NOT visible still gets a clear bridge', () => {
    // a "C" with the hole inside its throat: the nearest outline vertices sit behind the C's arms
    const outer = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const hole = [{ x: 1, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 6 }, { x: 1, y: 6 }]
    const fill = bridgeHoles(outer, [hole])
    expect(fill.length).toBe(outer.length + hole.length + 2)
    expect(Math.abs(area(fill))).toBeCloseTo(Math.abs(area(outer)) - Math.abs(area(hole)), 9)
  })
  it('several holes in one ring each get bridged; an unreachable hole is left out of the fill rather than corrupting it', () => {
    const outer = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]
    const h1 = [{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 5 }, { x: 2, y: 5 }]
    const h2 = [{ x: 10, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 14 }, { x: 10, y: 14 }]
    const fill = bridgeHoles(outer, [h1, h2])
    expect(Math.abs(area(fill))).toBeCloseTo(400 - 9 - 16, 9)
  })
})

describe('hit testing', () => {
  it('a point in Lesotho is Lesotho, not South Africa; a point in South Africa proper is South Africa', () => {
    const layout = layoutGeoShapes(geoShapes(SOUTH_AFRICA_LESOTHO), BOX)
    const c = centroidOf(layout.regions[0]!.holes[0]!)
    // Lesotho is drawn after South Africa, and the hole means South Africa never claims the point either.
    expect(hitGeoIndex(layout, c.x, c.y)).toBe(1)
    const reg = layout.regions[0]!
    expect(reg.holes).toHaveLength(1)
    // without the Lesotho feature the point falls in the hole: a miss
    const alone = layoutGeoShapes(geoShapes({ ...SOUTH_AFRICA_LESOTHO, features: [SOUTH_AFRICA_LESOTHO.features[0]!] }), BOX)
    const c2 = centroidOf(alone.regions[0]!.holes[0]!)
    expect(hitGeoIndex(alone, c2.x, c2.y)).toBe(-1)
  })
  it('a point in a lake is not in the country', () => {
    const layout = layoutGeoShapes(geoShapes(FLORIDA_LAKE), BOX)
    const lake = centroidOf(layout.regions[0]!.holes[0]!)
    expect(hitGeoIndex(layout, lake.x, lake.y)).toBe(-1)
    const land = centroidOf(layout.regions[0]!.rings[0]!.slice(0, 4))
    expect(hitGeoIndex(layout, land.x, land.y)).toBe(0)
  })
  it('Italy with San Marino and the Vatican cut out: the enclaves answer for themselves', () => {
    const layout = layoutGeoShapes(geoShapes(ITALY_ENCLAVES), BOX)
    expect(layout.regions[0]!.holes).toHaveLength(2)
    const sm = centroidOf(layout.regions[0]!.holes[0]!)
    expect(hitGeoIndex(layout, sm.x, sm.y)).toBe(1)
  })
})
