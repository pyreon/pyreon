// Branch coverage for the choropleth family: the projection's pole clamp, the
// fit-into-box extent scan, the "largest ring wins" centroid with its
// degenerate fallbacks, the value ramp's clamps, and the label rule that
// requires a label to land on LAND.
import { describe, expect, it } from 'vitest'
import { geoDomain, geoValueOf, hitGeo, hitGeoIndex, layoutGeoShapes, projectLonLat, renderGeo } from './geo'
import type { GeoShape, GeoValue } from './geo'

const box = { x: 0, y: 0, w: 200, h: 200 }
const square = (name: string, x: number, y: number, s = 10): GeoShape => ({
  name,
  rings: [[{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]],
})

describe('geo — projection', () => {
  it('equirectangular passes longitude and latitude straight through', () => {
    expect(projectLonLat(12, -34, 'equirectangular')).toEqual({ x: 12, y: -34 })
  })
  it('mercator keeps longitude and stretches latitude away from the equator', () => {
    const equator = projectLonLat(12, 0, 'mercator')
    expect(equator.x).toBe(12)
    expect(equator.y).toBeCloseTo(0, 9)
    expect(projectLonLat(0, 45, 'mercator').y).toBeGreaterThan(45)
  })
  it('the POLES are clamped at ±85 so the projection never runs to infinity', () => {
    const north = projectLonLat(0, 89.9, 'mercator')
    const south = projectLonLat(0, -89.9, 'mercator')
    expect(Number.isFinite(north.y)).toBe(true)
    expect(north.y).toBe(projectLonLat(0, 85, 'mercator').y)
    expect(south.y).toBe(projectLonLat(0, -85, 'mercator').y)
    expect(south.y).toBeCloseTo(-north.y, 9)
  })
})

describe('geo — fitting shapes into the box', () => {
  it('the extent is taken over every ring of every shape, in both directions', () => {
    // The second shape is LEFT of and BELOW the first, so both the minimum
    // scans have to fire after the seed.
    const l = layoutGeoShapes([square('a', 50, 50), square('b', 0, 0)], box)
    const xs = l.regions.flatMap((r) => r.rings.flat().map((p) => p.x))
    const ys = l.regions.flatMap((r) => r.rings.flat().map((p) => p.y))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(box.x)
    expect(Math.max(...xs)).toBeLessThanOrEqual(box.x + box.w)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(box.y)
    expect(Math.max(...ys)).toBeLessThanOrEqual(box.y + box.h)
  })
  it('projection space is Y-UP but the box is Y-DOWN, so the northern shape is drawn higher', () => {
    const l = layoutGeoShapes([square('south', 0, 0), square('north', 0, 50)], box)
    expect(l.regions[1]!.centroid.y).toBeLessThan(l.regions[0]!.centroid.y)
  })
  it('NO shapes lays out nothing and the transform is still usable', () => {
    const l = layoutGeoShapes([], box)
    expect(l.regions).toEqual([])
    expect(l.transform.scale).toBe(1)
  })
  it('a shape with NO rings gets a zero bbox anchored at the box origin, not a NaN centroid', () => {
    const l = layoutGeoShapes([{ name: 'ghost', rings: [] }], box)
    const r = l.regions[0]!
    expect(r.bbox).toEqual({ x: box.x, y: box.y, w: 0, h: 0 })
    expect(Number.isFinite(r.centroid.x)).toBe(true)
    expect(Number.isFinite(r.centroid.y)).toBe(true)
  })
  it('a DEGENERATE ring (zero area) falls back to the bbox centre rather than dividing by zero', () => {
    const line: GeoShape = { name: 'line', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]] }
    const l = layoutGeoShapes([line, square('real', 0, 0)], box)
    const r = l.regions[0]!
    expect(Number.isFinite(r.centroid.x)).toBe(true)
    expect(r.centroid.x).toBeCloseTo(r.bbox.x + r.bbox.w / 2, 9)
  })
  it('the LARGEST ring decides the centroid', () => {
    const multi: GeoShape = {
      name: 'islands',
      rings: [
        [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        [{ x: 50, y: 50 }, { x: 70, y: 50 }, { x: 70, y: 70 }, { x: 50, y: 70 }],
      ],
    }
    const l = layoutGeoShapes([multi], box)
    const r = l.regions[0]!
    const big = r.rings[1]!
    const bx = big.reduce((s, p) => s + p.x, 0) / 4
    expect(r.centroid.x, 'the centroid sits on the big island, not between them').toBeCloseTo(bx, 6)
  })
  it('a single-point extent still produces a finite layout instead of an infinite scale', () => {
    const dot: GeoShape = { name: 'dot', rings: [[{ x: 5, y: 5 }]] }
    const l = layoutGeoShapes([dot], box)
    expect(Number.isFinite(l.regions[0]!.rings[0]![0]!.x)).toBe(true)
    expect(l.transform.scale).toBe(1)
  })
})

