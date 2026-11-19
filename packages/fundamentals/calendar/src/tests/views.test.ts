import { describe, expect, it } from 'vitest'
import { navigate, plainTitle, viewTitle, visibleRange } from '../core'

describe('visibleRange', () => {
  it('a month includes the leading and trailing days of its grid', () => {
    const v = visibleRange('month', '2026-11-18')
    expect(v.range).toEqual({ start: '2026-10-26', end: '2026-12-07' })
    expect(v.rows).toHaveLength(6)
    expect(v.rows.every((r) => r.length === 7)).toBe(true)
  })

  it('a month starts on any weekStart and has the weeks that it needs', () => {
    for (const weekStart of [1, 2, 3, 4, 5, 6, 7] as const) {
      const v = visibleRange('month', '2026-02-10', { weekStart })
      expect(v.dates[0]).toBeDefined()
      expect(new Date(`${v.range.start}T00:00:00Z`).getUTCDay() === weekStart % 7).toBe(true)
      expect(v.dates.length % 7).toBe(0)
    }
    expect(visibleRange('month', '2026-02-10', { weekStart: 7 }).rows).toHaveLength(4)
  })

  it('a week starts on weekStart, workWeek hides the weekend, hiddenDays removes columns and rows follow', () => {
    expect(visibleRange('week', '2026-11-18').range).toEqual({ start: '2026-11-16', end: '2026-11-23' })
    expect(visibleRange('week', '2026-11-18', { weekStart: 7 }).range.start).toBe('2026-11-15')
    expect(visibleRange('workWeek', '2026-11-18').dates).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'])
    expect(visibleRange('week', '2026-11-18', { hiddenDays: [3, 5] }).dates).toHaveLength(5)
    const month = visibleRange('month', '2026-11-18', { hiddenDays: [6, 7] })
    expect(month.rows.every((r) => r.length === 5)).toBe(true)
    expect(month.range.start).toBe('2026-10-26')
  })

  it('a week at the edges of a year and a day, days(n) and an agenda', () => {
    expect(visibleRange('week', '2027-01-01').range).toEqual({ start: '2026-12-28', end: '2027-01-04' })
    expect(visibleRange('day', '2026-11-18').range).toEqual({ start: '2026-11-18', end: '2026-11-19' })
    expect(visibleRange('days', '2026-11-18', { days: 4 }).dates).toHaveLength(4)
    expect(visibleRange('agenda', '2026-11-18').range.end).toBe('2026-12-18')
  })

  it('a year is a whole calendar year, 366 days in a leap year', () => {
    expect(visibleRange('year', '2028-06-15').dates).toHaveLength(366)
    expect(visibleRange('year', '2027-06-15').range).toEqual({ start: '2027-01-01', end: '2028-01-01' })
  })

  it('rejects a count that is not a whole number', () => {
    expect(() => visibleRange('days', '2026-11-18', { days: 0 })).toThrow('[Pyreon] calendar: days must be a whole number')
  })
})

describe('navigate', () => {
  it('moves by the unit of the view, forward and back', () => {
    expect(navigate('month', '2026-01-31', 1)).toBe('2026-02-28')
    expect(navigate('month', '2026-03-15', -1)).toBe('2026-02-15')
    expect(navigate('week', '2026-11-18', 1)).toBe('2026-11-25')
    expect(navigate('workWeek', '2026-11-18', -1)).toBe('2026-11-11')
    expect(navigate('day', '2026-12-31', 1)).toBe('2027-01-01')
    expect(navigate('days', '2026-11-18', 2, { days: 3 })).toBe('2026-11-24')
    expect(navigate('agenda', '2026-11-18', 1)).toBe('2026-12-18')
    expect(navigate('year', '2028-02-29', 1)).toBe('2029-02-28')
  })
})

describe('viewTitle', () => {
  it('uses a formatter when given one, and a locale-free fallback otherwise', () => {
    const shown = visibleRange('week', '2026-11-18')
    expect(viewTitle(shown)).toBe('2026-11-16 to 2026-11-22')
    expect(viewTitle(shown, (i) => `${i.view}:${i.first}:${i.last}`)).toBe('week:2026-11-16:2026-11-22')
    expect(viewTitle(visibleRange('month', '2026-11-18'))).toBe('2026-11')
    expect(viewTitle(visibleRange('day', '2026-11-18'))).toBe('2026-11-18')
    expect(plainTitle({ view: 'year', date: '2026-11-18', first: '2026-01-01', last: '2026-12-31' })).toBe('2026')
  })
})
