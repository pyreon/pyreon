// The geo layers added with the geo-lines work: the heatmap blobs, pies
// pinned to coordinates, and the moving trail on geo lines. Each is animated
// or data-driven, so its clamps (progress, inner radius, trail share, period)
// and its degenerate inputs (no spread, empty slices, one-point or zero-length
// paths, no trail at all) run on real frames.
import { describe, expect, it } from 'vitest'
import { layoutGeoShapes } from './geo'
import { geoHeatStops, renderGeoHeat, renderGeoPies, renderGeoTrails, renderGeoTrailsIfAny } from './geo-overlay'
import type { GeoTrail } from './geo-overlay'

const layout = layoutGeoShapes(
  [{ name: 'square', rings: [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }]] }],
  { x: 0, y: 0, w: 400, h: 200 },
  { padding: 0 },
)

describe('renderGeoHeat', () => {
  const pts = [{ lon: 5, lat: 5, value: 1 }, { lon: 15, lat: 5, value: 9 }]

  it('one radial-gradient blob per sample', () => {
    const out = renderGeoHeat(layout, pts, ['#000', '#fff'], 10, 1)
    expect(out).toHaveLength(2)
    expect(out.every((c) => c.kind === 'polygon' && c.grad?.radial === true)).toBe(true)
  })

  it('progress is clamped: below zero is invisible, above one is fully opaque', () => {
    const fill = (p: number) => {
      const [c] = renderGeoHeat(layout, pts, ['#000', '#fff'], 10, p)
      return c!.kind === 'polygon' ? c!.fill : ''
    }
    expect(fill(-1)).toBe(fill(0))
    expect(fill(5)).toBe(fill(1))
    expect(fill(0)).not.toBe(fill(1))
  })

  it('samples with NO value spread still colour (at the top of the ramp) rather than NaN', () => {
    const out = renderGeoHeat(layout, [{ lon: 5, lat: 5, value: 3 }, { lon: 6, lat: 5, value: 3 }], ['#000', '#fff'], 10, 1)
    for (const c of out) expect(c.kind === 'polygon' && c.fill).not.toContain('NaN')
  })

  it('an empty ramp falls back to the engine default rather than painting nothing', () => {
    const [c] = renderGeoHeat(layout, pts, [], 10, 1)
    expect(c!.kind === 'polygon' && c!.fill).toBeTruthy()
  })
})

describe('geoHeatStops', () => {
  it('prefers the layer stops, then the map fallback, then nothing', () => {
    expect(geoHeatStops(['#1'], ['#2'])).toEqual(['#1'])
    expect(geoHeatStops([], ['#2'])).toEqual(['#2'])
    expect(geoHeatStops([], undefined)).toEqual([])
  })
})

describe('renderGeoPies', () => {
  const slices = [{ value: 1, label: 'a', color: '#f00' }, { value: 3, label: 'b', color: '#0f0' }]
  const pie = (over: Record<string, unknown> = {}) => ({ lon: 10, lat: 5, radius: 20, innerRadius: 0, slices, ...over })

  it('draws one wedge per non-empty slice', () => {
    expect(renderGeoPies(layout, [pie()], 1)).toHaveLength(2)
  })

  it('skips a zero-value slice, which has no sweep', () => {
    expect(renderGeoPies(layout, [pie({ slices: [...slices, { value: 0, label: 'z', color: '#00f' }] })], 1)).toHaveLength(2)
  })

  it('clamps the inner radius into 0..0.95 and progress into 0..1', () => {
    const same = (a: unknown[], b: unknown[]) => JSON.stringify(a) === JSON.stringify(b)
    expect(same(renderGeoPies(layout, [pie({ innerRadius: -1 })], 1), renderGeoPies(layout, [pie({ innerRadius: 0 })], 1))).toBe(true)
    expect(same(renderGeoPies(layout, [pie({ innerRadius: 5 })], 1), renderGeoPies(layout, [pie({ innerRadius: 0.95 })], 1))).toBe(true)
    expect(same(renderGeoPies(layout, [pie()], 9), renderGeoPies(layout, [pie()], 1))).toBe(true)
    expect(same(renderGeoPies(layout, [pie()], -1), renderGeoPies(layout, [pie()], 0))).toBe(true)
  })
})

describe('renderGeoTrails', () => {
  const trail = (over: Partial<GeoTrail> = {}): GeoTrail => ({ period: 4, trailLength: 0.5, color: '', symbolSize: 6, ...over })
  const path = { coords: [{ lon: 0, lat: 0 }, { lon: 20, lat: 0 }], color: '#f00', width: 2 }
  const kinds = (t: GeoTrail, time: number, paths = [path]) => renderGeoTrails(layout, paths, t, time, '#999').map((c) => c.kind)

  it('draws a trail and a head per path', () => {
    expect(kinds(trail(), 2)).toEqual(['polyline', 'circle'])
  })

  it('no trail behind the head at time zero, nor with a zero or negative share', () => {
    expect(kinds(trail(), 0)).toEqual(['circle'])
    expect(kinds(trail({ trailLength: -1 }), 2)).toEqual(['circle'])
  })

  it('a share above one is clamped to the whole path', () => {
    expect(kinds(trail({ trailLength: 7 }), 2)).toEqual(['polyline', 'circle'])
  })

  it('a non-positive period falls back instead of dividing by zero', () => {
    for (const c of renderGeoTrails(layout, [path], trail({ period: 0 }), 1, '#999')) {
      if (c.kind === 'circle') expect(Number.isFinite(c.center.x)).toBe(true)
    }
  })

  it('a one-point or zero-length path draws nothing', () => {
    expect(kinds(trail(), 1, [{ coords: [{ lon: 1, lat: 1 }] }])).toEqual([])
    expect(kinds(trail(), 1, [{ coords: [{ lon: 1, lat: 1 }, { lon: 1, lat: 1 }] }])).toEqual([])
  })

  it('colour: the trail colour, else the path colour, else the fallback', () => {
    const head = (t: GeoTrail, p: typeof path | { coords: typeof path.coords }) =>
      renderGeoTrails(layout, [p], t, 1, '#999').find((c) => c.kind === 'circle')!
    expect(head(trail({ color: '#0f0' }), path).kind === 'circle' && head(trail({ color: '#0f0' }), path).fill).toBe('#0f0')
    expect(head(trail(), path).kind === 'circle' && head(trail(), path).fill).toBe('#f00')
    const bare = { coords: path.coords }
    expect(head(trail(), bare).kind === 'circle' && head(trail(), bare).fill).toBe('#999')
  })

  it('a path with no width gives a trail one pixel wider than the default', () => {
    const t = renderGeoTrails(layout, [{ coords: path.coords }], trail(), 2, '#999').find((c) => c.kind === 'polyline')!
    expect(t.kind === 'polyline' && t.width).toBe(2.5)
  })
})

describe('renderGeoTrailsIfAny', () => {
  it('draws nothing without a trail, and the same as renderGeoTrails with one', () => {
    const paths = [{ coords: [{ lon: 0, lat: 0 }, { lon: 20, lat: 0 }] }]
    expect(renderGeoTrailsIfAny(layout, paths, undefined, 2, '#999')).toEqual([])
    const t: GeoTrail = { period: 4, trailLength: 0.5, color: '', symbolSize: 6 }
    expect(renderGeoTrailsIfAny(layout, paths, t, 2, '#999')).toEqual(renderGeoTrails(layout, paths, t, 2, '#999'))
  })
})
