import { describe, expect, it } from 'vitest'
import { occurrences, parseRRule, toRRule, tryParseRRule } from '../core'

describe('parseRRule', () => {
  it('reads a bare rule with options.start', () => {
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU', { start: '2026-11-17' })).toEqual({ every: 'week', start: '2026-11-17', interval: 2, on: { weekdays: [2] } })
  })

  it('reads RRULE: and a full block with DTSTART, EXDATE and RDATE', () => {
    const text = 'DTSTART;TZID=Europe/Prague:20261118T090000\nRRULE:FREQ=DAILY;COUNT=5\nEXDATE;TZID=Europe/Prague:20261120T090000,20261121T090000\nRDATE;TZID=Europe/Prague:20261201T100000'

    expect(parseRRule(text)).toEqual({ every: 'day', start: '2026-11-18T09:00', count: 5, timeZone: 'Europe/Prague', except: ['2026-11-20T09:00', '2026-11-21T09:00'], also: ['2026-12-01T10:00'] })
  })

  it('reads DATE values, UTC values, lower case, folded lines and CRLF', () => {
    expect(parseRRule('DTSTART;VALUE=DATE:20261118\r\nRRULE:FREQ=MONTHLY;BYMONTHDAY=-1').start).toBe('2026-11-18')
    expect(parseRRule('DTSTART:20261118T090000Z\nRRULE:FREQ=DAILY')).toMatchObject({ start: '2026-11-18T09:00', timeZone: 'UTC' })
    expect(parseRRule('freq=weekly;byday=mo,fr', { start: '2026-11-16' }).on?.weekdays).toEqual([1, 5])
    expect(parseRRule('DTSTART:20261118T090000\nRRULE:FREQ=DAILY;\n COUNT=3').count).toBe(3)
  })

  it('reads every BY part and the n-th weekdays', () => {
    const rule = parseRRule('FREQ=YEARLY;BYMONTH=1,2;BYWEEKNO=20;BYYEARDAY=1,-1;BYMONTHDAY=1,-1;BYDAY=1MO,-1FR,TU;BYHOUR=9;BYMINUTE=0,30;BYSETPOS=-1;WKST=SU', { start: '2026-01-01T09:00' })

    expect(rule.on).toEqual({ months: [1, 2], weeks: [20], yearDays: [1, -1], monthDays: [1, -1], weekdays: [{ weekday: 1, nth: 1 }, { weekday: 5, nth: -1 }, 2], hours: [9], minutes: [0, 30], position: [-1] })
    expect(rule.weekStart).toBe(7)
  })

  it('reads a UTC UNTIL in the rule\'s zone', () => {
    expect(parseRRule('DTSTART;TZID=Europe/Prague:20261118T090000\nRRULE:FREQ=DAILY;UNTIL=20261124T080000Z').until).toBe('2026-11-24T09:00')
  })

  it('the RFC example with COUNT and BYDAY round-trips and expands', () => {
    const rule = parseRRule('DTSTART:19970907T090000\nRRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=1SU,-1SU')

    expect([...occurrences(rule)].slice(0, 4)).toEqual(['1997-09-07T09:00', '1997-09-28T09:00', '1997-11-02T09:00', '1997-11-30T09:00'])
  })
})

