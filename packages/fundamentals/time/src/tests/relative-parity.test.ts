import { relativeDistance, toInstant } from '../core'
import type { PlainDate } from '../core'

/**
 * Ported from `@pyreon/format`'s `relative-calendar.test.ts` (`formatRelativeTo`): the same two moments must give the same
 * words. A date-only string is a calendar day in the zone; a string with `Z` is an instant. Words come from
 * `Intl.RelativeTimeFormat` with `numeric: 'auto'`, exactly as format makes them from a `{ value, unit }`.
 */
const auto = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

function rel(target: string, base: string, zone = 'UTC'): string {
  const baseInstant = base.endsWith('Z') ? Date.parse(base) : toInstant(base as PlainDate, zone)
  const t = target.endsWith('Z') ? Date.parse(target) : (target as PlainDate)
  const { value, unit } = relativeDistance(t, baseInstant, zone)

  return auto.format(value, unit)
}

describe('calendar days, not elapsed hours', () => {
  it('36 hours before 01:00 is two calendar days; 25 hours before 23:00 is literally yesterday', () => {
    expect(rel('2026-11-16T13:00:00Z', '2026-11-18T01:00:00Z')).toBe('2 days ago')
    expect(rel('2026-11-17T22:00:00Z', '2026-11-18T23:00:00Z')).toBe('yesterday')
  })

  it('around midnight: under a day is hours, from a day on is calendar days', () => {
    expect(rel('2026-11-17T23:30:00Z', '2026-11-18T00:30:00Z')).toBe('1 hour ago')
    expect(rel('2026-11-17T00:30:00Z', '2026-11-18T00:30:00Z')).toBe('yesterday')
    expect(rel('2026-11-17T00:00:00Z', '2026-11-18T23:59:00Z')).toBe('yesterday')
    expect(rel('2026-11-19T00:00:00Z', '2026-11-18T23:59:00Z')).toBe('in 1 minute')
    expect(rel('2026-11-19T23:59:00Z', '2026-11-18T00:00:00Z')).toBe('tomorrow')
  })

  it('the calendar of the zone', () => {
    const t = '2026-11-17T22:00:00Z'
    const b = '2026-11-19T02:00:00Z'

    expect(rel(t, b, 'UTC')).toBe('2 days ago')
    expect(rel(t, b, 'Asia/Tokyo')).toBe('yesterday')
    expect(rel(t, b, 'America/Los_Angeles')).toBe('yesterday')
  })

  it('DST days of 23 and 25 hours', () => {
    expect(rel('2026-03-28T12:00:00Z', '2026-03-29T12:00:00Z', 'Europe/Prague')).toBe('yesterday')
    expect(rel('2026-03-29T22:30:00Z', '2026-03-30T22:30:00Z', 'Europe/Prague')).toBe('yesterday')
    expect(rel('2026-10-24T23:30:00Z', '2026-10-25T23:30:00Z', 'Europe/Prague')).toBe('yesterday')
    expect(rel('2026-10-24T22:30:00Z', '2026-10-25T22:30:00Z', 'Europe/Prague')).toBe('today')
    expect(rel('2026-10-25T00:30:00Z', '2026-10-26T00:30:00Z', 'Europe/Prague')).toBe('yesterday')
  })

  it('calendar strings are calendar days in every zone', () => {
    for (const zone of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
      expect(rel('2026-11-17', '2026-11-18', zone)).toBe('yesterday')
      expect(rel('2026-11-19', '2026-11-18', zone)).toBe('tomorrow')
      expect(rel('2026-11-11', '2026-11-18', zone)).toBe('last week')
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

  it('months are calendar months', () => {
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

  it('years are calendar years', () => {
    expect(rel('2025-11-18', '2026-11-18')).toBe('last year')
    expect(rel('2025-01-02', '2026-12-30')).toBe('last year')
    expect(rel('2025-12-15', '2026-12-20')).toBe('last year')
    expect(rel('2027-11-18', '2026-11-18')).toBe('next year')
    expect(rel('2029-01-26', '2026-11-18')).toBe('in 3 years')
    expect(rel('2025-12-31', '2026-01-01')).toBe('yesterday')
    expect(rel('2025-12-01', '2026-01-15')).toBe('last month')
  })

  it('a leap day, and the seconds/minutes/hours truncation toward zero', () => {
    expect(rel('2028-02-29', '2028-03-01')).toBe('yesterday')
    expect(rel('2028-02-29', '2029-03-01')).toBe('last year')
    expect(relativeDistance(Date.UTC(2026, 10, 18, 11, 0, 20), Date.UTC(2026, 10, 18, 12), 'UTC')).toEqual({ value: -59, unit: 'minute' })
    expect(relativeDistance(Date.UTC(2026, 10, 18, 12, 0, 0, 500), Date.UTC(2026, 10, 18, 12), 'UTC')).toEqual({ value: 0, unit: 'second' })
    expect(relativeDistance(Date.UTC(2026, 10, 18, 12, 0, 30), Date.UTC(2026, 10, 18, 12), 'UTC')).toEqual({ value: 30, unit: 'second' })
  })
})

describe('a date-only target is a day: compared as a calendar day, never as hours', () => {
  it('today, tomorrow and yesterday are the display zone\'s calendar, whatever the hour', () => {
    expect(rel('2026-11-18', '2026-11-18T01:00:00Z', 'Asia/Tokyo')).toBe('today') // 10:00 on the 18th in Tokyo
    expect(rel('2026-11-18', '2026-11-18T23:59:00Z', 'UTC')).toBe('today')
    expect(rel('2026-11-19', '2026-11-18T09:59:00Z', 'Pacific/Kiritimati')).toBe('tomorrow') // 23:59 on the 18th there
    expect(rel('2026-11-19', '2026-11-18T01:00:00Z', 'UTC')).toBe('tomorrow') // 23 hours away, still tomorrow
    expect(rel('2026-11-17', '2026-11-18T00:30:00Z', 'UTC')).toBe('yesterday')
    expect(rel('2026-11-20', '2026-11-18T12:00:00Z', 'UTC')).toBe('in 2 days')
  })

  it('a PlainDateTime is a moment: under a day it is still elapsed hours', () => {
    expect(rel('2026-11-18T00:00', '2026-11-18T10:00:00Z', 'UTC')).toBe('10 hours ago')
  })
})
