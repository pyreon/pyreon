import {
  add,
  between,
  clamp,
  compare,
  dateParts,
  dayOfWeek,
  dayOfYear,
  daysInMonth,
  diff,
  eachDay,
  endOf,
  isAfter,
  isBefore,
  isLeapYear,
  isPlainDate,
  isPlainDateTime,
  isPlainTime,
  isPlainYearMonth,
  isSame,
  max,
  min,
  monthGrid,
  parseInstant,
  plainDate,
  plainTime,
  plainYearMonth,
  startOf,
  subtract,
  timeParts,
  toMilliseconds,
  weekOfYear,
  yearOfWeek,
} from '../core'

describe('parsing and validation: exactly which ISO forms are accepted', () => {
  it('PlainDate is YYYY-MM-DD, zero-padded, a real day, years 0001-9999', () => {
    for (const ok of ['2026-11-18', '0001-01-01', '9999-12-31', '2024-02-29', '2000-02-29']) expect(isPlainDate(ok), ok).toBe(true)
    for (const bad of ['2026-02-30', '2026-2-3', '2026-02-3', '2026-13-01', '2026-00-10', '2026-01-00', '1900-02-29', '2100-02-29', '0000-01-01', '2026/11/18', '20261118', '2026-11-18T00:00', ' 2026-11-18', '2026-11-18 ', '+2026-11-18', '', 'yesterday', '２０２６-11-18'])
      {expect(isPlainDate(bad), bad).toBe(false)}
    for (const notString of [null, undefined, 20261118, {}, new Date(0), ['2026-11-18']]) expect(isPlainDate(notString)).toBe(false)
  })

  it('PlainYearMonth is YYYY-MM', () => {
    for (const ok of ['2026-11', '0001-01', '9999-12']) expect(isPlainYearMonth(ok), ok).toBe(true)
    for (const bad of ['2026-13', '2026-00', '2026-1', '26-11', '2026-11-18', '0000-05', '2026_11']) expect(isPlainYearMonth(bad), bad).toBe(false)
  })

  it('PlainTime is HH:MM, HH:MM:SS or HH:MM:SS.f..fff; no offsets, no leap seconds, no 24:00', () => {
    for (const ok of ['00:00', '23:59', '14:30:05', '14:30:05.2', '14:30:05.25', '14:30:05.250']) expect(isPlainTime(ok), ok).toBe(true)
    for (const bad of ['24:00', '14:60', '14:30:60', '14:30:05.', '14:30:05.2500', '14:30:05,250', '1:30', '14.30', '14:30Z', '14:30:05+01:00', '14', '14:3', ' 14:30'])
      {expect(isPlainTime(bad), bad).toBe(false)}
  })

  it('PlainDateTime is a PlainDate, an upper-case T and a PlainTime', () => {
    for (const ok of ['2026-11-18T14:30', '2026-11-18T14:30:05', '2026-11-18T14:30:05.250', '2024-02-29T00:00']) expect(isPlainDateTime(ok), ok).toBe(true)
    for (const bad of ['2026-11-18t14:30', '2026-11-18 14:30', '2026-11-18T14:30Z', '2026-11-18T14:30+01:00', '2026-11-18T14:30:05[Europe/Prague]', '2026-02-30T10:00', '2026-11-18T25:00', '2026-11-18T', '2026-11-18'])
      {expect(isPlainDateTime(bad), bad).toBe(false)}
  })

  it('parseInstant needs an offset and is strict about the rest', () => {
    expect(parseInstant('2026-11-18T14:30:05Z')).toBe(Date.UTC(2026, 10, 18, 14, 30, 5))
    expect(parseInstant('2026-11-18T14:30:05.250+01:00')).toBe(Date.UTC(2026, 10, 18, 13, 30, 5, 250))
    expect(parseInstant('2026-11-18T14:30:05.123456789-05:30')).toBe(Date.UTC(2026, 10, 18, 20, 0, 5, 123))
    expect(parseInstant('2026-11-18T14:30:05.5Z')).toBe(Date.UTC(2026, 10, 18, 14, 30, 5, 500))
    expect(parseInstant('0001-01-01T00:00:00Z')).toBe(-62_135_596_800_000)
    for (const bad of ['2026-11-18T14:30:05', '2026-11-18T14:30Z', '2026-11-18', 'x', '2026-11-18T14:30:05+0100', '2026-11-18T14:30:05.Z', '2026-13-18T14:30:05Z', '2026-11-18t14:30:05Z'])
      {expect(parseInstant(bad), bad).toBeNull()}
    expect(parseInstant(5 as unknown as string)).toBeNull()
  })

  it('constructors build and validate', () => {
    expect(plainDate(2026, 11, 18)).toBe('2026-11-18')
    expect(plainDate(1, 1, 1)).toBe('0001-01-01')
    expect(plainDate(2024, 2, 29)).toBe('2024-02-29')
    expect(() => plainDate(2026, 2, 30)).toThrow(/\[Pyreon\] plainDate: day must be an integer from 1 to 28/)
    expect(() => plainDate(2026, 13, 1)).toThrow(/month/)
    expect(() => plainDate(10000, 1, 1)).toThrow(/year/)
    expect(() => plainDate(2026.5, 1, 1)).toThrow(/year/)
    expect(plainYearMonth(2026, 11)).toBe('2026-11')
    expect(plainTime(14)).toBe('14:00')
    expect(plainTime(14, 30)).toBe('14:30')
    expect(plainTime(14, 30, 5)).toBe('14:30:05')
    expect(plainTime(14, 30, 0, 250)).toBe('14:30:00.250')
    expect(() => plainTime(24)).toThrow(/hour/)
    expect(() => plainTime(1, 1, 60)).toThrow(/second/)
  })

  it('dateParts and timeParts', () => {
    expect(dateParts('2026-11-18')).toEqual({ year: 2026, month: 11, day: 18 })
    expect(dateParts('2026-11-18T14:30')).toEqual({ year: 2026, month: 11, day: 18 })
    expect(timeParts('14:30:05.250')).toEqual({ hour: 14, minute: 30, second: 5, millisecond: 250 })
    expect(timeParts('2026-11-18T14:30')).toEqual({ hour: 14, minute: 30, second: 0, millisecond: 0 })
    expect(() => dateParts('2026-02-30' as '2026-01-01')).toThrow(/\[Pyreon\] dateParts/)
    expect(() => timeParts('nope' as '10:00')).toThrow(/\[Pyreon\] timeParts/)
  })

  it('arithmetic on garbage throws a [Pyreon] error that says what to do', () => {
    expect(() => add('yesterday' as '2026-01-01', { days: 1 })).toThrow(/\[Pyreon\] add: expected .*PlainDate.*"yesterday".*isPlain/s)
    expect(() => add('2026-02-30' as '2026-01-01', { days: 1 })).toThrow(/\[Pyreon\] add/)
    expect(() => add(5 as unknown as '2026-01-01', { days: 1 })).toThrow(/\[Pyreon\] add/)
    expect(() => startOf('x' as '2026-01-01', 'day')).toThrow(/\[Pyreon\] startOf/)
    expect(() => diff('2026-01-01', 'bad' as '2026-01-01', 'day')).toThrow(/\[Pyreon\] diff/)
  })
})

