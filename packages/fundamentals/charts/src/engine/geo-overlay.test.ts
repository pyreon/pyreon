import { describe, expect, it } from 'vitest'
import { layoutGeoShapes } from './geo'
import { geoOverlayPointRadii, hitGeoOverlayPoint, renderGeoOverlayPaths, renderGeoOverlayPoints } from './geo-overlay'

const layout = layoutGeoShapes(
  [{ name: 'square', rings: [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }]] }],
  { x: 0, y: 0, w: 400, h: 200 },
  { padding: 0 },
)

describe('native-safe geographic overlays', () => {
  it('projects named coordinates for paths and animated point marks', () => {
    const points = [{ name: 'west', lon: 5, lat: 5, value: 1 }, { name: 'east', lon: 15, lat: 5, value: 4 }]
    expect(geoOverlayPointRadii(points, 5)[1]).toBeGreaterThan(geoOverlayPointRadii(points, 5)[0]!)
    expect(renderGeoOverlayPaths(layout, [{ coords: [{ lon: 0, lat: 0 }, { lon: 20, lat: 10 }] }])[0]).toMatchObject({
      kind: 'polyline',
      points: [{ x: 0, y: 200 }, { x: 400, y: 0 }],
    })
    expect(renderGeoOverlayPoints(layout, points, { effect: true, showLabels: true }).filter((c) => c.kind === 'circle')).toHaveLength(6)
    expect(renderGeoOverlayPoints(layout, points, { progress: 0 }).filter((c) => c.kind === 'circle' && c.radius > 0)).toHaveLength(0)
  })

  it('hit-tests points using their scaled radius', () => {
    const points = [{ lon: 5, lat: 5 }, { lon: 15, lat: 5 }]
    expect(hitGeoOverlayPoint(layout, points, 101, 100)).toBe(0)
    expect(hitGeoOverlayPoint(layout, points, 300, 100)).toBe(1)
    expect(hitGeoOverlayPoint(layout, points, 200, 20)).toBe(-1)
  })
})

describe('geo overlay — the progress clamp and partial paths', () => {
  // `progress` drives the draw-on animation. It is CLAMPED rather than
  // trusted: a caller easing past 1 (or below 0) would otherwise index past
  // the point list. A partial path keeps at least two points, because one
  // point is not a line and would vanish mid-animation.
  const pts = [{ lon: 2, lat: 2, value: 1 }, { lon: 18, lat: 8, value: 2 }]
  const path = { coords: [{ lon: 0, lat: 0 }, { lon: 5, lat: 5 }, { lon: 10, lat: 2 }, { lon: 18, lat: 9 }] }

  it('clamps progress outside 0..1 on both the point and path renderers', () => {
    const over = renderGeoOverlayPoints(layout, pts, { progress: 4 })
    const full = renderGeoOverlayPoints(layout, pts, { progress: 1 })
    expect(over).toEqual(full)
    const under = renderGeoOverlayPoints(layout, pts, { progress: -3 })
    expect(under).toEqual(renderGeoOverlayPoints(layout, pts, { progress: 0 }))
    expect(renderGeoOverlayPaths(layout, [path], { progress: 9 })).toEqual(
      renderGeoOverlayPaths(layout, [path], { progress: 1 }),
    )
  })

  it('draws nothing for a path at zero progress, and a partial line in between', () => {
    expect(renderGeoOverlayPaths(layout, [path], { progress: 0 })).toEqual([])
    const half = renderGeoOverlayPaths(layout, [path], { progress: 0.5 })
    const whole = renderGeoOverlayPaths(layout, [path], { progress: 1 })
    const points = (cmds: ReturnType<typeof renderGeoOverlayPaths>): number =>
      cmds.reduce((n, c) => n + (c.kind === 'polyline' ? c.points.length : 0), 0)
    expect(points(half)).toBeGreaterThanOrEqual(2)
    expect(points(half)).toBeLessThan(points(whole))
  })

  it('skips a degenerate path with fewer than two coordinates', () => {
    expect(renderGeoOverlayPaths(layout, [{ coords: [{ lon: 1, lat: 1 }] }], {})).toEqual([])
  })
})