describe('malformed text throws a [Pyreon] RangeError that says where, tryParseRRule returns null', () => {
  const start = { start: '2026-11-18' } as const
  const bad: [string, RegExp][] = [
    ['', /there is no RRULE/],
    ['   \n  ', /there is no RRULE/],
    ['garbage', /expected a line like/],
    ['FREQ=', /FREQ must be/],
    ['FREQ=WEEKLYY', /FREQ must be .* got "WEEKLYY" \(at position 5/],
    ['FREQ=SECONDLY', /SECONDLY is not supported/],
    ['INTERVAL=2', /expected a line like/],
    ['FREQ=DAILY;INTERVAL=0', /interval must be a whole number/],
    ['FREQ=DAILY;INTERVAL=x', /INTERVAL must be digits/],
    ['FREQ=DAILY;COUNT=0', /count must be a whole number/],
    ['FREQ=DAILY;COUNT=1;UNTIL=20270101', /count and until are exclusive/],
    ['FREQ=DAILY;FREQ=WEEKLY', /FREQ appears twice/],
    ['FREQ=DAILY;BYDAY=XX', /BYDAY entries are like "TU"/],
    ['FREQ=DAILY;BYDAY=1MO', /only makes sense for monthly and yearly/],
    ['FREQ=MONTHLY;BYDAY=6MO', /nth must be/],
    ['FREQ=MONTHLY;BYMONTHDAY=0', /BYMONTHDAY entries must be whole numbers/],
    ['FREQ=MONTHLY;BYMONTHDAY=32', /BYMONTHDAY entries must be whole numbers .* "32" \(at position/],
    ['FREQ=YEARLY;BYMONTH=13', /BYMONTH entries/],
    ['FREQ=DAILY;BYHOUR=24', /BYHOUR entries/],
    ['FREQ=DAILY;BYMINUTE=60', /BYMINUTE entries/],
    ['FREQ=DAILY;BYSECOND=0', /BYSECOND is not supported/],
    ['FREQ=DAILY;BYSETPOS=0', /BYSETPOS entries/],
    ['FREQ=DAILY;WKST=XX', /WKST must be MO..SU/],
    ['FREQ=DAILY;UNTIL=tomorrow', /a date is 20261118/],
    ['FREQ=DAILY;UNTIL=20261340', /not a real date/],
    ['FREQ=DAILY;FOO=1', /unknown rule part "FOO"/],
    ['FREQ=DAILY;BYDAY', /expected NAME=value/],
    ['FREQ=DAILY;UNTIL=20200101', /before start/],
    ['FREQ=WEEKLY;BYWEEKNO=5', /only applies to yearly/],
    ['FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=30', /never occurs/],
    ['FREQ=DAILY\nFREQ=WEEKLY', /only one RRULE|expected a line/],
    ['RRULE:FREQ=DAILY\nRRULE:FREQ=WEEKLY', /only one RRULE/],
    ['EXRULE:FREQ=DAILY', /EXRULE is not supported/],
    ['RRULE:FREQ=DAILY\nEXDATE:nonsense', /a date is 20261118/],
    ['DTSTART;TZID=Not/AZone:20261118T090000\nRRULE:FREQ=DAILY', /unknown time zone/],
    ['DTSTART:20261118T250000\nRRULE:FREQ=DAILY', /not a real date and time|a date is/],
  ]

  for (const [text, message] of bad) {
    it(`${JSON.stringify(text)}`, () => {
      expect(() => parseRRule(text, start)).toThrow(message)
      expect(() => parseRRule(text, start)).toThrow(/^\[Pyreon\] (parseRRule|occurrences|toRRule): /)
      expect(tryParseRRule(text, start)).toBeNull()
    })
  }

  it('a block without DTSTART and without options.start says so', () => {
    expect(() => parseRRule('RRULE:FREQ=DAILY')).toThrow(/no DTSTART and no options.start/)
  })

  it('a non-string is a TypeError', () => {
    expect(() => parseRRule(42 as never)).toThrow(TypeError)
    expect(() => parseRRule(undefined as never)).toThrow(/\[Pyreon\] parseRRule: expected RRULE text/)
  })
})

describe('toRRule', () => {
  it('writes a DTSTART line, an RRULE line, and EXDATE and RDATE lines when needed', () => {
    expect(toRRule({ every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17' })).toBe('DTSTART;VALUE=DATE:20261117\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU')
    expect(toRRule({ every: 'month', start: '2026-11-18T09:00', timeZone: 'Europe/Prague', count: 3, on: { weekdays: [{ weekday: 5, nth: -1 }] }, except: ['2026-12-25T09:00'] })).toBe(
      'DTSTART;TZID=Europe/Prague:20261118T090000\nRRULE:FREQ=MONTHLY;COUNT=3;BYDAY=-1FR\nEXDATE;TZID=Europe/Prague:20261225T090000',
    )
    expect(toRRule({ every: 'day', start: '2026-11-18T09:00', timeZone: 'UTC', until: '2026-12-01T00:00' })).toBe('DTSTART:20261118T090000Z\nRRULE:FREQ=DAILY;UNTIL=20261201T000000Z')
  })

  it('writes an until in a zone as UTC with a Z', () => {
    expect(toRRule({ every: 'day', start: '2026-11-18T09:00', timeZone: 'Europe/Prague', until: '2026-11-24T09:00' })).toContain('UNTIL=20261124T080000Z')
  })

  it('refuses what RFC 5545 cannot express, and bad rules', () => {
    expect(() => toRRule({ every: 'day', start: '2026-11-18T09:00:00.500' })).toThrow(/milliseconds/)
    expect(() => toRRule({ every: 'day', start: '2026-11-18', interval: 0 })).toThrow(/interval/)
  })
})
