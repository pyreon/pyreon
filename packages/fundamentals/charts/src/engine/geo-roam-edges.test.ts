// geoRoamZoom's clamp bounds when the authored limits are unusable, and a
// shape whose ring is empty.
import { describe, expect, it } from 'vitest'
import { geoRoamZoom, layoutGeoShapes } from './geo'

const box = { x: 0, y: 0, w: 100, h: 100 }

describe('geoRoamZoom limits', () => {
  it('a non-positive minZoom falls back to 0.1', () => {
    expect(geoRoamZoom({ zoom: 1, panX: 0, panY: 0 }, 0.001, 50, 50, box, 0, 10).zoom).toBe(0.1)
  })

  it('a maxZoom below the minimum is raised to it', () => {
    expect(geoRoamZoom({ zoom: 1, panX: 0, panY: 0 }, 50, 50, 50, box, 2, 1).zoom).toBe(2)
  })
})

describe('an empty ring', () => {
  it('lays out without NaN', () => {
    const l = layoutGeoShapes([{ name: 'empty', rings: [[]] }], box, { padding: 0 })
    expect(JSON.stringify(l)).not.toContain('null')
  })
})