describe('add and subtract', () => {
  it.each([
    ['2026-01-31', { months: 1 }, '2026-02-28'],
    ['2024-01-31', { months: 1 }, '2024-02-29'],
    ['2026-03-31', { months: -1 }, '2026-02-28'],
    ['2024-02-29', { years: 1 }, '2025-02-28'],
    ['2024-02-29', { years: 4 }, '2028-02-29'],
    ['2024-02-29', { years: -4 }, '2020-02-29'],
    ['2000-02-29', { years: 100 }, '2100-02-28'],
    ['2026-12-31', { days: 1 }, '2027-01-01'],
    ['2026-03-01', { days: -1 }, '2026-02-28'],
    ['2000-02-28', { days: 1 }, '2000-02-29'],
    ['2100-02-28', { days: 1 }, '2100-03-01'],
    ['1900-02-28', { days: 1 }, '1900-03-01'],
    ['2026-11-18', { weeks: 2 }, '2026-12-02'],
    ['2026-11-18', { years: 1, months: 2, weeks: 1, days: 1 }, '2028-01-26'],
    ['2026-11-18', { days: 0 }, '2026-11-18'],
    ['2026-11-18', {}, '2026-11-18'],
    ['2026-11-18', { days: 365 }, '2027-11-18'],
    ['2026-11-18', { days: 146_097 }, '2426-11-18'],
    ['2026-11-18T23:30', { minutes: 45 }, '2026-11-19T00:15'],
    ['2026-11-18T14:30', { seconds: 30 }, '2026-11-18T14:30:30'],
    ['2026-11-18T14:30:05', { milliseconds: 250 }, '2026-11-18T14:30:05.250'],
    ['2026-11-18T14:30:05', { milliseconds: 0 }, '2026-11-18T14:30:05'],
    ['2026-01-31T10:00', { months: 1, hours: 2 }, '2026-02-28T12:00'],
    ['2026-11-18T00:30', { hours: -1 }, '2026-11-17T23:30'],
    ['2026-12-31T23:59:59.999', { milliseconds: 1 }, '2027-01-01T00:00:00.000'],
    ['2026-11', { months: 3 }, '2027-02'],
    ['2026-11', { years: -1 }, '2025-11'],
    ['2026-01', { months: -1 }, '2025-12'],
  ] as const)('add(%s, %j) is %s', (value, duration, expected) => {
    expect(add(value as '2026-01-01', duration)).toBe(expected)
  })

  it('subtract is add of the negated duration', () => {
    expect(subtract('2000-03-01', { days: 1 })).toBe('2000-02-29')
    expect(subtract('1900-03-01', { days: 1 })).toBe('1900-02-28')
    expect(subtract('2026-03-31', { months: 1 })).toBe('2026-02-28')
    expect(subtract('2026-11-18T00:00', { minutes: 1 })).toBe('2026-11-17T23:59')
    expect(subtract('2026-01', { months: 2 })).toBe('2025-11')
  })

  it('rejects mixed-sign durations with a clear error (as Temporal does)', () => {
    expect(() => add('2026-01-01', { months: 1, days: -1 })).toThrow(/\[Pyreon\] add: a duration cannot mix positive and negative fields/)
    expect(() => subtract('2026-01-01T10:00', { hours: 1, minutes: -5 })).toThrow(/cannot mix/)
    expect(() => toMilliseconds({ hours: 1, minutes: -5 })).toThrow(/cannot mix/)
  })

  it('rejects fractional and non-finite fields, time on a PlainDate, days on a PlainYearMonth', () => {
    expect(() => add('2026-01-01', { days: 1.5 })).toThrow(/\[Pyreon\] add: a PlainDate has no time of day/)
    expect(() => add('2026-01-01', { months: 1.5 })).toThrow(/\[Pyreon\] add: duration.months must be a whole number/)
    expect(() => add('2026-01-01', { days: Number.NaN })).toThrow(/finite number/)
    expect(() => add('2026-01-01', { days: Number.POSITIVE_INFINITY })).toThrow(/finite number/)
    expect(() => add('2026-01-01', { hours: 1 })).toThrow(/PlainDate has no time of day/)
    expect(() => add('2026-01', { days: 1 })).toThrow(/PlainYearMonth moves by years and months only/)
    expect(() => add('2026-01-01', null as unknown as { days: 1 })).toThrow(/\[Pyreon\] add: expected a Duration/)
  })

  it('throws RangeError outside years 0001-9999', () => {
    expect(() => add('9999-12-31', { days: 1 })).toThrow(RangeError)
    expect(() => add('0001-01-01', { days: -1 })).toThrow(/outside the supported range/)
    expect(() => add('9999-12-31T23:59', { minutes: 1 })).toThrow(RangeError)
    expect(() => add('2026-01-01', { years: 8000 })).toThrow(RangeError)
    expect(() => add('0001-01', { months: -1 })).toThrow(RangeError)
    expect(add('9999-12-31', { days: -1 })).toBe('9999-12-30')
    expect(add('0001-01-01', { days: 1 })).toBe('0001-01-02')
  })

  it('never returns negative zero', () => {
    expect(Object.is(diff('2026-01-01', '2026-01-01', 'day'), 0)).toBe(true)
    expect(Object.is(diff('2026-01-02', '2026-01-01', 'week'), 0)).toBe(true)
    expect(Object.is(diff('2026-02-01', '2026-01-31', 'month'), 0)).toBe(true)
    expect(Object.is(between('2026-03-01', '2026-03-01').days, 0)).toBe(true)
    const b = between('2026-03-01', '2026-01-31')

    expect(Object.is(b.years, 0)).toBe(true)
  })

  it('warns once per call about an unknown duration field, in development only', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    add('2026-01-01', { day: 1 } as never)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatch(/\[Pyreon\] add: unknown duration field "day"/)
    warn.mockClear()
    vi.stubEnv('NODE_ENV', 'production')
    add('2026-01-01', { day: 1 } as never)
    expect(warn).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    warn.mockRestore()
  })
})

