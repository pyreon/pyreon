import { describe, expect, it } from 'vitest'
import { boxRect, circleRect, layoutLength, splitLayers } from './option-layers'

const pie = (name = 'p') => ({ type: 'pie', name, data: [{ name: 'a', value: 1 }] })

describe('splitLayers — the series list shape', () => {
  it('a single series object (not an array) is one series, so it is not layered', () => {
    expect(splitLayers({ series: pie() }, 400, 300)).toBeNull()
  })
  it('a non-object series value is no series at all', () => {
    expect(splitLayers({ series: 'nope' }, 400, 300)).toBeNull()
    expect(splitLayers({}, 400, 300)).toBeNull()
  })
})

describe('splitLayers — coordinate systems of the less common types', () => {
  it('parallel and themeRiver series each join their shared coordinate layer', () => {
    const layers = splitLayers({ series: [{ type: 'parallel', data: [] }, { type: 'themeRiver', data: [] }, pie()] }, 400, 300)!
    expect(layers.map((l) => l.kind)).toEqual(['singleAxis', 'parallel', 'family'])
  })
  it('a map on the geo shares the geo layer; a standalone map is its own family layer', () => {
    const onGeo = splitLayers({ series: [{ type: 'map', coordinateSystem: 'geo' }, { type: 'scatter', coordinateSystem: 'geo' }, pie()] }, 400, 300)!
    expect(onGeo.map((l) => l.kind)).toEqual(['geo', 'family'])
    expect((onGeo[0]!.option['series'] as unknown[]).length).toBe(2)
    const alone = splitLayers({ series: [{ type: 'map' }, pie()] }, 400, 300)!
    expect(alone.map((l) => l.kind)).toEqual(['family', 'family'])
  })
  it('a series with no string type and no coordinate system is a standalone layer', () => {
    const layers = splitLayers({ series: [{ type: 7 }, pie()] }, 400, 300)!
    expect(layers.map((l) => l.kind)).toEqual(['family', 'family'])
  })
})

describe('boxRect — keyword edges and derived sides', () => {
  it('left/top keywords pin to the origin; right/bottom pin to the far edge', () => {
    expect(boxRect({ left: 'left', top: 'top', width: 100, height: 50 }, 400, 300)).toEqual({ x: 0, y: 0, w: 100, h: 50 })
    expect(boxRect({ left: 'right', top: 'bottom', width: 100, height: 50 }, 400, 300)).toEqual({ x: 300, y: 250, w: 100, h: 50 })
  })
  it('no left but a width and right: x is derived from the right edge', () => {
    expect(boxRect({ right: 20, width: 100, bottom: 10, height: 50 }, 400, 300)).toEqual({ x: 280, y: 240, w: 100, h: 50 })
  })
  it('a width without a right (or a right without a width) starts at the origin', () => {
    expect(boxRect({ width: 100, height: 50 }, 400, 300)).toEqual({ x: 0, y: 0, w: 100, h: 50 })
  })
  it('no sides at all fills the whole box', () => {
    expect(boxRect({}, 400, 300)).toEqual({ x: 0, y: 0, w: 400, h: 300 })
  })
})

describe('circleRect — a scalar center', () => {
  it('a single value is used for both axes', () => {
    // center 100 px on both axes, radius 50 px → a 100 px square around (100, 100).
    expect(circleRect({ center: 100, radius: 50 }, 400, 300, '50%')).toEqual({ x: 50, y: 50, w: 100, h: 100 })
  })
})

describe('layoutLength — a percent that does not parse', () => {
  it('falls back rather than reading NaN', () => {
    expect(layoutLength('abc%', 200, 7)).toBe(7)
    expect(layoutLength('%', 200, 7)).toBe(7)
    expect(layoutLength('25%', 200, 7)).toBe(50)
  })
})
