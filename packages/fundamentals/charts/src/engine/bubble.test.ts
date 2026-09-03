import { describe, expect, it } from 'vitest'
import { bubbleRadii } from './bubble'

describe('bubbleRadii', () => {
  it('maps magnitudes to radii by area between the bounds', () => {
    const r = bubbleRadii([100, 25, 0], 3, 18)
    expect(r[0]).toBe(18)
    expect(r[1]).toBeCloseTo(3 + Math.sqrt(0.25) * 15)
    expect(r[2]).toBe(3)
  })
  it('an all-zero (or negative / NaN) series draws every bubble at the minimum', () => {
    expect(bubbleRadii([0, -4, Number.NaN], 3, 18)).toEqual([3, 3, 3])
  })
  it('an empty series is an empty list', () => {
    expect(bubbleRadii([], 3, 18)).toEqual([])
  })
})