describe('geo — values and the domain', () => {
  const layout = layoutGeoShapes([square('a', 0, 0), square('b', 20, 0), square('c', 40, 0)], box)
  it('a region with no entry reads as a gap, not zero', () => {
    expect(Number.isNaN(geoValueOf([{ region: 'a', value: 1 }], 'missing'))).toBe(true)
  })
  it('the domain spans the regions that have data, in both directions', () => {
    const values: GeoValue[] = [{ region: 'a', value: 10 }, { region: 'b', value: 2 }, { region: 'c', value: 30 }]
    expect(geoDomain(layout, values), 'b lowers the minimum after a seeds it').toEqual({ min: 2, max: 30 })
  })
  it('regions with NO data at all give a zero domain rather than an infinite one', () => {
    expect(geoDomain(layout, [])).toEqual({ min: 0, max: 0 })
    expect(geoDomain(layout, [{ region: 'a', value: Number.NaN }])).toEqual({ min: 0, max: 0 })
  })
  it('a value for a region that is not on the map is ignored', () => {
    expect(geoDomain(layout, [{ region: 'nowhere', value: 99 }])).toEqual({ min: 0, max: 0 })
  })
})

describe('geo — render', () => {
  const layout = layoutGeoShapes([square('a', 0, 0), square('b', 20, 0)], box)
  const values: GeoValue[] = [{ region: 'a', value: 1 }, { region: 'b', value: 9 }]
  const fills = (cmds: ReturnType<typeof renderGeo>) => cmds.filter((c) => c.kind === 'polygon').map((c) => (c as { fill: string }).fill)

  it('a region with NO value takes the empty colour, whatever the others are worth', () => {
    const f = fills(renderGeo(layout, [{ region: 'a', value: 5 }], { emptyColor: '#eeeeee' }))
    expect(f[1]).toBe('#eeeeee')
    expect(f[0]).not.toBe('#eeeeee')
  })
  it('progress is clamped at both ends, and zero progress paints everything empty', () => {
    const settled = renderGeo(layout, values)
    expect(renderGeo(layout, values, { progress: 3 })).toEqual(settled)
    const none = fills(renderGeo(layout, values, { progress: -1, emptyColor: '#eeeeee' }))
    expect(none).toEqual(['#eeeeee', '#eeeeee'])
  })
  it('a value OUTSIDE an explicit domain is clamped onto the ends of the ramp', () => {
    const inside = fills(renderGeo(layout, [{ region: 'a', value: 0 }, { region: 'b', value: 10 }], { domain: { min: 0, max: 10 } }))
    const outside = fills(renderGeo(layout, [{ region: 'a', value: -100 }, { region: 'b', value: 500 }], { domain: { min: 0, max: 10 } }))
    expect(outside).toEqual(inside)
  })
  it('a COLLAPSED domain puts every valued region at the top of the ramp', () => {
    const f = fills(renderGeo(layout, [{ region: 'a', value: 5 }, { region: 'b', value: 5 }]))
    expect(f[0]).toBe(f[1])
  })
  it('every ring gets a closed border polyline', () => {
    const borders = renderGeo(layout, values).filter((c) => c.kind === 'polyline') as { points: unknown[] }[]
    expect(borders).toHaveLength(2)
    expect(borders[0]!.points, 'the first point is repeated to close the ring').toHaveLength(5)
  })
  it('labels are off by default, and appear only on the settled frame', () => {
    expect(renderGeo(layout, values).some((c) => c.kind === 'text')).toBe(false)
    expect(renderGeo(layout, values, { showLabels: true, fontSize: 2 }).some((c) => c.kind === 'text')).toBe(true)
    expect(renderGeo(layout, values, { showLabels: true, fontSize: 2, progress: 0.5 }).some((c) => c.kind === 'text')).toBe(false)
  })
  it('a label that does not FIT its host ring is dropped', () => {
    // Too TALL for the ring box…
    expect(renderGeo(layout, values, { showLabels: true, fontSize: 500 }).some((c) => c.kind === 'text')).toBe(false)
    // …and too WIDE, which only a measure function can decide.
    expect(renderGeo(layout, values, { showLabels: true, fontSize: 2 }, () => 1e6).some((c) => c.kind === 'text')).toBe(false)
  })
  it('a region whose centroid lands in the WATER between its islands gets no label', () => {
    // A U-shaped region: its area centroid falls in the notch, which is
    // inside the bounding box and outside the polygon.
    const u: GeoShape = {
      name: 'U',
      rings: [[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 20, y: 30 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }]],
    }
    const l = layoutGeoShapes([u], box)
    const ring = l.regions[0]!.rings[0]!
    const c = l.regions[0]!.centroid
    let inside = false
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!
      const b = ring[i === 0 ? ring.length - 1 : i - 1]!
      if ((a.y > c.y) !== (b.y > c.y) && c.x < ((b.x - a.x) * (c.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
    expect(inside, 'the fixture must actually put the centroid off the land').toBe(false)
    expect(renderGeo(l, [], { showLabels: true, fontSize: 1 }).some((c2) => c2.kind === 'text')).toBe(false)
  })
})

describe('geo — hit test', () => {
  const layout = layoutGeoShapes([square('a', 0, 0), square('b', 20, 0)], box)
  it('a point inside a region reports it by index and by value', () => {
    const c = layout.regions[0]!.centroid
    expect(hitGeoIndex(layout, c.x, c.y)).toBe(0)
    expect(hitGeo(layout, c.x, c.y)!.name).toBe('a')
  })
  it('a point outside every bbox is a miss on both entry points', () => {
    expect(hitGeoIndex(layout, -100, -100)).toBe(-1)
    expect(hitGeo(layout, -100, -100)).toBeNull()
  })
  it('a point inside a bbox but OUTSIDE the ring is still a miss', () => {
    // An L-shape: the notch is inside the bounding box and outside the polygon.
    const ell: GeoShape = {
      name: 'L',
      rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }]],
    }
    const l = layoutGeoShapes([ell], box)
    const r = l.regions[0]!
    const notch = { x: r.bbox.x + r.bbox.w * 0.9, y: r.bbox.y + r.bbox.h * 0.1 }
    expect(notch.x).toBeLessThanOrEqual(r.bbox.x + r.bbox.w)
    expect(hitGeoIndex(l, notch.x, notch.y)).toBe(-1)
  })
  it('the LAST drawn region wins where two overlap', () => {
    const overlapping = layoutGeoShapes([square('under', 0, 0, 20), square('over', 5, 5, 20)], box)
    const c = overlapping.regions[1]!.centroid
    expect(hitGeo(overlapping, c.x, c.y)!.name).toBe('over')
  })
})
