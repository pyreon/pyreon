import { describe, expect, it } from 'vitest'
import { geoProject, geoRoamPan, geoRoamZoom, hitGeoIndex, layoutGeoShapes } from './geo'
import type { GeoShape } from './geo'

const square = (name: string, x0: number, y0: number): GeoShape => ({ name, rings: [[{ x: x0, y: y0 }, { x: x0 + 10, y: y0 }, { x: x0 + 10, y: y0 + 10 }, { x: x0, y: y0 + 10 }]] })
const shapes = [square('west', 0, 0), square('east', 10, 0)]
const box = { x: 0, y: 0, w: 200, h: 100 }

describe('geo roam', () => {
  it('zoom 1 with no pan is the fitted layout', () => {
    const fit = layoutGeoShapes(shapes, box)
    const same = layoutGeoShapes(shapes, box, { zoom: 1, panX: 0, panY: 0 })
    expect(same.transform).toEqual(fit.transform)
  })

  it('zoom magnifies about the box centre and pan shifts every pixel, regions and overlays alike', () => {
    const fit = layoutGeoShapes(shapes, box)
    const z = layoutGeoShapes(shapes, box, { zoom: 2, panX: 15, panY: -5 })
    const cx = 100
    const cy = 50
    const f = geoProject(fit.transform, 10, 5)
    const p = geoProject(z.transform, 10, 5)
    expect(p.x).toBeCloseTo(cx + (f.x - cx) * 2 + 15, 6)
    expect(p.y).toBeCloseTo(cy + (f.y - cy) * 2 - 5, 6)
    expect(z.regions[0]!.bbox.w).toBeCloseTo(fit.regions[0]!.bbox.w * 2, 6)
  })

  it('zooming about the pointer keeps the map point under it fixed, within the scale limits', () => {
    const view = { zoom: 1, panX: 0, panY: 0 }
    const before = layoutGeoShapes(shapes, box, view)
    const px = 60
    const py = 30
    const next = geoRoamZoom(view, 3, px, py, box, 0.5, 20)
    expect(next.zoom).toBe(3)
    const after = layoutGeoShapes(shapes, box, next)
    // The region under the pointer is still under it.
    expect(hitGeoIndex(after, px, py)).toBe(hitGeoIndex(before, px, py))
    // The lon/lat that projected to the pointer still does.
    const t0 = before.transform
    const lon = t0.minX + (px - t0.ox) / t0.scale
    const lat = t0.maxY - (py - t0.oy) / t0.scale
    const q = geoProject(after.transform, lon, lat)
    expect(q.x).toBeCloseTo(px, 6)
    expect(q.y).toBeCloseTo(py, 6)
    expect(geoRoamZoom(view, 100, px, py, box, 0.5, 4).zoom).toBe(4)
    expect(geoRoamZoom(view, 0.01, px, py, box, 0.5, 4).zoom).toBe(0.5)
  })

  it('pan adds the pointer delta', () => {
    expect(geoRoamPan({ zoom: 2, panX: 1, panY: 2 }, 3, -4)).toEqual({ zoom: 2, panX: 4, panY: -2 })
  })
})
