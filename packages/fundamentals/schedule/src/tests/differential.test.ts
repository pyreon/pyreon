/**
 * Differential tests against `rrule` (the npm library, a devDependency of the tests only) and a second, brute-force oracle.
 *
 * Wall-clock expansion is compared in floating time (rrule reads `Date`s as UTC wall times). The oracles' disagreements are not
 * hidden: each class is skipped here only where it is a documented divergence (D1..D7 below), and each divergence has its own
 * test that pins rrule's behaviour and shows ours against the RFC text.
 */
import { RRule } from 'rrule'
import { describe, expect, it } from 'vitest'
import { occurrences, occurrencesBetween } from '../core'
import { brute } from './brute'
import { makeCase, toDate, wallOf } from './diff-gen'
import { makeWideCase } from './wide-gen'
import type { Recurrence } from '../types'

const run = (c: ReturnType<typeof makeCase>): { ours: string[]; theirs: string[] } => {
  const ours = occurrencesBetween(c.rule, c.rule.start, c.windowEnd as never) as string[]
  const timed = c.rule.start.length > 10
  const rr = new RRule({ ...c.options, ...(c.count === undefined ? {} : { count: c.count }), until: toDate(c.windowEnd) } as never)
  const theirs = rr.between(toDate(c.rule.start), toDate(c.windowEnd), true).map((d) => wallOf(d, timed))

  return { ours, theirs: [...new Set(theirs)].sort() }
}

/** Why a random case is not compared with rrule (each reason is a documented divergence), or undefined when it is. */
function skipReason(c: ReturnType<typeof makeCase>, found: number): string | undefined {
  const weekStart = (c.rule.weekStart ?? 1) % 7

  if (c.mixedDays) return 'D2 mixed plain and n-th BYDAY'
  if (found === 0) return 'empty window (rrule would scan to year 9999: D8)'
  if (c.rule.every === 'week' && c.rule.on?.position !== undefined && toDate(c.rule.start).getUTCDay() !== weekStart) return 'D4 position in the first, partial week'
  if (c.rule.every === 'year' && c.rule.on?.weeks !== undefined) return 'D5 week-year days outside the calendar year'
  if (c.rule.every === 'minute' && c.rule.on?.hours !== undefined) return 'D6 minutely grid after an hour filter'

  return undefined
}

describe('differential: ours against rrule', () => {
  it('agrees on thousands of seeded random rules and windows, except the documented divergences', () => {
    const skipped: Record<string, number> = {}
    let compared = 0
    let nonEmpty = 0

    for (let seed = 1; seed <= 2500; seed++) {
      const c = makeCase(seed)
      const ours = occurrencesBetween(c.rule, c.rule.start, c.windowEnd as never) as string[]
      const why = skipReason(c, ours.length)

      if (why !== undefined) {
        skipped[why] = (skipped[why] ?? 0) + 1
        continue
      }
      const { theirs } = run(c)

      expect(ours, `seed ${seed}: ${JSON.stringify(c.rule)}`).toEqual(theirs)
      compared++
      if (ours.length > 0) nonEmpty++
    }
    expect(compared).toBeGreaterThan(2000)
    expect(nonEmpty).toBe(compared)
    expect(Object.values(skipped).reduce((a, b) => a + b, 0)).toBeLessThan(700)
  })
})

describe('differential: ours against the brute-force oracle (every part, every position, mixed BYDAY, weeks, count, until, except, also)', () => {
  it('agrees on 3000 seeded wide rules', () => {
    let nonEmpty = 0

    for (let seed = 1; seed <= 3000; seed++) {
      const c = makeWideCase(seed)
      const ours = occurrencesBetween(c.rule, c.rule.start, c.windowEnd as never) as string[]

      expect(ours, `seed ${seed}: ${JSON.stringify(c.rule)}`).toEqual(brute(c.rule, c.windowEnd))
      if (ours.length > 0) nonEmpty++
    }
    expect(nonEmpty).toBeGreaterThan(1800)
  })
})

