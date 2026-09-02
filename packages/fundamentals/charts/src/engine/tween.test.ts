import { describe, expect, it } from 'vitest'
import { easeOutCubic, sameShape, sameValues, tweenValues } from './tween'

describe('tween', () => {
  it('eases out and clamps', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 9)
    expect(easeOutCubic(2)).toBe(1)
  })
  it('shape and value equality treat NaN gaps as equal to themselves', () => {
    expect(sameShape([[1, 2]], [[3, 4]])).toBe(true)
    expect(sameShape([[1, 2]], [[3]])).toBe(false)
    expect(sameValues([[1, NaN]], [[1, NaN]])).toBe(true)
    expect(sameValues([[1, 2]], [[1, 3]])).toBe(false)
  })
  it('interpolates per value, keeps gaps, and passes rows of a different length through', () => {
    const f = tweenValues([[0, 10, NaN]], [[10, 0, 5]], 0.5)
    expect(f[0]![0]).toBeCloseTo(8.75, 9)
    expect(f[0]![1]).toBeCloseTo(1.25, 9)
    // A value replacing a gap snaps in; a gap replacing a value is a gap at once.
    expect(f[0]![2]).toBe(5)
    expect(Number.isNaN(tweenValues([[5]], [[NaN]], 0.5)[0]![0])).toBe(true)
    expect(tweenValues([[1]], [[1, 2]], 0.5)).toEqual([[1, 2]])
    expect(tweenValues([[0]], [[4]], 1)).toEqual([[4]])
  })
})
