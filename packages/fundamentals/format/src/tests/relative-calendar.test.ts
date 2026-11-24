/**
 * Relative time is counted by the calendar from one day on, in the zone of the value: "yesterday",
 * "tomorrow" and "last month" are always literally true.
 */
import { formatRelativeTo, relativeFormatter } from '../core'

const en = { locale: 'en-US' } as const
const auto = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
const rel = (a: string, b: string, timeZone = 'UTC') => formatRelativeTo(a, b, { ...en, timeZone })

describe('calendar days, not elapsed hours', () => {
  it('36 hours before 01:00 is the day BEFORE yesterday', () => {
    // 2026-11-18T01:00Z minus 36 h is 2026-11-16T13:00Z: two calendar days.
    expect(rel('2026-11-16T13:00:00Z', '2026-11-18T01:00:00Z')).toBe('2 days ago')
  })

  it('25 hours before 23:00 is literally yesterday', () => {
    expect(rel('2026-11-17T22:00:00Z', '2026-11-18T23:00:00Z')).toBe('yesterday')
  })

  it('around midnight: under a day is hours, from a day on is calendar days', () => {
    expect(rel('2026-11-17T23:30:00Z', '2026-11-18T00:30:00Z')).toBe('1 hour ago')
    expect(rel('2026-11-17T00:30:00Z', '2026-11-18T00:30:00Z')).toBe('yesterday')
    expect(rel('2026-11-17T00:00:00Z', '2026-11-18T23:59:00Z')).toBe('yesterday')
    expect(rel('2026-11-19T00:00:00Z', '2026-11-18T23:59:00Z')).toBe('in 1 minute')
    expect(rel('2026-11-19T23:59:00Z', '2026-11-18T00:00:00Z')).toBe('tomorrow')
  })

  it('uses the calendar of the zone: the same two instants are different calendar days in different zones', () => {
    // 22:00Z on the 17th and 02:00Z on the 19th: two days in UTC; in Tokyo (+9) 07:00 on the 18th and 11:00 on the 19th.
    const t = '2026-11-17T22:00:00Z'
    const b = '2026-11-19T02:00:00Z'
    expect(rel(t, b, 'UTC')).toBe('2 days ago')
    expect(rel(t, b, 'Asia/Tokyo')).toBe('yesterday')
    expect(rel(t, b, 'America/Los_Angeles')).toBe('yesterday')
  })

  it('DST days of 23 and 25 hours', () => {
    // Europe/Prague: clocks go forward 2026-03-29 (a 23-hour day) and back 2026-10-25 (a 25-hour day).
    expect(rel('2026-03-28T12:00:00Z', '2026-03-29T12:00:00Z', 'Europe/Prague')).toBe('yesterday')
    expect(rel('2026-03-29T22:30:00Z', '2026-03-30T22:30:00Z', 'Europe/Prague')).toBe('yesterday')
    expect(rel('2026-10-24T23:30:00Z', '2026-10-25T23:30:00Z', 'Europe/Prague')).toBe('yesterday')
    // 24 elapsed hours across the 25-hour day can be the same calendar day: literally today
    expect(rel('2026-10-24T22:30:00Z', '2026-10-25T22:30:00Z', 'Europe/Prague')).toBe('today')
    expect(rel('2026-10-25T00:30:00Z', '2026-10-26T00:30:00Z', 'Europe/Prague')).toBe('yesterday')
  })

  it('calendar strings are calendar days in every zone', () => {
    for (const timeZone of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
      expect(rel('2026-11-17', '2026-11-18', timeZone)).toBe('yesterday')
      expect(rel('2026-11-19', '2026-11-18', timeZone)).toBe('tomorrow')
      expect(rel('2026-11-11', '2026-11-18', timeZone)).toBe('last week')
    }
  })
})

describe('thresholds', () => {
  it('days under 7, then weeks while the month differs by less than one or under 30 days', () => {
    expect(rel('2026-11-12', '2026-11-18')).toBe('6 days ago')
    expect(rel('2026-11-11', '2026-11-18')).toBe('last week')
    expect(rel('2026-11-25', '2026-11-18')).toBe('next week')
    expect(rel('2026-10-28', '2026-11-18')).toBe('3 weeks ago')
    expect(rel('2026-10-22', '2026-11-18')).toBe('3 weeks ago')
    expect(rel('2026-10-20', '2026-11-18')).toBe('4 weeks ago')
  })

  it('months are calendar months: last month is the previous calendar month', () => {
    expect(rel('2026-10-05', '2026-11-18')).toBe('last month')
    expect(rel('2026-10-01', '2026-11-30')).toBe('last month')
    expect(rel('2026-12-20', '2026-11-18')).toBe('next month')
    expect(rel('2026-09-30', '2026-11-01')).toBe('2 months ago')
    expect(rel('2026-08-20', '2026-11-18')).toBe('3 months ago')
  })

  it('month ends', () => {
    expect(rel('2026-01-31', '2026-03-01')).toBe('4 weeks ago')
    expect(rel('2026-01-30', '2026-03-01')).toBe('2 months ago')
    expect(rel('2026-02-28', '2026-03-31')).toBe('last month')
    expect(rel('2026-03-31', '2026-04-30')).toBe('last month')
    expect(rel('2026-11-30', '2026-12-01')).toBe('yesterday')
  })

  it('years are calendar years: last year is the previous calendar year', () => {
    expect(rel('2025-11-18', '2026-11-18')).toBe('last year')
    expect(rel('2025-01-02', '2026-12-30')).toBe('last year')
    expect(rel('2025-12-15', '2026-12-20')).toBe('last year')
    expect(rel('2027-11-18', '2026-11-18')).toBe('next year')
    expect(rel('2029-01-26', '2026-11-18')).toBe('in 3 years')
    expect(rel('2025-12-31', '2026-01-01')).toBe('yesterday')
    expect(rel('2025-12-01', '2026-01-15')).toBe('last month')
  })

  it('a leap day', () => {
    expect(rel('2028-02-29', '2028-03-01')).toBe('yesterday')
    expect(rel('2028-02-29', '2029-03-01')).toBe('last year')
  })

  it('matches Intl for the unit it picks', () => {
    expect(rel('2026-10-05', '2026-11-18')).toBe(auto.format(-1, 'month'))
    expect(rel('2023-05-05', '2026-11-18')).toBe(auto.format(-3, 'year'))
  })
})

describe('relativeFormatter uses the same rule, in its own zone', () => {
  it('timeZone option', () => {
    const f = relativeFormatter({ ...en, base: '2026-11-19T02:00:00Z', timeZone: 'Asia/Tokyo' })
    expect(f('2026-11-17T22:00:00Z')).toBe('yesterday')
    expect(f.with({ timeZone: 'UTC' })('2026-11-17T22:00:00Z')).toBe('2 days ago')
  })
})
