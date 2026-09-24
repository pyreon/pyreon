// The whisker fallback: when EVERY sample sits outside the fences there is no
// in-fence value to end a whisker on, so the box's own quartiles stand in.
// Without it the whiskers would keep their sentinel initial values and the box
// would render at an arbitrary extent — a silently wrong chart rather than an
// error.
import { describe, expect, it } from 'vitest'
import { fiveNumber } from './boxplot'

describe('fiveNumber — whiskers with nothing in the fences', () => {
  it('falls back to the quartiles when every sample is an outlier', () => {
    // Two tight clusters far apart: the IQR is huge relative to each cluster,
    // but a single extreme pair on both sides pushes every value out.
    const s = fiveNumber([0, 0, 100, 100])
    expect(s.min).toBeLessThanOrEqual(s.q1)
    expect(s.max).toBeGreaterThanOrEqual(s.q3)
    expect(Number.isFinite(s.min)).toBe(true)
    expect(Number.isFinite(s.max)).toBe(true)
  })

  it('a single sample is its own five-number summary', () => {
    const s = fiveNumber([7])
    expect(s.min).toBe(7)
    expect(s.median).toBe(7)
    expect(s.max).toBe(7)
    expect(s.outliers).toEqual([])
  })

  it('identical samples have no spread and no outliers', () => {
    const s = fiveNumber([3, 3, 3, 3])
    expect(s.q1).toBe(3)
    expect(s.q3).toBe(3)
    expect(s.min).toBe(3)
    expect(s.max).toBe(3)
    expect(s.outliers).toEqual([])
  })

  it('an ordinary sample keeps its whiskers inside the fences and lists the outliers', () => {
    const s = fiveNumber([1, 2, 3, 4, 5, 100])
    expect(s.outliers).toContain(100)
    expect(s.max).toBeLessThan(100)
    expect(s.min).toBe(1)
  })
})
