// The map layers: great-circle flows, the sphere and graticule, the bubble size legend, fit-to-region, and cutting
// rings at the seam.
import { describe, expect, it } from 'vitest'
import { geoFitView, greatCircleDegrees, greatCirclePoint, renderGeoBelow, renderGeoFlows, renderGeoGraticule, renderGeoSizeLegend, renderGeoSphere } from './geo-layers'
import { layoutGeoShapes } from './geo'
import { cutRingAtSeam, geoFeatures, geoShapes, layoutGeo } from './geo-web'
import { geoProjectionParams, geoSphereRing, projectLonLatWith } from './geo-projection'
import type { GeoJson } from './geo-web'
import type { DrawCmd } from './types'

function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296

    return s / 4294967296
  }
}

const BOX = { x: 0, y: 0, w: 640, h: 340 }
const world = (opts: Record<string, unknown> = {}) => layoutGeoShapes([{ name: 'w', rings: [[projectLonLatWith(-170, -60, 'equalEarth', geoProjectionParams('equalEarth')), projectLonLatWith(170, -60, 'equalEarth', geoProjectionParams('equalEarth')), projectLonLatWith(170, 70, 'equalEarth', geoProjectionParams('equalEarth')), projectLonLatWith(-170, 70, 'equalEarth', geoProjectionParams('equalEarth'))]] }], BOX, { projection: 'equalEarth', ...opts })
const lines = (cmds: DrawCmd[]): (DrawCmd & { kind: 'polyline' })[] => cmds.filter((c): c is DrawCmd & { kind: 'polyline' } => c.kind === 'polyline')

describe('great circles', () => {
  it('start and end where asked, and the midpoint of a quarter of the equator is 45 degrees along it', () => {
    const a = { lon: 10, lat: 20 }
    const b = { lon: -75, lat: 40 }
    expect(greatCirclePoint(a, b, 0)).toEqual({ lon: 10, lat: 20 })
    const end = greatCirclePoint(a, b, 1)
    expect(end.lon).toBeCloseTo(-75, 9)
    expect(end.lat).toBeCloseTo(40, 9)
    const mid = greatCirclePoint({ lon: 0, lat: 0 }, { lon: 90, lat: 0 }, 0.5)
    expect(mid.lon).toBeCloseTo(45, 9)
    expect(mid.lat).toBeCloseTo(0, 9)
  })
  it('property: points are equally spaced in ARC (angle) along the circle, whatever the pair', () => {
    const next = rng(4)
    for (let t = 0; t < 40; t++) {
      const a = { lon: -180 + next() * 360, lat: -80 + next() * 160 }
      const b = { lon: -180 + next() * 360, lat: -80 + next() * 160 }
      const total = greatCircleDegrees(a, b)
      for (const u of [0.25, 0.5, 0.8]) expect(greatCircleDegrees(a, greatCirclePoint(a, b, u))).toBeCloseTo(total * u, 6)
    }
  })
  it('a flow\'s drawn length is the asked fraction of the arc ON THE SPHERE, not of its sample count', () => {
    const layout = world()
    const flow = { from: { lon: -120, lat: 35 }, to: { lon: 140, lat: 35 } }
    const full = lines(renderGeoFlows(layout, [flow]))
    const half = lines(renderGeoFlows(layout, [flow], { progress: 0.5 }))
    const arcEnd = (cmds: ReturnType<typeof lines>): number => cmds.flatMap((c) => c.points).length
    expect(arcEnd(half)).toBeLessThan(arcEnd(full))
    // the last point of the half-drawn arc is the great-circle midpoint, projected
    const mid = greatCirclePoint(flow.from, flow.to, 0.5)
    const want = layoutPoint(layout, mid.lon, mid.lat)
    const last = half[half.length - 1]!.points.at(-1)!
    expect(last.x).toBeCloseTo(want.x, 6)
    expect(last.y).toBeCloseTo(want.y, 6)
  })
  it('an arc across the antimeridian is TWO runs, never a chord across the map', () => {
    const layout = world()
    const runs = lines(renderGeoFlows(layout, [{ from: { lon: 140, lat: 35 }, to: { lon: -120, lat: 35 } }]))
    expect(runs.length).toBe(2)
    for (const r of runs) for (let i = 1; i < r.points.length; i++) expect(Math.abs(r.points[i]!.x - r.points[i - 1]!.x)).toBeLessThan(BOX.w / 4)
  })
  it('value sets the width between the bounds, and progress 0 draws nothing', () => {
    const layout = world()
    const flows = [{ from: { lon: 0, lat: 0 }, to: { lon: 40, lat: 10 }, value: 10 }, { from: { lon: 0, lat: 0 }, to: { lon: 60, lat: -10 }, value: 40 }]
    const w = lines(renderGeoFlows(layout, flows, { minWidth: 1, maxWidth: 5 })).map((c) => c.width)
    expect(w[0]!).toBeLessThan(w[1]!)
    expect(w[1]).toBe(5)
    expect(renderGeoFlows(layout, flows, { progress: 0 })).toEqual([])
  })
})

