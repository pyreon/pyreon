import { describe, expect, it } from 'vitest'
import { scrollToRow, visibleRange } from './virtual'

describe('visibleRange', () => {
  it('renders the viewport plus overscan, never past the ends', () => {
    expect(visibleRange(0, 280, 28, 10_000, 5)).toEqual({ start: 0, end: 16 })
    expect(visibleRange(28 * 1000, 280, 28, 10_000, 5)).toEqual({ start: 995, end: 1016 })
    expect(visibleRange(28 * 9_999, 280, 28, 10_000, 5)).toEqual({ start: 9_994, end: 10_000 })
  })

  it('stays bounded for 10,000 rows whatever the scroll position', () => {
    for (const top of [0, 1234, 99_999, 280_000]) {
      const r = visibleRange(top, 600, 28, 10_000)
      expect(r.end - r.start).toBeLessThanOrEqual(Math.ceil(600 / 28) + 1 + 16)
    }
  })

  it('handles empty lists, zero heights and negative scroll', () => {
    expect(visibleRange(0, 300, 28, 0)).toEqual({ start: 0, end: 0 })
    expect(visibleRange(0, 300, 0, 10)).toEqual({ start: 0, end: 0 })
    expect(visibleRange(-50, -1, 28, 3, 0)).toEqual({ start: 0, end: 1 })
  })
})

describe('scrollToRow', () => {
  it('scrolls up, scrolls down, or stays', () => {
    expect(scrollToRow(2, 280, 280, 28)).toBe(56)
    expect(scrollToRow(20, 0, 280, 28)).toBe(21 * 28 - 280)
    expect(scrollToRow(5, 0, 280, 28)).toBe(0)
    expect(scrollToRow(9, 0, 280, 28, 28)).toBe(10 * 28 - 252)
  })
})