describe('diff and between', () => {
  it.each([
    ['2026-11-18', '2026-12-24', 'day', 36],
    ['2026-12-24', '2026-11-18', 'day', -36],
    ['2026-11-18', '2026-11-30', 'week', 1],
    ['2026-11-30', '2026-11-18', 'week', -1],
    ['2026-01-31', '2026-02-28', 'month', 1],
    ['2026-01-31', '2026-02-27', 'month', 0],
    ['2026-02-28', '2026-01-31', 'month', 0],
    ['2026-03-31', '2026-02-28', 'month', -1],
    ['2026-03-31', '2026-02-27', 'month', -1],
    ['2024-02-29', '2025-02-28', 'year', 1],
    ['2024-02-29', '2025-02-27', 'year', 0],
    ['2024-02-29', '2020-02-29', 'year', -4],
    ['2026-01-01', '2027-01-01', 'day', 365],
    ['2024-01-01', '2025-01-01', 'day', 366],
    ['1900-01-01', '2000-01-01', 'day', 36_524],
    ['2000-01-01', '2100-01-01', 'day', 36_525],
    ['2026-11-18T10:00', '2026-11-18T12:59', 'hour', 2],
    ['2026-11-18T12:59', '2026-11-18T10:00', 'hour', -2],
    ['2026-11-18T10:00', '2026-11-19T09:59', 'day', 0],
    ['2026-11-18T10:00', '2026-11-19T10:00', 'day', 1],
    ['2026-11-18T10:00:00.500', '2026-11-18T10:00:01.499', 'second', 0],
    ['2026-11-18T10:00:00.500', '2026-11-18T10:00:01.500', 'millisecond', 1000],
    ['2026-01-31T12:00', '2026-02-28T11:59', 'month', 0],
    ['2026-01-31T12:00', '2026-02-28T12:00', 'month', 1],
    ['2026-01', '2027-03', 'month', 14],
    ['2026-01', '2027-03', 'year', 1],
    ['2027-03', '2026-01', 'year', -1],
    ['10:00', '12:30', 'minute', 150],
    ['12:30', '10:00', 'hour', -2],
    ['10:00:00.250', '10:00:01', 'millisecond', 750],
  ] as const)('diff(%s, %s, %s) is %i', (a, b, unit, expected) => {
    expect(diff(a as '2026-01-01', b as '2026-01-01', unit)).toBe(expected)
  })

  it('diff of Instants: time units directly, calendar units only with a zone', () => {
    expect(diff(0, 3_600_000 * 5 + 1, 'hour')).toBe(5)
    expect(diff(5000, 0, 'second')).toBe(-5)
    expect(() => diff(0, 1, 'day')).toThrow(/needs a time zone/)
    // Prague, 2026-03-28 12:00 to 2026-03-29 12:00 is a 23-hour day but one calendar day.
    expect(diff(Date.UTC(2026, 2, 28, 11), Date.UTC(2026, 2, 29, 10), 'day', { zone: 'Europe/Prague' })).toBe(1)
    expect(diff(Date.UTC(2026, 2, 28, 11), Date.UTC(2026, 2, 29, 10), 'hour')).toBe(23)
  })

  it('rejects units that do not fit the shape', () => {
    expect(() => diff('2026-01-01', '2026-02-01', 'hour')).toThrow(/PlainDate has no time of day/)
    expect(() => diff('2026-01', '2026-02', 'day')).toThrow(/only year and month/)
    expect(() => diff('10:00', '11:00', 'day')).toThrow(/only hour/)
    expect(() => diff('2026-01-01', '2026-02-01', 'days' as never)).toThrow(/unknown unit "days"/)
    expect(() => diff('2026-01-01', '2026-02-01T10:00' as '2026-01-01', 'day')).toThrow(/same shape/)
  })

  it.each([
    ['2026-01-31', '2026-03-01', { years: 0, months: 1, days: 1 }],
    ['2012-08-31', '2051-02-28', { years: 38, months: 5, days: 28 }],
    ['2026-03-01', '2026-01-31', { years: 0, months: -1, days: -1 }],
    ['2026-11-18', '2026-11-18', { years: 0, months: 0, days: 0 }],
    ['2024-02-29', '2025-02-28', { years: 0, months: 11, days: 30 }],
    ['2020-01-01', '2026-11-18', { years: 6, months: 10, days: 17 }],
  ] as const)('between(%s, %s)', (a, b, expected) => {
    expect(between(a, b)).toEqual(expected)
  })

  it('between on PlainDateTime carries the time of day', () => {
    expect(between('2026-01-01T10:00', '2026-01-02T09:30')).toEqual({ years: 0, months: 0, days: 0, hours: 23, minutes: 30, seconds: 0, milliseconds: 0 })
    expect(between('1918-08-31T08:11:42', '1976-07-01T08:11')).toEqual({ years: 57, months: 9, days: 30, hours: 23, minutes: 59, seconds: 18, milliseconds: 0 })
    expect(between('2026-01-01T00:00', '2025-12-31T23:59:59.999')).toEqual({ years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: -1 })
    expect(() => between('2026-01-01', '2026-01-01T00:00' as '2026-01-01')).toThrow(/same shape/)
  })
})

