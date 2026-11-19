// The data modules: well-formed, the expected regions, unique join keys, and usable by <MapChart> as shipped.
import { describe, expect, it } from 'vitest'
import { geoToSvg, layoutGeo, topoToGeo } from '@pyreon/charts/engine'
import us from '../us-states'
import world from '../world-110m'

describe('world-110m', () => {
  const geo = topoToGeo(world.data, world.object)
  it('is a quantised topology of the countries, one feature each', () => {
    expect(world.data.type).toBe('Topology')
    expect(world.data.transform.scale.length).toBe(2)
    expect(geo.features.length).toBeGreaterThan(170)
    expect(geo.features.length).toBeLessThan(190)
  })
  it('every country has a name and a unique ISO 3166-1 alpha-3 id (the join key)', () => {
    const ids = geo.features.map((f) => String(f.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of geo.features) {
      expect(typeof f.properties?.name).toBe('string')
      expect(String(f.id)).toMatch(/^[A-Z]{3}$/)
    }
    for (const iso of ['USA', 'FRA', 'NOR', 'DEU', 'BRA', 'AUS']) expect(ids).toContain(iso)
  })
  it('carries the defaults it was prepared for', () => {
    expect([world.projection, world.nameProperty, world.idProperty]).toEqual(['equalEarth', 'name', 'id'])
  })
  it('lays out whole in Equal Earth: every region has area, all inside the box', () => {
    const layout = layoutGeo(world, { x: 0, y: 0, w: 800, h: 420 })
    expect(layout.transform.projection).toBe('equalEarth')
    expect(layout.regions.length).toBe(geo.features.length)
    for (const r of layout.regions) {
      expect(r.bbox.w).toBeGreaterThan(0)
      expect(r.bbox.x).toBeGreaterThanOrEqual(-1e-6)
      expect(r.bbox.x + r.bbox.w).toBeLessThanOrEqual(800 + 1e-6)
    }
  })
  it('joins values by id and draws server-side', () => {
    const svg = geoToSvg({ geo: world, values: { USA: 330, DEU: 83, FRA: 68 }, width: 640, height: 340 })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.length).toBeGreaterThan(10_000)
  })
})

describe('us-states', () => {
  const geo = topoToGeo(us.data, us.object)
  it('has the 50 states and DC, keyed by two-digit FIPS (Puerto Rico is left out: Albers USA has no inset for it)', () => {
    expect(geo.features.length).toBe(51)
    const ids = geo.features.map((f) => String(f.id))
    expect(new Set(ids).size).toBe(51)
    expect(ids).not.toContain('72')
    for (const id of ids) expect(id).toMatch(/^\d{2}$/)
    expect(geo.features.find((f) => f.id === '06')?.properties?.name).toBe('California')
    expect(geo.features.find((f) => f.id === '02')?.properties?.abbr).toBe('AK')
  })
  it('lays out in Albers USA with Alaska and Hawaii in the insets, below and left of the lower 48', () => {
    const layout = layoutGeo(us, { x: 0, y: 0, w: 960, h: 600 })
    expect(layout.transform.projection).toBe('albersUsa')
    const byName = new Map(layout.regions.map((r) => [r.label, r]))
    const ca = byName.get('California')!
    const ak = byName.get('Alaska')!
    const hi = byName.get('Hawaii')!
    expect(ak.centroid.y).toBeGreaterThan(ca.centroid.y)
    expect(hi.centroid.y).toBeGreaterThan(ca.centroid.y)
    expect(ak.centroid.x).toBeLessThan(hi.centroid.x)
    // the whole map is inside the box
    for (const r of layout.regions) {
      expect(r.bbox.x).toBeGreaterThanOrEqual(-1)
      expect(r.bbox.y + r.bbox.h).toBeLessThanOrEqual(601)
    }
  })
  it('joins values by FIPS', () => {
    expect(geoToSvg({ geo: us, values: { '06': 39, '48': 30 }, width: 640, height: 400 }).length).toBeGreaterThan(5_000)
  })
})

/** Pixels a region covers on a w x h grid (even-odd over its fill rings, sampled at pixel centres). */
function paintedPixels(rings: { x: number; y: number }[][], w: number, h: number): number {
  let count = 0
  for (let py = 0; py < h; py++) {
    const y = py + 0.5
    const xs: number[] = []
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!
        const b = ring[(i + 1) % ring.length]!
        if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y))
      }
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) count += Math.max(0, Math.floor(xs[k + 1]! - 0.5) - Math.ceil(xs[k]! - 0.5) + 1)
  }

  return count
}

describe('every region is visible in its default projection and box (nothing clipped, nothing thrown across the map)', () => {
  const cases = [
    ['us-states', us, 960, 600],
    ['world-110m', world, 800, 420],
  ] as const
  for (const [name, map, w, h] of cases) {
    it(`${name}: each region has painted pixels and its bounding box inside the plot`, () => {
      const layout = layoutGeo(map, { x: 0, y: 0, w, h })
      const missing: string[] = []
      const outside: string[] = []
      for (const r of layout.regions) {
        if (r.bbox.x < 0 || r.bbox.y < 0 || r.bbox.x + r.bbox.w > w + 1e-6 || r.bbox.y + r.bbox.h > h + 1e-6) outside.push(r.label)
        if (paintedPixels(r.fills, w, h) === 0) missing.push(r.label)
      }
      expect(outside, 'regions outside the plot').toEqual([])
      // At 110m a handful of micro-states are under a pixel in the world view; every US state, Alaska's Aleutians and Hawaii included, must show.
      if (name === 'us-states') expect(missing).toEqual([])
      else expect(missing.length).toBeLessThan(12)
    })
  }
  it('Alaska keeps its whole chain: the Aleutians reach the inset\'s left edge and nothing runs past the lower 48', () => {
    const layout = layoutGeo(us, { x: 0, y: 0, w: 960, h: 600 })
    const ak = layout.regions.find((r) => r.label === 'Alaska')!
    const wa = layout.regions.find((r) => r.label === 'Washington')!
    const ca = layout.regions.find((r) => r.label === 'California')!
    expect(ak.bbox.x).toBeGreaterThanOrEqual(0)
    expect(ak.bbox.x).toBeLessThan(ca.bbox.x + 80)
    expect(ak.bbox.y).toBeGreaterThan(wa.bbox.y)
    expect(ak.bbox.w).toBeLessThan(960 * 0.3)
  })
})