describe('intended divergences from rrule 2.8.1, each justified against the RFC text', () => {
  const rr = (options: object, from: string, to: string): string[] => new RRule(options as never).between(toDate(from), toDate(to), true).map((d) => wallOf(d, true))

  it('D1: ours is chronological when BYHOUR or BYMINUTE are not sorted; rrule emits them in list order', () => {
    // RFC 5545 3.3.10: occurrences are a recurrence SET, generated in order; 3.8.5.3 lists every example in time order.
    const rule: Recurrence = { every: 'day', start: '2026-11-18T06:30', on: { hours: [11, 22, 4] }, count: 3 }

    expect([...occurrences(rule)]).toEqual(['2026-11-18T11:30', '2026-11-18T22:30', '2026-11-19T04:30'])
    const theirs = new RRule({ freq: RRule.DAILY, dtstart: toDate('2026-11-18T06:30'), byhour: [11, 22, 4], count: 3 }).all().map((d) => wallOf(d, true))

    expect(theirs).toEqual(['2026-11-18T11:30', '2026-11-18T22:30', '2026-11-19T11:30'])
  })

  it('D2: a BYDAY list mixing plain and n-th weekdays is their union; rrule returns nothing', () => {
    // RFC 5545: BYDAY is a list; each entry stands for its own days ("1SU,-1SU" in the monthly examples), so the set is the union.
    const rule: Recurrence = { every: 'month', start: '2026-11-01', on: { weekdays: [6, { weekday: 5, nth: -1 }] } }
    const ours = occurrencesBetween(rule, '2026-11-01', '2026-11-30')

    expect(ours).toEqual(['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-27', '2026-11-28'])
    expect(brute(rule, '2026-11-30')).toEqual(ours)
    expect(rr({ freq: RRule.MONTHLY, dtstart: toDate('2026-11-01'), byweekday: [RRule.SA, RRule.FR.nth(-1)], count: 5 }, '2026-11-01', '2026-11-30')).toEqual([])
  })

  it('D3: a BYSETPOS position beyond the period is ignored (RFC: no such instance); rrule clamps a negative one and repeats the instance', () => {
    const rule: Recurrence = { every: 'month', start: '2026-11-04', on: { position: [-3, 1] }, count: 2 }

    expect(occurrencesBetween(rule, '2026-11-04', '2027-12-31')).toEqual(['2026-11-04', '2026-12-04'])
    const theirs = rr({ freq: RRule.MONTHLY, dtstart: toDate('2026-11-04'), bysetpos: [-3, 1], count: 2 }, '2026-11-04', '2027-12-31')

    expect(theirs).toEqual(['2026-11-04T00:00', '2026-11-04T00:00'])
  })

  it('D4: BYSETPOS counts positions in the whole week, also the first one; rrule counts only from DTSTART in the first week', () => {
    // Weeks start on Wednesday; DTSTART is Sunday 2021-08-08, so the first week is Wed 4 to Tue 10 August. Saturday 7 is position 1
    // of {Sat 7, Mon 9}; it is before DTSTART, so that week gives nothing. rrule drops Saturday first and promotes Monday 9.
    const rule: Recurrence = { every: 'week', start: '2021-08-08', weekStart: 3, on: { weekdays: [1, 6], position: [1] }, count: 3 }

    expect(occurrencesBetween(rule, '2021-08-08', '2021-09-30')).toEqual(['2021-08-14', '2021-08-21', '2021-08-28'])
    expect(brute(rule, '2021-09-30')).toEqual(['2021-08-14', '2021-08-21', '2021-08-28'])
    expect(rr({ freq: RRule.WEEKLY, wkst: RRule.WE, dtstart: toDate('2021-08-08'), byweekday: [RRule.MO, RRule.SA], bysetpos: [1], count: 3 }, '2021-08-08', '2021-09-30')[0]).toBe('2021-08-09T00:00')
  })

  it('D5: BYWEEKNO takes the days of week N of the week-year, also the ones in December or January of the next calendar year', () => {
    // WKST=SA: week 1 of 2026 starts Saturday 3 January 2026, so 27 December 2025 to 2 January 2026 is week 52 of 2025.
    const rule: Recurrence = { every: 'year', start: '2025-01-01', weekStart: 6, on: { weeks: [52], weekdays: [4, 5] }, count: 4 }
    const ours = occurrencesBetween(rule, '2025-01-01', '2027-12-31')

    expect(ours).toContain('2026-01-01')
    expect(ours).toEqual(brute(rule, '2027-12-31'))
    expect(rr({ freq: RRule.YEARLY, wkst: RRule.SA, dtstart: toDate('2025-01-01'), byweekno: [52], byweekday: [RRule.TH, RRule.FR], count: 4 }, '2025-01-01', '2027-12-31')).not.toContain('2026-01-01T00:00')
  })

  it('D6: an hourly or minutely rule stays on its grid after the days and hours it skips; rrule drifts off the grid', () => {
    // Every 7 minutes from 1997-07-06T20:30, only in hours 11 and 12. 2310 minutes separate the start from 1997-07-08T11:00,
    // and 2310 = 330 x 7, so 11:00 is a grid point and 11:04 is not.
    const rule: Recurrence = { every: 'minute', interval: 7, start: '1997-07-06T20:30', on: { hours: [11, 12] } }
    const ours = occurrencesBetween(rule, '1997-07-08T00:00', '1997-07-08T23:59') as string[]

    expect(ours[0]).toBe('1997-07-08T11:00')
    for (const o of ours) expect(((Date.parse(`${o}:00Z`) - Date.parse('1997-07-06T20:30:00Z')) / 60_000) % 7).toBe(0)
    const theirs = rr({ freq: RRule.MINUTELY, interval: 7, dtstart: toDate('1997-07-06T20:30'), byhour: [11, 12] }, '1997-07-08T00:00', '1997-07-08T23:59')

    expect(theirs[0]).toBe('1997-07-08T11:04')
  })

  it('D7: a date UNTIL on a date-time rule means the whole day; rrule reads it as midnight and drops that day', () => {
    // RFC 5545 requires UNTIL to be the same type as DTSTART; with a date UNTIL "the last day" is the natural reading.
    const rule: Recurrence = { every: 'day', start: '2026-11-18T09:00', until: '2026-11-20' }

    expect([...occurrences(rule)]).toEqual(['2026-11-18T09:00', '2026-11-19T09:00', '2026-11-20T09:00'])
    expect(new RRule({ freq: RRule.DAILY, dtstart: toDate('2026-11-18T09:00'), until: toDate('2026-11-20') }).all().map((d) => wallOf(d, true))).toEqual(['2026-11-18T09:00', '2026-11-19T09:00'])
  })

  it('D8: rules that find nothing end quickly (ours) where rrule scans to the year 9999', () => {
    // Every 3 minutes can never reach minute 13 or 8 (3k mod 60 is a multiple of 3). Ours reports an empty rule in milliseconds.
    const rule: Recurrence = { every: 'minute', interval: 3, start: '2022-03-03T21:45', on: { minutes: [13, 8] } }
    const t = performance.now()

    expect([...occurrences(rule, { limit: 5 })]).toEqual([])
    expect(performance.now() - t).toBeLessThan(2000)
  })

  it('D9: an n-th weekday on a daily, weekly, hourly or minutely rule is an error here (RFC 3.3.10: only monthly and yearly)', () => {
    expect(() => occurrences({ every: 'week', start: '2026-11-18', on: { weekdays: [{ weekday: 5, nth: -1 }] } })).toThrow(/only makes sense for monthly and yearly/)
  })
})