describe('compare and friends', () => {
  it('compare: same-length strings order as strings, other precisions are parsed', () => {
    expect(compare('2026-11-18', '2026-11-19')).toBe(-1)
    expect(compare('2026-11-19', '2026-11-18')).toBe(1)
    expect(compare('2026-11-18', '2026-11-18')).toBe(0)
    expect(compare('0999-12-31', '1000-01-01')).toBe(-1)
    expect(compare('2026-11', '2026-12')).toBe(-1)
    expect(compare('14:30', '14:30:00')).toBe(0)
    expect(compare('14:30:05.5', '14:30:05.25')).toBe(1)
    expect(compare('14:30:05.5', '14:30:05.50')).toBe(0)
    expect(compare('2026-11-18T14:30', '2026-11-18T14:30:00.000')).toBe(0)
    expect(compare('2026-11-18T14:30', '2026-11-18T14:30:00.001')).toBe(-1)
    expect(compare(1, 2)).toBe(-1)
    expect(compare(2, 1)).toBe(1)
    expect(compare(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 1))).toBe(0)
    expect(() => compare('2026-11-18', '2026-11-18T10:00' as '2026-11-18')).toThrow(/same shape/)
    expect(() => compare('2026-11-18', 5 as unknown as '2026-11-18')).toThrow(/\[Pyreon\] compare/)
  })

  it('isBefore, isAfter, min, max, clamp', () => {
    expect(isBefore('2026-01-01', '2026-01-02')).toBe(true)
    expect(isAfter('2026-01-01', '2026-01-02')).toBe(false)
    expect(min('2026-03-01', '2026-01-01', '2026-02-01')).toBe('2026-01-01')
    expect(max('2026-03-01', '2026-01-01', '2026-02-01')).toBe('2026-03-01')
    expect(min('14:30', '14:29:59')).toBe('14:29:59')
    expect(min('2026-01-01')).toBe('2026-01-01')
    expect(() => (min as (...a: string[]) => string)()).toThrow(/needs at least one value/)
    expect(clamp('2026-05-01', '2026-01-01', '2026-03-01')).toBe('2026-03-01')
    expect(clamp('2025-05-01', '2026-01-01', '2026-03-01')).toBe('2026-01-01')
    expect(clamp('2026-02-01', '2026-01-01', '2026-03-01')).toBe('2026-02-01')
    expect(() => clamp('2026-02-01', '2026-03-01', '2026-01-01')).toThrow(/lower bound is after/)
  })

  it('isSame with and without a unit', () => {
    expect(isSame('2026-11-18', '2026-11-18')).toBe(true)
    expect(isSame('2026-11-18', '2026-11-30', 'month')).toBe(true)
    expect(isSame('2026-11-18', '2026-12-01', 'month')).toBe(false)
    expect(isSame('2026-11-18', '2025-11-18', 'month')).toBe(false)
    expect(isSame('2026-01-01', '2026-12-31', 'year')).toBe(true)
    expect(isSame('2026-11-16', '2026-11-22', 'week')).toBe(true)
    expect(isSame('2026-11-15', '2026-11-16', 'week')).toBe(false)
    expect(isSame('2026-11-15', '2026-11-16', 'week', { weekStart: 7 })).toBe(true)
    expect(isSame('2026-11-18T10:00', '2026-11-18T10:59', 'hour')).toBe(true)
    expect(isSame('2026-11-18T10:00', '2026-11-18T11:00', 'hour')).toBe(false)
    expect(isSame('2026-11', '2026-11', 'month')).toBe(true)
    expect(() => isSame(1, 2, 'day')).toThrow(/needs a time zone/)
  })
})

