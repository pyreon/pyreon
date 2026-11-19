import { add, toPlainDateTime } from '@pyreon/time/core'
import { describe, expect, it } from 'vitest'
import { nextOccurrence, occurrences, occurrencesBetween, occursOn, previousOccurrence, toInstants } from '../core'
import { stats } from '../expand'
import type { Recurrence } from '../types'

const iso = (t: number): string => new Date(t).toISOString().slice(0, 16)

describe('the common rules', () => {
  it('"every second Tuesday"', () => {
    const rule: Recurrence = { every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17' }

    expect(occurrencesBetween(rule, '2026-11-01', '2027-01-15')).toEqual(['2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29', '2027-01-12'])
  })

  it('"last Friday of the month"', () => {
    const rule: Recurrence = { every: 'month', on: { weekdays: [{ weekday: 5, nth: -1 }] }, start: '2026-01-01' }

    expect(occurrencesBetween(rule, '2026-01-01', '2026-06-30')).toEqual(['2026-01-30', '2026-02-27', '2026-03-27', '2026-04-24', '2026-05-29', '2026-06-26'])
  })

  it('"weekdays at 9:00"', () => {
    const rule: Recurrence = { every: 'day', on: { weekdays: [1, 2, 3, 4, 5] }, start: '2026-11-19T09:00' }

    expect(occurrencesBetween(rule, '2026-11-19', '2026-11-24')).toEqual(['2026-11-19T09:00', '2026-11-20T09:00', '2026-11-23T09:00', '2026-11-24T09:00'])
  })

  it('"the 1st and 15th", "the last day of the month"', () => {
    expect(occurrencesBetween({ every: 'month', on: { monthDays: [1, 15] }, start: '2026-01-01' }, '2026-02-01', '2026-03-15')).toEqual(['2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15'])
    expect(occurrencesBetween({ every: 'month', on: { monthDays: [-1] }, start: '2026-01-01' }, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('a date start gives dates, a date-time start gives date-times, with seconds kept', () => {
    expect([...occurrences({ every: 'day', start: '2026-11-18' }, { limit: 1 })]).toEqual(['2026-11-18'])
    expect([...occurrences({ every: 'day', start: '2026-11-18T09:00:30' }, { limit: 1 })]).toEqual(['2026-11-18T09:00:30'])
    expect([...occurrences({ every: 'day', start: '2026-11-18T09:00:30.250' }, { limit: 1 })]).toEqual(['2026-11-18T09:00:30.250'])
  })

  it('every N hours and minutes run on the wall clock, from the start, across days', () => {
    expect([...occurrences({ every: 'hour', interval: 5, start: '2026-11-18T22:00' }, { limit: 4 })]).toEqual(['2026-11-18T22:00', '2026-11-19T03:00', '2026-11-19T08:00', '2026-11-19T13:00'])
    expect([...occurrences({ every: 'minute', interval: 45, start: '2026-11-18T23:00' }, { limit: 3 })]).toEqual(['2026-11-18T23:00', '2026-11-18T23:45', '2026-11-19T00:30'])
  })

  it('also adds dates, except removes them, count and until bound the rule', () => {
    const rule: Recurrence = { every: 'week', start: '2026-11-02', count: 3, also: ['2026-11-04'], except: ['2026-11-09'] }

    expect([...occurrences(rule)]).toEqual(['2026-11-02', '2026-11-04', '2026-11-16'])
    expect([...occurrences({ every: 'day', start: '2026-11-02', until: '2026-11-04' })]).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
  })

  it('a date bound is the whole day: from is its start, to is its end, after skips it, before stops short of it', () => {
    const rule: Recurrence = { every: 'day', start: '2026-11-01T09:00' }

    expect(occurrencesBetween(rule, '2026-11-03', '2026-11-04')).toEqual(['2026-11-03T09:00', '2026-11-04T09:00'])
    expect(nextOccurrence(rule, '2026-11-03')).toBe('2026-11-04T09:00')
    expect(nextOccurrence(rule, '2026-11-03T09:00')).toBe('2026-11-04T09:00')
    expect(nextOccurrence(rule, '2026-11-03T08:59')).toBe('2026-11-03T09:00')
    expect(previousOccurrence(rule, '2026-11-03')).toBe('2026-11-02T09:00')
    expect(previousOccurrence(rule, '2026-11-03T09:01')).toBe('2026-11-03T09:00')
    expect(previousOccurrence(rule, '2026-11-01T09:00')).toBeNull()
  })
})

describe('the 31st is skipped in short months, not clamped (unlike add)', () => {
  const rule: Recurrence = { every: 'month', start: '2026-01-31' }

  it('monthly on the 31st skips February, April, June, September and November', () => {
    expect([...occurrences(rule, { limit: 8 })]).toEqual(['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31', '2026-10-31', '2026-12-31', '2027-01-31'])
  })

  it('add clamps to the last day of the month: the two are different on purpose', () => {
    expect(add('2026-01-31', { months: 1 })).toBe('2026-02-28')
    expect([...occurrences(rule, { limit: 2 })][1]).toBe('2026-03-31')
  })

  it('the 30th skips only February; the 29th skips February outside leap years', () => {
    expect(occurrencesBetween({ every: 'month', start: '2026-01-30' }, '2026-01-01', '2026-04-30')).toEqual(['2026-01-30', '2026-03-30', '2026-04-30'])
    expect(occurrencesBetween({ every: 'month', start: '2027-01-29' }, '2027-01-01', '2027-03-31')).toEqual(['2027-01-29', '2027-03-29'])
    expect(occurrencesBetween({ every: 'month', start: '2028-01-29' }, '2028-01-01', '2028-03-31')).toEqual(['2028-01-29', '2028-02-29', '2028-03-29'])
  })

  it('monthDays [-1] is the last day of every month, leap years included', () => {
    expect(occurrencesBetween({ every: 'month', on: { monthDays: [-1] }, start: '2027-12-01' }, '2028-01-01', '2028-03-31')).toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
  })

  it('a yearly rule on Feb 29 happens only in leap years (2100 is not one)', () => {
    expect(occurrencesBetween({ every: 'year', start: '2096-02-29' }, '2096-01-01', '2110-12-31')).toEqual(['2096-02-29', '2104-02-29', '2108-02-29'])
  })

  it('a rule that can never occur is an error that says why', () => {
    expect(() => occurrences({ every: 'year', start: '2026-02-01', on: { months: [2], monthDays: [30] } })).toThrow(/never occurs in month 2/)
  })
})

describe('count, except and also (RFC 5545: COUNT limits the rule; EXDATE removes from the result)', () => {
  it('an excepted date still uses up one of the count', () => {
    const rule: Recurrence = { every: 'day', start: '2026-11-01', count: 5, except: ['2026-11-03'] }

    expect([...occurrences(rule)]).toEqual(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05'])
  })

  it('an except entry that never occurs changes nothing, and also adds to the count-limited set', () => {
    const rule: Recurrence = { every: 'week', start: '2026-11-02', count: 2, except: ['2026-11-03', '2030-01-01'], also: ['2026-11-20'] }

    expect([...occurrences(rule)]).toEqual(['2026-11-02', '2026-11-09', '2026-11-20'])
  })

  it('also dates may fall between rule occurrences and are not duplicated', () => {
    const rule: Recurrence = { every: 'day', start: '2026-11-01', count: 3, also: ['2026-11-02', '2026-11-10'] }

    expect([...occurrences(rule)]).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-10'])
  })

  it('except removes an also date too', () => {
    expect([...occurrences({ every: 'day', start: '2026-11-01', count: 1, also: ['2026-11-10'], except: ['2026-11-10'] })]).toEqual(['2026-11-01'])
  })
})

describe('week-year rules', () => {
  it('week 53 exists only in some years: Monday of week 53 is 28 December 2020 and 2026', () => {
    const rule: Recurrence = { every: 'year', start: '2018-01-01', on: { weeks: [53], weekdays: [1] } }

    expect(occurrencesBetween(rule, '2018-01-01', '2027-12-31')).toEqual(['2020-12-28', '2026-12-28'])
  })

  it('week 1 of a year can start in December of the one before', () => {
    expect(occurrencesBetween({ every: 'year', start: '2018-01-01', on: { weeks: [1], weekdays: [1] } }, '2018-01-01', '2020-12-31')).toEqual(['2018-01-01', '2018-12-31', '2019-12-30'])
  })

  it('the last Monday of the year by week number (-1) is the Monday of its last week', () => {
    expect(occurrencesBetween({ every: 'year', start: '2024-01-01', on: { weeks: [-1], weekdays: [1] } }, '2024-01-01', '2026-12-31')).toEqual(['2024-12-23', '2025-12-22', '2026-12-28'])
  })
})

describe('DST: occurrences are wall-clock times; only the instant moves', () => {
  const daily = (zone: string, start: string): Recurrence => ({ every: 'day', start: start as never, timeZone: zone })

  it('daily 02:30 in Europe/Prague across the spring-forward day 2026-03-29', () => {
    const rule = daily('Europe/Prague', '2026-03-27T02:30')

    expect(occurrencesBetween(rule, '2026-03-27', '2026-03-31')).toEqual(['2026-03-27T02:30', '2026-03-28T02:30', '2026-03-29T02:30', '2026-03-30T02:30', '2026-03-31T02:30'])
    // 02:30 does not exist on the 29th (02:00 jumps to 03:00): 'compatible' moves it forward to 03:30 CEST, which is 01:30Z.
    expect([...toInstants(rule, { limit: 5 })].map(iso)).toEqual(['2026-03-27T01:30', '2026-03-28T01:30', '2026-03-29T01:30', '2026-03-30T00:30', '2026-03-31T00:30'])
    expect(() => [...toInstants(rule, { limit: 5 }, { disambiguation: 'reject' })]).toThrow(/\[Pyreon\]/)
  })

  it('daily 02:30 in Europe/Prague across the fall-back day 2026-10-25 (02:30 occurs twice: the first is taken)', () => {
    const rule = daily('Europe/Prague', '2026-10-24T02:30')

    expect([...toInstants(rule, { limit: 3 })].map(iso)).toEqual(['2026-10-24T00:30', '2026-10-25T00:30', '2026-10-26T01:30'])
    expect([...toInstants(rule, { limit: 3 }, { disambiguation: 'later' })].map(iso)[1]).toBe('2026-10-25T01:30')
  })

  it('daily in America/New_York: 02:30 does not exist on 2026-03-08, 01:30 occurs twice on 2026-11-01', () => {
    const spring = daily('America/New_York', '2026-03-07T02:30')

    expect([...toInstants(spring, { limit: 3 })].map(iso)).toEqual(['2026-03-07T07:30', '2026-03-08T07:30', '2026-03-09T06:30'])
    const fall = daily('America/New_York', '2026-10-31T01:30')

    expect([...toInstants(fall, { limit: 3 })].map(iso)).toEqual(['2026-10-31T05:30', '2026-11-01T05:30', '2026-11-02T06:30'])
    expect([...toInstants(fall, { limit: 2 }, { disambiguation: 'later' })].map(iso)[1]).toBe('2026-11-01T06:30')
  })

  it('a weekly rule keeps its wall time while its instant moves by an hour when DST changes', () => {
    const rule: Recurrence = { every: 'week', start: '2026-03-02T09:00', timeZone: 'America/New_York' }
    const walls = occurrencesBetween(rule, '2026-03-02', '2026-03-16')
    const instants = [...toInstants(rule, { limit: 3 })]

    expect(walls).toEqual(['2026-03-02T09:00', '2026-03-09T09:00', '2026-03-16T09:00'])
    expect(instants.map(iso)).toEqual(['2026-03-02T14:00', '2026-03-09T13:00', '2026-03-16T13:00'])
    expect(instants[1]! - instants[0]!).toBe(7 * 86_400_000 - 3_600_000)
  })

  it('anchoring the rule in UTC instead would drift: the same hour in UTC is 09:00, then 10:00 local after the change', () => {
    const utc: Recurrence = { every: 'week', start: '2026-03-02T14:00', timeZone: 'UTC' }

    expect([...toInstants(utc, { limit: 2 })].map((t) => toPlainDateTime(t, 'America/New_York'))).toEqual(['2026-03-02T09:00', '2026-03-09T10:00'])
  })

  it('toInstants takes wall or instant bounds and needs a zone', () => {
    const rule = daily('Europe/Prague', '2026-11-18T09:00')

    expect([...toInstants(rule, { from: '2026-11-19', to: '2026-11-20' })].map(iso)).toEqual(['2026-11-19T08:00', '2026-11-20T08:00'])
    expect([...toInstants(rule, { from: Date.UTC(2026, 10, 19, 8, 0), limit: 1 })].map(iso)).toEqual(['2026-11-19T08:00'])
    expect(() => toInstants({ every: 'day', start: '2026-11-18T09:00' })).toThrow(/timeZone/)
  })

  it('an hourly rule across the gap emits each instant once', () => {
    const rule: Recurrence = { every: 'hour', start: '2026-03-29T00:00', timeZone: 'Europe/Prague' }
    const list = [...toInstants(rule, { limit: 5 })]

    expect(new Set(list).size).toBe(list.length)
  })
})

describe('performance shape: expansion jumps, it does not step', () => {
  const measure = (fn: () => unknown): number => {
    stats.candidates = 0
    fn()

    return stats.candidates
  }

  it('nextOccurrence on rules that started ten years ago costs a handful of candidate days', () => {
    const rules: Recurrence[] = [
      { every: 'day', start: '2016-11-01T09:00' },
      { every: 'day', interval: 3, start: '2016-11-01' },
      { every: 'week', on: { weekdays: [2, 4] }, start: '2016-11-01' },
      { every: 'month', on: { weekdays: [{ weekday: 5, nth: -1 }] }, start: '2016-11-01' },
      { every: 'month', start: '2016-01-31' },
      { every: 'year', start: '2016-02-29' },
      { every: 'year', on: { weeks: [20], weekdays: [1] }, start: '2016-11-01' },
      { every: 'hour', interval: 5, start: '2016-11-01T00:00' },
      { every: 'minute', interval: 7, start: '2016-11-01T00:00', on: { hours: [9] } },
    ]

    for (const rule of rules) {
      const n = measure(() => nextOccurrence(rule, '2026-11-19T12:00'))

      expect(n, JSON.stringify(rule)).toBeLessThan(1500)
      expect(n).toBeGreaterThan(0)
    }
  })

  it('previousOccurrence is just as cheap, and the cost does not grow with the age of the rule', () => {
    const young = measure(() => previousOccurrence({ every: 'month', on: { monthDays: [15] }, start: '2026-01-01' }, '2026-11-19'))
    const old = measure(() => previousOccurrence({ every: 'month', on: { monthDays: [15] }, start: '1996-01-01' }, '2026-11-19'))

    expect(old).toBeLessThanOrEqual(young * 2 + 40)
  })

  it('a ten-year window of a daily rule is ten years of occurrences and nothing else', () => {
    const n = measure(() => occurrencesBetween({ every: 'day', start: '2016-11-01' }, '2016-11-01', '2026-10-31'))

    expect(n).toBeLessThan(3700)
  })

  it('a lazy generator evaluates only what is consumed', () => {
    const n = measure(() => [...occurrences({ every: 'day', start: '2016-11-01' }, { limit: 3 })])

    expect(n).toBeLessThan(10)
  })

  it('an hourly rule with day filters skips whole days, it does not visit every hour', () => {
    const n = measure(() => nextOccurrence({ every: 'hour', start: '2016-11-01T00:00', on: { months: [2] } }, '2026-11-19T00:00'))

    expect(n).toBeLessThan(400)
  })

  it('a rule with a count is counted from its start, so it enumerates up to the count and no further', () => {
    const n = measure(() => nextOccurrence({ every: 'day', start: '2016-11-01', count: 100 }, '2026-11-19'))

    expect(n).toBeLessThan(120)
  })

  it('an impossible sparse rule ends instead of looping for ever', () => {
    const t = performance.now()

    expect(nextOccurrence({ every: 'month', start: '2026-01-31', on: { weekdays: [{ weekday: 1, nth: 5 }], months: [2] } }, '2026-11-19')).not.toBe(undefined)
    expect(performance.now() - t).toBeLessThan(3000)
  })
})

describe('next, previous and occursOn', () => {
  const rule: Recurrence = { every: 'week', on: { weekdays: [2] }, start: '2026-11-03T09:00', until: '2027-01-01' }

  it('walks forward and back over the rule, stopping at both ends', () => {
    expect(nextOccurrence(rule, '2026-11-18T10:00')).toBe('2026-11-24T09:00')
    expect(previousOccurrence(rule, '2026-11-18T10:00')).toBe('2026-11-17T09:00')
    expect(nextOccurrence(rule, '2026-12-29T09:00')).toBeNull()
    expect(previousOccurrence(rule, '2026-11-03T09:00')).toBeNull()
    expect(previousOccurrence(rule, '2030-01-01')).toBe('2026-12-29T09:00')
  })

  it('an also date after until is still an occurrence', () => {
    const r: Recurrence = { every: 'day', start: '2026-11-01', until: '2026-11-02', also: ['2027-05-05'] }

    expect(nextOccurrence(r, '2026-11-10')).toBe('2027-05-05')
    expect(previousOccurrence(r, '2030-01-01')).toBe('2027-05-05')
  })

  it('occursOn answers for one date, for date and date-time rules', () => {
    expect(occursOn(rule, '2026-11-17')).toBe(true)
    expect(occursOn(rule, '2026-11-18')).toBe(false)
    expect(occursOn({ every: 'day', start: '2026-11-18T23:59' }, '2026-11-18')).toBe(true)
  })
})

describe('the limit, the safety cap and endless rules', () => {
  it('an endless rule is lazy; collecting it needs a bound', () => {
    expect([...occurrences({ every: 'day', start: '2026-11-18' }, { limit: 2 })]).toHaveLength(2)
    expect([...occurrences({ every: 'day', start: '2026-11-18' }, { to: '2026-11-20' })]).toHaveLength(3)
    expect([...occurrences({ every: 'day', start: '2026-11-18' }, { limit: 0 })]).toHaveLength(0)
  })

  it('collecting an endless rule without a bound stops with an error that says how to bound it', () => {
    expect(() => [...occurrences({ every: 'minute', start: '2026-11-18T00:00' })]).toThrow(/Pass \{ to \} or \{ limit \}/)
  })

  it('an hour or minute out of range names the range it expects', () => {
    expect(() => occurrences({ every: 'day', start: '2026-11-18T09:00', on: { hours: [24] } })).toThrow(/on.hours entries must be whole numbers from 0 to 23, got 24/)
    expect(() => occurrences({ every: 'day', start: '2026-11-18T09:00', on: { minutes: [60] } })).toThrow(/from 0 to 59/)
  })

  it('the rule is validated when occurrences is called, not at the first next()', () => {
    expect(() => occurrences({ every: 'week', interval: 0, start: '2026-11-18' })).toThrow(/interval must be a whole number/)
  })
})
