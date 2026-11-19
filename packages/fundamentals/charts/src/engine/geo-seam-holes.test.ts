// Holes under a projection that wraps longitude (Equal Earth, Natural Earth, Albers): the way a file writes a hole's
// longitudes (a whole turn away, or wrapped at the antimeridian) cannot move the hole. `geoShapes` shifts each inner
// ring to its outer ring (`alignHole`), and the projection also wraps every vertex relative to the central meridian,
// so this contract holds through either step alone: it locks the result, not `alignHole` by itself.
// Plus the map ramp accessor.
import { describe, expect, it } from 'vitest'
import { GEO_RAMP_DARK, GEO_RAMP_LIGHT, mapRamp } from './geo'
import { geoShapes } from './geo-web'
import type { GeoJson } from './geo-web'
import type { Pt } from './types'

const square = (lon: number, lat: number, size: number): number[][] => [
  [lon, lat],
  [lon + size, lat],
  [lon + size, lat + size],
  [lon, lat + size],
  [lon, lat],
]

const country = (outer: number[][], hole: number[][]): GeoJson => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Polygon', coordinates: [outer, hole] } }],
})

const close = (a: readonly Pt[], b: readonly Pt[]) => {
  expect(a).toHaveLength(b.length)
  a.forEach((p, i) => {
    expect(p.x).toBeCloseTo(b[i]!.x, 9)
    expect(p.y).toBeCloseTo(b[i]!.y, 9)
  })
}

describe('geoShapes — a hole is projected with its outer ring under a wrapping projection', () => {
  for (const projection of ['equalEarth', 'naturalEarth1', 'albers'] as const) {
    it(`${projection}: a hole written a whole turn away lands where the same hole written in place does`, () => {
      const outer = square(10, 0, 30)
      const inPlace = geoShapes(country(outer, square(20, 10, 5)), projection)[0]!
      for (const turns of [-2, -1, 1, 3]) {
        const shifted = geoShapes(country(outer, square(20 + 360 * turns, 10, 5)), projection)[0]!
        expect(shifted.holes).toHaveLength(1)
        close(shifted.holes![0]!, inPlace.holes![0]!)
        expect(shifted.holeHost).toEqual(inPlace.holeHost)
      }
    })
  }

  it('a hole whose own longitudes cross the seam is unwrapped like its outer ring, and closed', () => {
    // An outer ring around the antimeridian written continuously, its hole written the way files store it (wrapped).
    const outer = square(170, 0, 20)
    const wrapped = [
      [178, 5],
      [-178, 5],
      [-178, 10],
      [178, 10],
      [178, 5],
    ]
    const continuous = [
      [178, 5],
      [182, 5],
      [182, 10],
      [178, 10],
      [178, 5],
    ]
    const a = geoShapes(country(outer, wrapped), 'equalEarth')[0]!
    const b = geoShapes(country(outer, continuous), 'equalEarth')[0]!
    close(a.holes![0]!, b.holes![0]!)
    const ring = a.holes![0]!
    expect(ring[ring.length - 1]!.x).toBeCloseTo(ring[0]!.x, 9)
    expect(ring[ring.length - 1]!.y).toBeCloseTo(ring[0]!.y, 9)
    // The hole host is a ring that exists (the outer ring is cut into pieces at the seam).
    expect(a.holeHost![0]).toBeLessThan(a.rings.length)
  })
})

describe('mapRamp', () => {
  it('is the map ramp for each ground, low to high, as a copy the caller may change', () => {
    expect(mapRamp('light')).toEqual([...GEO_RAMP_LIGHT])
    expect(mapRamp('dark')).toEqual([...GEO_RAMP_DARK])
    const r = mapRamp('dark')
    r.reverse()
    expect(mapRamp('dark')).toEqual([...GEO_RAMP_DARK])
  })
})
