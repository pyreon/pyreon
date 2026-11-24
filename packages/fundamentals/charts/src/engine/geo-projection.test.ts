// The projections: published reference values, the properties each one guarantees (equal-area, monotone along a
// parallel, round trip), the Albers USA insets, and the antimeridian rule.
import { describe, expect, it } from 'vitest'
import { geoProjectionParams, projectLonLatWith, unprojectLonLatWith } from './geo-projection'
import { geoProject, geoUnproject, layoutGeoShapes } from './geo'
import type { GeoProjection } from './geo'

function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296

    return s / 4294967296
  }
}

const fwd = (p: GeoProjection, lon: number, lat: number, params = geoProjectionParams(p)) => projectLonLatWith(lon, lat, p, params)
const inv = (p: GeoProjection, x: number, y: number, params = geoProjectionParams(p)) => unprojectLonLatWith(x, y, p, params)
const RAD = Math.PI / 180

describe('reference values', () => {
  it('Equal Earth: the pole value and the equator width published with the projection (Šavrič et al. 2018)', () => {
    expect(fwd('equalEarth', 0, 90).y).toBeCloseTo(1.3173627591574, 12)
    expect(fwd('equalEarth', 180, 0).x).toBeCloseTo(2.70663, 5)
    expect(fwd('equalEarth', 0, 0)).toEqual({ x: 0, y: 0 })
    // the pole is a line, 0.5926 of the equator's length (the paper's "pole line")
    expect(fwd('equalEarth', 180, 90).x / fwd('equalEarth', 180, 0).x).toBeCloseTo(0.5925, 3)
  })
  it('Natural Earth 1: the published polynomial at the equator and the pole', () => {
    expect(fwd('naturalEarth1', 180, 0).x).toBeCloseTo(0.8707 * Math.PI, 10)
    expect(fwd('naturalEarth1', 0, 90).y).toBeCloseTo(1.4223905067, 9)
    expect(fwd('naturalEarth1', 180, 90).x).toBeCloseTo(1.5055563920, 9)
  })
  it('Albers: the central meridian is x = 0, and a parallel is an arc (x grows with distance from it)', () => {
    expect(fwd('albers', -96, 40).x).toBeCloseTo(0, 12)
    expect(fwd('albers', -86, 40).x).toBeGreaterThan(0)
    expect(fwd('albers', -106, 40).x).toBeLessThan(0)
  })
  it('Albers: a standard parallel keeps its length (Snyder: scale factor 1 along the parallels)', () => {
    // along the standard parallel phi1 the true length of dlon is cos(phi1) * dlon; the plane distance matches it
    const p1 = 29.5
    const a = fwd('albers', -96, p1)
    const b = fwd('albers', -96 + 0.001 / Math.cos(p1 * RAD) / RAD, p1)
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(0.001, 6)
  })
})