const layoutPoint = (layout: ReturnType<typeof world>, lon: number, lat: number) => {
  const t = layout.transform
  const p = projectLonLatWith(lon, lat, t.projection, t.params)

  return { x: t.ox + (p.x - t.minX) * t.scale, y: t.oy + (t.maxY - p.y) * t.scale }
}

describe('sphere and graticule', () => {
  it('the sphere outline is inside the box when it takes part in the fit, and the fit reaches the box edges', () => {
    const layout = world({ sphere: true, padding: 0 })
    const ring = geoSphereRing('equalEarth', geoProjectionParams('equalEarth')).map((p) => ({ x: layout.transform.ox + (p.x - layout.transform.minX) * layout.transform.scale, y: layout.transform.oy + (layout.transform.maxY - p.y) * layout.transform.scale }))
    for (const p of ring) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-6)
      expect(p.x).toBeLessThanOrEqual(BOX.w + 1e-6)
      expect(p.y).toBeGreaterThanOrEqual(-1e-6)
      expect(p.y).toBeLessThanOrEqual(BOX.h + 1e-6)
    }
    expect(Math.max(...ring.map((p) => p.x)) - Math.min(...ring.map((p) => p.x))).toBeGreaterThan(BOX.w * 0.9)
  })
  it('the sphere is a filled polygon then its stroke; Albers USA has none', () => {
    const cmds = renderGeoSphere(world({ sphere: true }), '#aaa', '#bbb')
    expect(cmds.map((c) => c.kind)).toEqual(['polygon', 'polyline'])
    expect(geoSphereRing('albersUsa', geoProjectionParams('albersUsa'))).toEqual([])
  })
  it('the graticule draws a meridian and a parallel set at the step, none for a step under 1 degree', () => {
    const layout = world()
    const g = lines(renderGeoGraticule(layout, 30, '#ccc'))
    expect(g.length).toBe(13 + 5)
    expect(renderGeoGraticule(layout, 0.5, '#ccc')).toEqual([])
  })
  it('no graticule line crosses the seam: every run stays inside the box', () => {
    for (const line of lines(renderGeoGraticule(world({ sphere: true, padding: 0 }), 15, '#ccc'))) {for (const p of line.points) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-6)
        expect(p.x).toBeLessThanOrEqual(BOX.w + 1e-6)
      }}
  })
  it('renderGeoBelow draws nothing unless asked', () => {
    expect(renderGeoBelow(world())).toEqual([])
    expect(renderGeoBelow(world({ sphere: true }), { sphere: true, graticule: 30 }).length).toBeGreaterThan(10)
  })
})

describe('bubble size legend', () => {
  const points = [{ lon: 0, lat: 0, value: 1_200_000 }, { lon: 1, lat: 1, value: 300_000 }, { lon: 2, lat: 2, value: 9000 }]
  it('three nested circles of nice values 1M, 500k and 100k, each labelled, inside the box', () => {
    const cmds = renderGeoSizeLegend(points, BOX, { radius: 10 })
    const text = cmds.filter((c) => c.kind === 'text').map((c) => (c as { text: string }).text)
    expect(text).toEqual(['1M', '500k', '100k'])
    const radii = cmds.filter((c) => c.kind === 'circle').map((c) => (c as { radius: number }).radius)
    expect(radii[0]!).toBeGreaterThan(radii[1]!)
    expect(radii[1]!).toBeGreaterThan(radii[2]!)
    for (const c of cmds) if (c.kind === 'circle') expect(c.center.y + c.radius).toBeLessThanOrEqual(BOX.y + BOX.h)
  })
  it('uses the points\' own size rule: a legend circle is as big as a point of that value would be', () => {
    const cmds = renderGeoSizeLegend(points, BOX, { radius: 10 })
    const big = cmds.find((c) => c.kind === 'circle') as { radius: number }
    // 1M of a 1.2M maximum: 10 * (0.6 + 1.4 * sqrt(1/1.2))
    expect(big.radius).toBeCloseTo(10 * (0.6 + 1.4 * Math.sqrt(1_000_000 / 1_200_000)), 9)
  })
  it('draws nothing when no point has a value', () => {
    expect(renderGeoSizeLegend([{ lon: 0, lat: 0 }], BOX)).toEqual([])
  })
})