describe('calendar facts', () => {
  it('weekday, day of year', () => {
    expect(dayOfWeek('2026-11-18')).toBe(3)
    expect(dayOfWeek('1970-01-01')).toBe(4)
    expect(dayOfWeek('2000-01-01')).toBe(6)
    expect(dayOfWeek('0001-01-01')).toBe(1)
    expect(dayOfWeek('9999-12-31')).toBe(5)
    expect(dayOfWeek('2026-11-22T10:00')).toBe(7)
    expect(dayOfYear('2026-01-01')).toBe(1)
    expect(dayOfYear('2026-12-31')).toBe(365)
    expect(dayOfYear('2024-12-31')).toBe(366)
    expect(dayOfYear('2024-03-01')).toBe(61)
    expect(dayOfYear('2026-03-01')).toBe(60)
  })

  it('leap years and month lengths, including 1900, 2000 and 2100', () => {
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(2100)).toBe(false)
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear('2024-06-01')).toBe(true)
    expect(isLeapYear('2100-06')).toBe(false)
    expect(daysInMonth('1900-02')).toBe(28)
    expect(daysInMonth('2000-02')).toBe(29)
    expect(daysInMonth('2100-02')).toBe(28)
    expect(daysInMonth('2026-11-18')).toBe(30)
    expect(daysInMonth('2026-12')).toBe(31)
    expect(() => isLeapYear(0)).toThrow(RangeError)
  })

  it.each([
    ['2020-12-31', 53, 2020],
    ['2021-01-01', 53, 2020],
    ['2021-01-03', 53, 2020],
    ['2021-01-04', 1, 2021],
    ['2024-12-30', 1, 2025],
    ['2024-12-29', 52, 2024],
    ['2026-12-31', 53, 2026],
    ['2027-01-01', 53, 2026],
    ['2027-01-04', 1, 2027],
    ['2015-12-31', 53, 2015],
    ['2016-01-01', 53, 2015],
    ['2026-11-18', 47, 2026],
    ['2026-01-01', 1, 2026],
    ['0001-01-01', 1, 1],
    ['9999-12-31', 52, 9999],
  ] as const)('ISO week of %s is %i of %i', (date, week, weekYear) => {
    expect([weekOfYear(date), yearOfWeek(date)]).toEqual([week, weekYear])
    expect([weekOfYear(`${date}T12:00` as '2026-01-01T10:00'), yearOfWeek(`${date}T12:00` as '2026-01-01T10:00')]).toEqual([week, weekYear])
  })
})

