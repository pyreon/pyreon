// GeoJSON inner rings (holes): kept end to end, filled even-odd, hit-tested, and a lake is not in the country.
import { describe, expect, it } from 'vitest'
import { FLORIDA_LAKE, ITALY_ENCLAVES, SOUTH_AFRICA_LESOTHO } from './__fixtures__/geo-holes'
import { hitGeoIndex, holesOf, layoutGeoShapes, renderGeo } from './geo'
import { geoShapes, geoToSvg } from './geo-web'
import { renderSvg } from './svg'
import { cmdsEqual, sameCmdShape, tweenCmds } from './cmd-tween'
import { mirrorCmds } from './rtl'
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

describe('draw list', () => {
  const layout = layoutGeoShapes(geoShapes(SOUTH_AFRICA_LESOTHO), BOX)
  const cmds = renderGeo(layout, [])
  const polys = cmds.filter((c): c is DrawCmd & { kind: 'polygon' } => c.kind === 'polygon')

  it('the polygon of a country with a hole carries it; one without carries none', () => {
    expect(polys[0]!.holes).toHaveLength(1)
    expect(polys[1]!.holes).toBeUndefined()
  })
  it('the hole is also stroked, so the border follows the lake', () => {
    expect(cmds.filter((c) => c.kind === 'polyline').length).toBe(2 + 1)
  })
  it('SVG fills the outline and its hole as one even-odd path; a plain polygon stays a <polygon>', () => {
    const svg = renderSvg(cmds, BOX.w, BOX.h)
    expect(svg).toContain('fill-rule="evenodd"')
    expect(svg.match(/<polygon /g)).toHaveLength(1)
    expect(svg.match(/<path d="M[^"]*Z M?[^"]*"|<path d="M[^"]*Z"/g)?.length).toBeGreaterThan(0)
  })
  it('RTL mirrors the holes with the outline', () => {
    const mirrored = mirrorCmds(cmds, BOX.w).filter((c): c is DrawCmd & { kind: 'polygon' } => c.kind === 'polygon')
    expect(mirrored[0]!.holes![0]![0]!.x).toBeCloseTo(BOX.w - polys[0]!.holes![0]![0]!.x, 9)
  })
  it('a tween interpolates the holes and refuses a pair whose holes differ in shape', () => {
    const shifted = cmds.map((c) => (c.kind === 'polygon' && c.holes !== undefined ? { ...c, holes: c.holes.map((h) => h.map((p) => ({ x: p.x + 10, y: p.y }))) } : c))
    expect(sameCmdShape(cmds, shifted)).toBe(true)
    const mid = tweenCmds(cmds, shifted, 0.5).find((c) => c.kind === 'polygon' && c.holes !== undefined) as DrawCmd & { kind: 'polygon' }
    expect(mid.holes![0]![0]!.x).toBeCloseTo(polys[0]!.holes![0]![0]!.x + 5, 9)
    expect(cmdsEqual(cmds, shifted)).toBe(false)
    const fewer = cmds.map((c) => (c.kind === 'polygon' && c.holes !== undefined ? { ...c, holes: [c.holes[0]!.slice(1)] } : c))
    expect(sameCmdShape(cmds, fewer)).toBe(false)
  })
})

describe('hit testing', () => {
  it('a point in Lesotho is Lesotho, not South Africa; a point in South Africa proper is South Africa', () => {
    const layout = layoutGeoShapes(geoShapes(SOUTH_AFRICA_LESOTHO), BOX)
    const c = centroidOf(layout.regions[0]!.holes[0]!)
    // Lesotho is drawn after South Africa, and the hole means South Africa never claims the point either.
    expect(hitGeoIndex(layout, c.x, c.y)).toBe(1)
    const reg = layout.regions[0]!
    expect(holesOf(reg, 0)).toHaveLength(1)
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

describe('geoToSvg with holes', () => {
  it('draws the cut-out as an even-odd path', () => {
    expect(geoToSvg({ geo: FLORIDA_LAKE, values: { Florida: 3 }, width: 300, height: 240 })).toContain('fill-rule="evenodd"')
  })
})