describe('properties', () => {
  /** |det J| of (lon, lat) -> (x, y), per unit of sphere area (cos(lat) d lon d lat): 1 for an equal-area projection. */
  const areaScale = (p: GeoProjection, lon: number, lat: number): number => {
    const h = 1e-5
    const a = fwd(p, lon + h, lat)
    const b = fwd(p, lon - h, lat)
    const c = fwd(p, lon, lat + h)
    const d = fwd(p, lon, lat - h)
    const dxdl = (a.x - b.x) / (2 * h * RAD)
    const dydl = (a.y - b.y) / (2 * h * RAD)
    const dxdp = (c.x - d.x) / (2 * h * RAD)
    const dydp = (c.y - d.y) / (2 * h * RAD)

    return Math.abs(dxdl * dydp - dxdp * dydl) / Math.cos(lat * RAD)
  }
  it('Equal Earth and Albers are equal-area: the Jacobian is cos(lat) everywhere inside the domain', () => {
    const next = rng(5)
    for (let i = 0; i < 200; i++) {
      const lon = -170 + next() * 340
      const lat = -85 + next() * 170
      expect(areaScale('equalEarth', lon, lat)).toBeCloseTo(1, 3)
    }
    for (let i = 0; i < 200; i++) {
      const lon = -96 + (next() - 0.5) * 120
      const lat = -60 + next() * 140
      expect(areaScale('albers', lon, lat)).toBeCloseTo(1, 5)
    }
  })
  it('round trip: unproject(project(p)) is p, inside each projection\'s domain', () => {
    const next = rng(9)
    const tol: Record<string, number> = { equirectangular: 1e-9, mercator: 1e-7, equalEarth: 1e-8, naturalEarth1: 1e-6, albers: 1e-8, albersUsa: 1e-7 }
    for (const p of Object.keys(tol) as GeoProjection[]) {
      for (let i = 0; i < 200; i++) {
        const [lon, lat] = p === 'albersUsa' ? [-125 + next() * 58, 32 + next() * 17] : p === 'albers' ? [-96 + (next() - 0.5) * 100, 5 + next() * 75] : p === 'mercator' ? [-179 + next() * 358, -80 + next() * 160] : [-179 + next() * 358, -89 + next() * 178]
        const back = inv(p, fwd(p, lon, lat).x, fwd(p, lon, lat).y)
        expect(back.x, `${p} lon at ${lon},${lat}`).toBeCloseTo(lon, -Math.log10(tol[p]!) - 1)
        expect(back.y, `${p} lat at ${lon},${lat}`).toBeCloseTo(lat, -Math.log10(tol[p]!) - 1)
      }
    }
  })
  it('longitude is monotone along a parallel (x never goes back) in every projection that keeps meridians ordered', () => {
    for (const p of ['equirectangular', 'mercator', 'equalEarth', 'naturalEarth1'] as GeoProjection[]) {
      for (const lat of [-60, -20, 0, 35, 70]) {
        let last = -Infinity
        for (let lon = -180; lon <= 180; lon += 10) {
          const x = fwd(p, lon, lat).x
          expect(x, `${p} lat ${lat} lon ${lon}`).toBeGreaterThanOrEqual(last)
          last = x
        }
      }
    }
    let last = -Infinity
    for (let lon = -150; lon <= -40; lon += 5) {
      const x = fwd('albers', lon, 40).x
      expect(x).toBeGreaterThan(last)
      last = x
    }
  })
  it('a central meridian shifts the picture: lon0 maps to x = 0 and the far side wraps', () => {
    const params = geoProjectionParams('equalEarth', 150)
    expect(fwd('equalEarth', 150, 20, params).x).toBeCloseTo(0, 12)
    // -170 is 40 degrees east of 150 once wrapped, not 320 degrees west
    expect(fwd('equalEarth', -170, 20, params).x).toBeCloseTo(fwd('equalEarth', 40, 20).x, 9)
    const back = inv('equalEarth', fwd('equalEarth', 100, 10, params).x, fwd('equalEarth', 100, 10, params).y, params)
    expect(back.x).toBeCloseTo(100, 6)
  })
  it('an Albers with different parallels and centre differs from the default and still round-trips', () => {
    const params = geoProjectionParams('albers', -10, 0, 40, 60)
    expect(fwd('albers', 20, 50, params)).not.toEqual(fwd('albers', 20, 50))
    const p = fwd('albers', 20, 50, params)
    expect(inv('albers', p.x, p.y, params).x).toBeCloseTo(20, 8)
  })
})

