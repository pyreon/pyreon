import { describe, expect, it } from 'vitest'
import { funnelItem, percentSeats, pieItem } from './host-item'

describe('percentSeats — ECharts\' pie percent', () => {
  it('allocates by largest remainder, so the shares sum to exactly 100', () => {
    expect(percentSeats([1, 1, 1], 2)).toEqual([33.34, 33.33, 33.33])
    expect(percentSeats([1, 2], 2)).toEqual([33.33, 66.67])
    const s = percentSeats([3, 7, 11, 13], 1)
    expect(Math.round(s.reduce((a, b) => a + b, 0) * 10)).toBe(1000)
  })
  it('an all-zero or empty list has no shares; NaN counts as zero', () => {
    expect(percentSeats([0, 0], 2)).toEqual([])
    expect(percentSeats([], 2)).toEqual([])
    expect(percentSeats([Number.NaN, 1], 0)).toEqual([0, 100])
  })
})

describe('slice items', () => {
  const slices = [{ value: 1, label: 'a', color: '#111' }, { value: 3, label: 'b', color: '#222' }]
  it('a pie slice carries its share; a miss is null', () => {
    expect(pieItem(slices, 1)).toEqual({ seriesIndex: 0, dataIndex: 1, name: 'b', value: 3, color: '#222', percent: 75 })
    expect(pieItem(slices, -1)).toBeNull()
  })
  it('a funnel stage\'s share is its value over the sum, to two places; a zero sum is 0', () => {
    expect(funnelItem([{ value: 1, label: 'x', color: '#1' }, { value: 2, label: 'y', color: '#2' }], 0)!.percent).toBe(33.33)
    expect(funnelItem([{ value: 0, label: 'x', color: '#1' }], 0)!.percent).toBe(0)
    expect(funnelItem(slices, 5)).toBeNull()
  })
})
