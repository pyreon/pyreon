import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * `<MapChart roam>` crosses: the view (zoom and pan) is host state merged into
 * the GeoOptions every render, so layout, paint and hit all follow it; a drag
 * pans and a pinch zooms through the engine's own `geoRoamPan` / `geoRoamZoom`.
 */
const app = (roam: string): string => `
import { MapChart } from '@pyreon/charts/plot'
import type { GeoShape } from '@pyreon/charts/plot'
const SHAPES: GeoShape[] = [
  { name: 'A', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]] },
  { name: 'B', rings: [[{ x: 12, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 8 }]] },
]
export function App() {
  return <MapChart map={SHAPES} values={{ A: 1, B: 2 }} height={200} ${roam} data-testid="map" />
}`

describe.each(['swift', 'kotlin'] as const)('MapChart roam on %s', (target) => {
  it('roam pans and zooms through the engine helpers, over the roamed options, and compiles', () => {
    const r = transform(app(`roam={true} scaleLimit={{ min: 1, max: 8 }}`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('geoRoamPan(pyreonView')
    expect(r.code).toContain('geoRoamZoom(')
    expect(r.code).toContain('pyreonRoamed')
    expect(r.code).toMatch(/8\.0\)/)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it("'move' pans only and 'scale' zooms only", () => {
    const move = transform(app(`roam="move"`), { target })
    expect(move.warnings).toEqual([])
    expect(move.code).toContain('geoRoamPan(')
    expect(move.code).not.toContain('geoRoamZoom(')
    const scale = transform(app(`roam="scale"`), { target })
    expect(scale.code).toContain('geoRoamZoom(')
    expect(scale.code).not.toContain('geoRoamPan(')
  })

  it('no roam leaves the map static', () => {
    const r = transform(app(''), { target })
    expect(r.code).not.toContain('pyreonView')
  })
})

describe.each(['swift', 'kotlin'] as const)('MapChart heat and pies on %s', (target) => {
  it('draws the heat layer through the theme ramp and the pies, and compiles', () => {
    const r = transform(`
import { MapChart } from '@pyreon/charts/plot'
import type { GeoHeatPoint, GeoPie, GeoShape } from '@pyreon/charts/plot'
const SHAPES: GeoShape[] = [{ name: 'A', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]] }]
const HEAT: GeoHeatPoint[] = [{ lon: 3, lat: 3, value: 5 }]
const PIES: GeoPie[] = [{ lon: 5, lat: 5, radius: 20, innerRadius: 0, slices: [{ value: 1, label: 'a', color: '#00ff00' }] }]
export function App() {
  return <MapChart map={SHAPES} values={{ A: 1 }} heat={HEAT} heatRadius={14} pies={PIES} height={200} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('renderGeoHeat(')
    expect(r.code).toContain('geoHeatStops(')
    expect(r.code).toContain('renderGeoPies(')
    expect(r.code).toContain('14.0')
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})

describe.each(['swift', 'kotlin'] as const)('MapChart trail on %s', (target) => {
  it('a trail wraps the host in the effect clock and draws it at the clock time, and compiles', () => {
    const r = transform(`
import { MapChart } from '@pyreon/charts/plot'
import type { GeoOverlayPath, GeoShape, GeoTrail } from '@pyreon/charts/plot'
const SHAPES: GeoShape[] = [{ name: 'A', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]] }]
const ROUTES: GeoOverlayPath[] = [{ coords: [{ lon: 0, lat: 0 }, { lon: 10, lat: 10 }] }]
const TRAIL: GeoTrail = { period: 2, trailLength: 0.3, color: '#ff0000', symbolSize: 6 }
export function App() {
  return <MapChart map={SHAPES} values={{ A: 1 }} paths={ROUTES} trail={TRAIL} height={200} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonChartClock')
    expect(r.code).toMatch(/renderGeoTrailsIfAny\([^)]*pyreonClock/)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('no trail, no clock', () => {
    const r = transform(`
import { MapChart } from '@pyreon/charts/plot'
import type { GeoShape } from '@pyreon/charts/plot'
const SHAPES: GeoShape[] = [{ name: 'A', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]] }]
export function App() {
  return <MapChart map={SHAPES} values={{ A: 1 }} height={200} />
}`, { target })
    expect(r.code).not.toContain('PyreonChartClock')
    expect(r.code).toContain('renderGeoTrailsIfAny(')
  })
})