describe('startOf and endOf', () => {
  it.each([
    ['2026-11-18', 'week', undefined, '2026-11-16'],
    ['2026-11-18', 'week', 7, '2026-11-15'],
    ['2026-11-18', 'week', 3, '2026-11-18'],
    ['2026-11-18', 'week', 4, '2026-11-12'],
    ['2026-01-01', 'week', undefined, '2025-12-29'],
    ['2026-11-18', 'month', undefined, '2026-11-01'],
    ['2026-11-18', 'year', undefined, '2026-01-01'],
    ['2026-11-18', 'day', undefined, '2026-11-18'],
    ['2026-11-18T14:30:05', 'hour', undefined, '2026-11-18T14:00:00'],
    ['2026-11-18T14:30', 'minute', undefined, '2026-11-18T14:30'],
    ['2026-11-18T14:30:05.250', 'second', undefined, '2026-11-18T14:30:05.000'],
    ['2026-11-18T14:30', 'day', undefined, '2026-11-18T00:00'],
    ['2026-11-18T14:30', 'month', undefined, '2026-11-01T00:00'],
    ['2026-11-18T14:30', 'week', undefined, '2026-11-16T00:00'],
    ['2026-11', 'year', undefined, '2026-01'],
    ['2026-11', 'month', undefined, '2026-11'],
  ] as const)('startOf(%s, %s, ws %s) is %s', (value, unit, weekStart, expected) => {
    expect(startOf(value as '2026-01-01', unit, weekStart === undefined ? undefined : { weekStart })).toBe(expected)
  })

  it.each([
    ['2026-11-18', 'month', '2026-11-30'],
    ['2024-02-10', 'month', '2024-02-29'],
    ['2026-02-10', 'month', '2026-02-28'],
    ['2026-11-18', 'year', '2026-12-31'],
    ['2026-11-18', 'week', '2026-11-22'],
    ['2026-11-18', 'day', '2026-11-18'],
    ['2026-11-18T14:30', 'day', '2026-11-18T23:59:59.999'],
    ['2026-11-18T14:30', 'month', '2026-11-30T23:59:59.999'],
    ['2026-11-18T14:30', 'hour', '2026-11-18T14:59:59.999'],
    ['2026-11-18T14:30:05', 'minute', '2026-11-18T14:30:59.999'],
    ['2026-11-18T14:30:05.250', 'millisecond', '2026-11-18T14:30:05.250'],
    ['2026-11', 'year', '2026-12'],
    ['2026-11', 'month', '2026-11'],
  ] as const)('endOf(%s, %s) is %s', (value, unit, expected) => {
    expect(endOf(value as '2026-01-01', unit)).toBe(expected)
  })

  it('rejects units that do not fit and bad week starts', () => {
    expect(() => startOf('2026-11-18', 'hour')).toThrow(/PlainDate has no time of day/)
    expect(() => endOf('2026-11', 'day')).toThrow(/only year and month/)
    expect(() => startOf('2026-11-18', 'week', { weekStart: 8 as 7 })).toThrow(/weekStart must be 1/)
    expect(() => startOf('2026-11-18', 'quarter' as never)).toThrow(/unknown unit/)
    expect(() => startOf('0001-01-01', 'week')).not.toThrow()
    expect(() => startOf('0001-01-02', 'week', { weekStart: 3 })).toThrow(RangeError)
  })
})

