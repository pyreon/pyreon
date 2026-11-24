import { describe, expect, it } from 'vitest'
import { describeRule } from '../core'

describe('describeRule', () => {
  it('describes the common rules in English', () => {
    expect(describeRule({ every: 'day', start: '2026-11-18' })).toBe('Every day')
    expect(describeRule({ every: 'day', interval: 3, start: '2026-11-18' })).toBe('Every 3 days')
    expect(describeRule({ every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17' })).toBe('Every 2 weeks on Tuesday')
    expect(describeRule({ every: 'week', on: { weekdays: [1, 3, 5] }, start: '2026-11-16' })).toBe('Every week on Monday, Wednesday and Friday')
    expect(describeRule({ every: 'day', on: { weekdays: [1, 2, 3, 4, 5] }, start: '2026-11-16T09:00' })).toBe('Every day on Monday, Tuesday, Wednesday, Thursday and Friday at 09:00')
    expect(describeRule({ every: 'month', on: { weekdays: [{ weekday: 5, nth: -1 }] }, start: '2026-11-27T09:00' })).toBe('Every month on the last Friday at 09:00')
    expect(describeRule({ every: 'month', on: { weekdays: [{ weekday: 1, nth: 1 }, { weekday: 3, nth: 3 }] }, start: '2026-11-02' })).toBe('Every month on the first Monday and the third Wednesday')
    expect(describeRule({ every: 'month', on: { monthDays: [1, 15] }, start: '2026-11-01' })).toBe('Every month on day 1 and 15')
    expect(describeRule({ every: 'month', on: { monthDays: [-1] }, start: '2026-11-30' })).toBe('Every month on day last')
    expect(describeRule({ every: 'year', start: '2026-11-18' })).toBe('Every year in November on day 18')
    expect(describeRule({ every: 'hour', interval: 2, start: '2026-11-18T08:00' })).toBe('Every 2 hours')
    expect(describeRule({ every: 'minute', start: '2026-11-18T08:00' })).toBe('Every minute')
  })

  it('adds the end: until a date, or a number of times', () => {
    expect(describeRule({ every: 'week', start: '2026-11-17', until: '2026-12-31' }, { locale: 'en-US' })).toBe('Every week on Tuesday, until December 31, 2026')
    expect(describeRule({ every: 'day', start: '2026-11-18', count: 10 })).toBe('Every day, 10 times')
  })

  it('weekday and month names follow the locale; the sentence frame follows messages', () => {
    expect(describeRule({ every: 'week', start: '2026-11-17' }, { locale: 'de' })).toBe('Every week on Dienstag')
    expect(describeRule({ every: 'year', start: '2026-11-18' }, { locale: 'cs' })).toContain('listopad')
    const cs = { everyWeek: 'každý týden', onWeekdays: 'v {list}', custom: 'Vlastní plán' }

    expect(describeRule({ every: 'week', start: '2026-11-17' }, { locale: 'cs', messages: cs })).toBe('Každý týden v úterý')
    expect(describeRule({ every: 'year', start: '2026-11-18', on: { weeks: [3] } }, { messages: cs })).toBe('Vlastní plán')
  })

  it('rules with no natural sentence say "Custom schedule" instead of nonsense', () => {
    expect(describeRule({ every: 'month', on: { weekdays: [1, 2, 3, 4, 5], position: [-1] }, start: '2026-11-30' })).toBe('Custom schedule')
    expect(describeRule({ every: 'year', on: { weeks: [20], weekdays: [1] }, start: '2026-05-11' })).toBe('Custom schedule')
    expect(describeRule({ every: 'year', on: { yearDays: [100] }, start: '2026-04-10' })).toBe('Custom schedule')
    expect(describeRule({ every: 'month', on: { monthDays: [13], weekdays: [5] }, start: '2026-11-13' })).toBe('Custom schedule')
    expect(describeRule({ every: 'hour', on: { minutes: [0, 30] }, start: '2026-11-18T08:00' })).toBe('Custom schedule')
  })

  it('validates the rule first', () => {
    expect(() => describeRule({ every: 'week', interval: 0, start: '2026-11-17' })).toThrow(/\[Pyreon\] describeRule: interval/)
  })
})
