// The polyline helpers the geo overlay's trails are drawn with, at their edges.
import { describe, expect, it } from 'vitest'
import { pathLength, pointAlong, subPath } from './lines'

describe('polyline helpers', () => {
  const L = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }]

  it('pointAlong on an empty line is the origin, and past the end clamps to the last point', () => {
    expect(pointAlong([], 5)).toEqual({ x: 0, y: 0 })
    expect(pointAlong(L, 1000)).toEqual({ x: 30, y: 40 })
  })

  it('pathLength sums every segment', () => {
    expect(pathLength(L)).toBe(70)
    expect(pathLength([{ x: 1, y: 1 }])).toBe(0)
  })

  it('subPath is empty for a one-point line or an empty / reversed window', () => {
    expect(subPath([{ x: 0, y: 0 }], 0, 5)).toEqual([])
    expect(subPath(L, 10, 10)).toEqual([])
    expect(subPath(L, 20, 10)).toEqual([])
  })

  it('subPath includes an interior vertex only when the window strictly contains it', () => {
    // The corner sits at distance 30.
    expect(subPath(L, 10, 50)).toContainEqual({ x: 30, y: 0 })
    expect(subPath(L, 31, 50)).not.toContainEqual({ x: 30, y: 0 })
  })
})