describe('eachDay and monthGrid', () => {
  it('eachDay is inclusive and handles month, year and leap-day boundaries', () => {
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
    expect(eachDay('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01'])
    expect(eachDay('2026-12-30', '2027-01-01')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01'])
    expect(eachDay('2026-11-18', '2026-11-18')).toEqual(['2026-11-18'])
    expect(eachDay('2026-11-19', '2026-11-18')).toEqual([])
    expect(eachDay('2026-01-01', '2026-12-31')).toHaveLength(365)
  })

  it('monthGrid: November 2026 starts on a Sunday', () => {
    const monday = monthGrid('2026-11')

    expect(monday).toHaveLength(6)
    expect(monday[0]).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
    expect(monday[5]).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'])
    const sunday = monthGrid('2026-11', { weekStart: 7 })

    expect(sunday).toHaveLength(5)
    expect(sunday[0]![0]).toBe('2026-11-01')
    expect(sunday[4]).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'])
    expect(monthGrid('2026-11-18')).toEqual(monday)
    expect(monthGrid('2026-11-18T10:00' as '2026-11-18')).toEqual(monday)
  })

  it('monthGrid: a February that fits four rows, and weeks: 6', () => {
    const feb = monthGrid('2026-02', { weekStart: 7 })

    expect(feb).toHaveLength(4)
    expect(feb[3]![6]).toBe('2026-02-28')
    expect(monthGrid('2026-02', { weekStart: 7, weeks: 6 })).toHaveLength(6)
    expect(monthGrid('2026-02', { weekStart: 1 })).toHaveLength(5)
    expect(monthGrid('2026-11', { weeks: 6 })).toHaveLength(6)
    expect(() => monthGrid('2026-11', { weeks: 5 as 6 })).toThrow(/weeks must be/)
    expect(() => monthGrid('0001-01')).not.toThrow()
    expect(() => monthGrid('0001-01', { weekStart: 7 })).toThrow(RangeError)
    expect(() => monthGrid('9999-12', { weekStart: 7, weeks: 6 })).toThrow(RangeError)
  })
})

describe('toMilliseconds', () => {
  it('sums fixed-length fields and refuses months and years', () => {
    expect(toMilliseconds({ hours: 1, minutes: 30 })).toBe(5_400_000)
    expect(toMilliseconds({ weeks: 1 })).toBe(604_800_000)
    expect(toMilliseconds({ days: -1 })).toBe(-86_400_000)
    expect(toMilliseconds({})).toBe(0)
    expect(toMilliseconds({ seconds: 1, milliseconds: 500 })).toBe(1500)
    expect(() => toMilliseconds({ months: 1 })).toThrow(/\[Pyreon\] toMilliseconds: years and months have no fixed length.*diff.*addInstant/s)
    expect(() => toMilliseconds({ years: 1 })).toThrow(/no fixed length/)
  })
})