describe('Albers USA', () => {
  const box = { x: 0, y: 0, w: 960, h: 600 }
  const shapes = [
    { name: 'lower', rings: [[fwd('albersUsa', -124, 48), fwd('albersUsa', -67, 45), fwd('albersUsa', -80, 25), fwd('albersUsa', -117, 32)]] },
    { name: 'ak', rings: [[fwd('albersUsa', -170, 55), fwd('albersUsa', -140, 70), fwd('albersUsa', -130, 55)]] },
    { name: 'hi', rings: [[fwd('albersUsa', -160, 22), fwd('albersUsa', -155, 20), fwd('albersUsa', -156, 19)]] },
  ]
  const t = layoutGeoShapes(shapes, box, { projection: 'albersUsa' }).transform

  it('Alaska and Hawaii land in the bottom-left insets, below and left of the lower 48', () => {
    const anchorage = geoProject(t, -149.9, 61.2)
    const honolulu = geoProject(t, -157.86, 21.31)
    const denver = geoProject(t, -104.99, 39.74)
    expect(anchorage.y).toBeGreaterThan(denver.y)
    expect(honolulu.y).toBeGreaterThan(denver.y)
    expect(anchorage.x).toBeLessThan(denver.x)
    expect(honolulu.x).toBeGreaterThan(anchorage.x)
    // the insets are inside the box
    for (const p of [anchorage, honolulu, denver]) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(box.w)
      expect(p.y).toBeLessThanOrEqual(box.h)
    }
  })
  it('an overlay point projects into the right inset, and unprojects back to where it was', () => {
    for (const [lon, lat] of [[-149.9, 61.2], [-157.86, 21.31], [-104.99, 39.74], [-122.3, 47.6], [-80.2, 25.8]] as const) {
      const px = geoProject(t, lon, lat)
      const back = geoUnproject(t, px.x, px.y)
      expect(back.x).toBeCloseTo(lon, 4)
      expect(back.y).toBeCloseTo(lat, 4)
    }
  })
  it('the inset boundaries do not overlap the lower 48 (insets are classified by position on the plane)', () => {
    const ak = fwd('albersUsa', -150, 62)
    expect(ak.x).toBeGreaterThanOrEqual(-0.425)
    expect(ak.x).toBeLessThan(-0.214)
    expect(ak.y).toBeGreaterThanOrEqual(-0.234)
    expect(ak.y).toBeLessThan(-0.12)
    const hi = fwd('albersUsa', -157.8, 21.3)
    expect(hi.x).toBeGreaterThanOrEqual(-0.214)
    expect(hi.x).toBeLessThan(-0.115)
  })
})

describe('antimeridian', () => {
  it('+180 and -180 are the same meridian: a world projection puts them at opposite edges, mirrored', () => {
    for (const p of ['equalEarth', 'naturalEarth1'] as GeoProjection[]) {
      const east = fwd(p, 180, 30)
      const west = fwd(p, -180, 30)
      expect(east.x).toBeCloseTo(-west.x, 10)
      expect(east.y).toBeCloseTo(west.y, 10)
    }
  })
  it('a longitude past 180 wraps (190 is -170), so data that crosses the seam is not thrown across the map', () => {
    expect(fwd('equalEarth', 190, 20).x).toBeCloseTo(fwd('equalEarth', -170, 20).x, 12)
  })
  it('the fit keeps its box: a projected world fits inside it with the aspect kept', () => {
    const world = [{ name: 'w', rings: [[fwd('equalEarth', -180, 0), fwd('equalEarth', 0, 90), fwd('equalEarth', 180, 0), fwd('equalEarth', 0, -90)]] }]
    const layout = layoutGeoShapes(world, { x: 0, y: 0, w: 600, h: 300 }, { projection: 'equalEarth', padding: 0 })
    const b = layout.regions[0]!.bbox
    expect(b.x).toBeGreaterThanOrEqual(-1e-9)
    expect(b.x + b.w).toBeLessThanOrEqual(600 + 1e-9)
    expect(b.y).toBeGreaterThanOrEqual(-1e-9)
    expect(b.y + b.h).toBeLessThanOrEqual(300 + 1e-9)
    expect(b.w / b.h).toBeCloseTo(2 * 2.70663 / (2 * 1.3173627591574), 3)
  })
})

describe('Albers USA: the Aleutians', () => {
  it('the part of the chain west of the antimeridian lands in the Alaska inset, not shot across the map', () => {
    for (const [lon, lat] of [[172.5, 52.9], [177.5, 51.9], [-176.6, 51.8], [-166.5, 53.9]] as const) {
      const p = fwd('albersUsa', lon, lat)
      expect(p.x, `${lon}`).toBeGreaterThan(-0.43)
      expect(p.x).toBeLessThan(-0.2)
      expect(p.y).toBeLessThan(-0.12)
      expect(p.y).toBeGreaterThan(-0.24)
    }
  })
  it('the antimeridian crossing is continuous: 179.9 and -179.9 land next to each other', () => {
    const a = fwd('albersUsa', 179.9, 52)
    const b = fwd('albersUsa', -179.9, 52)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01)
  })
  it('the inverse wraps back to a longitude in range', () => {
    const p = fwd('albersUsa', 175, 52)
    const back = inv('albersUsa', p.x, p.y)
    expect(back.x).toBeCloseTo(175, 5)
  })
})