describe('fit to regions', () => {
  const geo: GeoJson = { type: 'FeatureCollection', features: [0, 1, 2, 3].map((i) => ({ type: 'Feature', properties: { name: `r${i}` }, geometry: { type: 'Polygon', coordinates: [[[i * 10, 0], [i * 10 + 8, 0], [i * 10 + 8, 8], [i * 10, 8], [i * 10, 0]]] } })) }
  it('property: the chosen regions end up centred in the box and filling it (less the padding), whichever are chosen', () => {
    const fitted = layoutGeo(geo, BOX)
    const next = rng(2)
    for (let t = 0; t < 30; t++) {
      const pick = [0, 1, 2, 3].filter(() => next() < 0.5)
      if (pick.length === 0) continue
      const view = geoFitView(fitted, BOX, pick, 10)
      const zoomed = layoutGeo(geo, BOX, { zoom: view.zoom, panX: view.panX, panY: view.panY })
      const boxes = pick.map((i) => zoomed.regions[i]!.bbox)
      const x0 = Math.min(...boxes.map((b) => b.x))
      const x1 = Math.max(...boxes.map((b) => b.x + b.w))
      const y0 = Math.min(...boxes.map((b) => b.y))
      const y1 = Math.max(...boxes.map((b) => b.y + b.h))
      expect((x0 + x1) / 2).toBeCloseTo(BOX.w / 2, 6)
      expect((y0 + y1) / 2).toBeCloseTo(BOX.h / 2, 6)
      expect(Math.max((x1 - x0) / (BOX.w - 20), (y1 - y0) / (BOX.h - 20))).toBeCloseTo(1, 6)
    }
  })
  it('nothing chosen, or an index out of range, is the fitted view', () => {
    const fitted = layoutGeo(geo, BOX)
    expect(geoFitView(fitted, BOX, [], 10)).toEqual({ zoom: 1, panX: 0, panY: 0 })
    expect(geoFitView(fitted, BOX, [99], 10)).toEqual({ zoom: 1, panX: 0, panY: 0 })
  })
})

describe('cutting rings at the seam', () => {
  const area = (ring: number[][]): number => {
    let a = 0
    for (let i = 0; i < ring.length - 1; i++) a += ring[i]![0]! * ring[i + 1]![1]! - ring[i + 1]![0]! * ring[i]![1]!

    return Math.abs(a / 2)
  }
  it('a ring that never reaches the seam comes back whole', () => {
    const ring = [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]
    expect(cutRingAtSeam(ring, 0)).toEqual([ring])
  })
  it('a Fiji-like ring crossing 180 is two pieces inside the window whose areas add up to the original', () => {
    const ring = [[177, -16], [-179, -16], [-179, -19], [177, -19], [177, -16]]
    const pieces = cutRingAtSeam(ring, 0)
    expect(pieces).toHaveLength(2)
    for (const p of pieces) for (const v of p) expect(Math.abs(v[0]!)).toBeLessThanOrEqual(180 + 1e-9)
    // the original is 4 wide (177 -> 181) and 3 tall
    expect(pieces.reduce((s, p) => s + area(p), 0)).toBeCloseTo(12, 9)
  })
  it('property: any rectangle, anywhere in longitude, keeps its area when cut for any central meridian', () => {
    const next = rng(8)
    for (let t = 0; t < 120; t++) {
      const lon = -360 + next() * 720
      const w = 1 + next() * 120
      const lat = -60 + next() * 100
      const ring = [[lon, lat], [lon + w, lat], [lon + w, lat + 10], [lon, lat + 10], [lon, lat]]
      const lon0 = -180 + next() * 360
      const pieces = cutRingAtSeam(ring, lon0)
      for (const p of pieces) {for (const v of p) {
        expect(v[0]!).toBeGreaterThanOrEqual(lon0 - 180 - 1e-9)
        expect(v[0]!).toBeLessThanOrEqual(lon0 + 180 + 1e-9)
      }}
      expect(pieces.reduce((s, p) => s + area(p), 0)).toBeCloseTo(w * 10, 6)
    }
  })
  it('geoShapes cuts a polygon that spans the antimeridian for a wrapping projection, and not for a flat one', () => {
    const geo: GeoJson = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'F' }, geometry: { type: 'Polygon', coordinates: [[[177, -16], [-179, -16], [-179, -19], [177, -19], [177, -16]]] } }] }
    expect(geoShapes(geo, 'equalEarth')[0]!.rings).toHaveLength(2)
    expect(geoShapes(geo, 'equirectangular')[0]!.rings).toHaveLength(1)
  })
})

describe('Point, MultiPoint and LineString features', () => {
  const geo: GeoJson = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'City' }, geometry: { type: 'Point', coordinates: [10, 20] } },
      { type: 'Feature', properties: { name: 'Pair' }, geometry: { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [5, 5]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] } },
      { type: 'Feature', properties: { name: 'Land' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [9, 0], [9, 9], [0, 9], [0, 0]]] } },
    ],
  }
  it('become point marks and paths, and leave the polygons alone', () => {
    const src = geoFeatures(geo)
    expect(src.shapes.map((s) => s.name)).toEqual(['Land'])
    expect(src.points).toEqual([{ lon: 10, lat: 20, name: 'City' }, { lon: 1, lat: 2, name: 'Pair' }, { lon: 3, lat: 4, name: 'Pair' }])
    expect(src.lines).toHaveLength(3)
    expect(src.lines[0]!.coords).toEqual([{ lon: 0, lat: 0 }, { lon: 5, lat: 5 }])
  })
})
