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
