/**
 * Behaviour found by hands-on review: negative zero, time-of-day strings, reversed ranges, invalid time zones.
 */
import * as core from '../core'
import * as reactive from '../index'
import { _resetLocaleState } from '../locale'
import { _warnedSize, _resetWarnings } from '../warn'
import { clearAllTables } from './helpers'

const en = { locale: 'en-US' } as const
let warn: { mock: { calls: unknown[][] }; mockRestore(): void }

beforeEach(() => {
  _resetWarnings()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
  _resetLocaleState()
  clearAllTables()
})

describe('signDisplay defaults to "negative" (no "-0")', () => {
  it('negative zero and values that round to zero print without a sign', () => {
    expect(core.formatNumber(-0, en)).toBe('0')
    expect(core.formatNumber(-0.001, { ...en, maximumFractionDigits: 2 })).toBe('0')
    expect(core.formatNumber(-0.004, { ...en, minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe('0.00')
    expect(core.formatCurrency(-0.001, 'USD', en)).toBe('$0.00')
    expect(core.formatPercent(-0.00001, en)).toBe('0%')
    expect(core.formatUnit(-0.0001, 'meter', { ...en, maximumFractionDigits: 1 })).toBe('0 m')
    expect(core.formatCompact(-0.1, { ...en, maximumFractionDigits: 0 })).toBe('0')
    expect(core.formatBytes(-0.0001, { ...en, maximumFractionDigits: 0 })).toBe('0 B')
    expect(core.formatNumberRange(-0, 5, en)).toBe('0–5')
  })

  it('real negatives keep their sign', () => {
    expect(core.formatNumber(-5, en)).toBe('-5')
    expect(core.formatCurrency(-9.99, 'USD', en)).toBe('-$9.99')
    expect(core.formatPercent(-0.5, en)).toBe('-50%')
  })

  it('every formatter factory has the same default, and the caller can override it', () => {
    expect(core.numberFormatter(en)(-0)).toBe('0')
    expect(core.currencyFormatter('USD', en)(-0.001)).toBe('$0.00')
    expect(core.percentFormatter(en)(-0.00001)).toBe('0%')
    expect(core.compactFormatter({ ...en, maximumFractionDigits: 0 })(-0.1)).toBe('0')
    expect(core.unitFormatter('meter', { ...en, maximumFractionDigits: 0 })(-0.1)).toBe('0 m')
    expect(core.bytesFormatter(en)(-0)).toBe('0 B')
    expect(core.numberFormatter({ ...en, signDisplay: 'auto' })(-0)).toBe('-0')
    expect(core.numberFormatter({ ...en, signDisplay: 'always' })(5)).toBe('+5')
    expect(core.numberFormatter({ ...en, signDisplay: 'exceptZero' })(0)).toBe('0')
    expect(core.formatNumber(-0.001, { ...en, maximumFractionDigits: 2, signDisplay: 'auto' })).toBe('-0')
    expect(core.formatCurrency(-0.001, 'USD', { ...en, signDisplay: 'auto' })).toBe('-$0.00')
    expect(core.formatBytes(5, { ...en, signDisplay: 'always' })).toBe('+5 B')
  })

  it('reactive entry and defineFormats too', () => {
    expect(reactive.formatNumber(-0, en)).toBe('0')
    expect(core.defineFormats({ n: { kind: 'number', locale: 'en-US' } }).n(-0)).toBe('0')
  })
})

describe('a time of day is a value of its own', () => {
  const t = (s: string, o: object = {}) => core.formatTime(s, { ...en, ...o })

  it('formatTime accepts HH:MM, HH:MM:SS and HH:MM:SS.fff, never shifted by the zone', () => {
    for (const timeZone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      expect(t('14:30', { timeZone })).toBe(new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(Date.UTC(1970, 0, 1, 14, 30)))
      expect(t('14:30:05', { timeZone, timeStyle: 'medium' })).toBe(new Intl.DateTimeFormat('en-US', { timeStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(1970, 0, 1, 14, 30, 5)))
      expect(t('00:00', { timeZone })).toBe(new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(Date.UTC(1970, 0, 1)))
    }
    expect(t('14:30:05.250', { timeStyle: 'medium' })).toBe('2:30:05 PM'.replace(/ /, ' '))
    expect(t('23:59:59.999', { hour: 'numeric', minute: 'numeric', second: 'numeric', fractionalSecondDigits: 3 })).toMatch(/11:59:59\.999/)
  })

  it('timeStyle long / full show no zone for a time of day', () => {
    expect(t('14:30', { timeStyle: 'full' })).not.toMatch(/UTC|GMT|Coordinated/)
  })

  it('the time formatter accepts it too, in other locales', () => {
    expect(core.timeFormatter({ locale: 'de' })('14:30')).toBe(new Intl.DateTimeFormat('de', { timeStyle: 'short', timeZone: 'UTC' }).format(Date.UTC(1970, 0, 1, 14, 30)))
    expect(core.timeFormatter({ locale: 'ja' })('09:05')).toBe(new Intl.DateTimeFormat('ja', { timeStyle: 'short', timeZone: 'UTC' }).format(Date.UTC(1970, 0, 1, 9, 5)))
  })

  it('date, dateTime, ranges and relative time reject it with a clear message', () => {
    expect(core.formatDate('14:30', { ...en, fallback: '?' })).toBe('?')
    expect(core.formatDateTime('14:30', { ...en, fallback: '?' })).toBe('?')
    expect(core.formatDateToParts('14:30', en)).toEqual([])
    expect(core.formatDateRange('14:30', '15:30', { ...en, fallback: '?' })).toBe('?')
    expect(core.formatRelativeTo('14:30', '2026-11-18', { ...en, fallback: '?' })).toBe('?')
    expect(core.dateFormatter({ ...en, fallback: '?' })('14:30')).toBe('?')
    expect(core.dateTimeFormatter({ ...en, fallback: '?' })('14:30')).toBe('?')
    expect(warn.mock.calls.some((c) => /formatDate\(\): "14:30" is a time of day with no date, so there is no date to show\. Use formatTime\(\)/.test(String(c[0])))).toBe(true)
  })

  it.each(['24:00', '12:60', '1:30', '12:5', '12:30:61', '12:30:', '12:30:05.', '12:30x', '12-30', ':30', 'T14:30'])('%j is not a time of day', (s) => {
    expect(core.formatTime(s, { ...en, fallback: '?' })).toBe('?')
  })

  it('a full date-time and an instant still work in formatTime', () => {
    expect(core.formatTime('2026-11-18T14:30', { ...en, timeZone: 'Asia/Tokyo' })).toBe('2:30 PM')
    expect(core.formatTime('2026-11-18T14:30:00Z', { ...en, timeZone: 'Asia/Tokyo' })).toBe('11:30 PM')
  })

  it('PlainTimeString is a template-literal type', () => {
    const a: core.PlainTimeString = '14:30'
    const b: core.PlainTimeString = '14:30:05'
    const c: core.PlainTimeString = '14:30:05.250'
    expect([a, b, c].map((v) => core.formatTime(v, en))).toHaveLength(3)
  })
})

describe('reversed ranges are ordered', () => {
  it('formatDateRange', () => {
    expect(core.formatDateRange('2026-11-15', '2026-11-12', en)).toBe(core.formatDateRange('2026-11-12', '2026-11-15', en))
    expect(core.formatDateRange(Date.UTC(2026, 10, 15), Date.UTC(2026, 10, 12), { ...en, timeZone: 'UTC' })).toBe(
      core.formatDateRange(Date.UTC(2026, 10, 12), Date.UTC(2026, 10, 15), { ...en, timeZone: 'UTC' }),
    )
  })

  it('formatNumberRange, bigint and mixed', () => {
    expect(core.formatNumberRange(5, 3, en)).toBe(core.formatNumberRange(3, 5, en))
    expect(core.formatNumberRange(10n, 2n, en)).toBe(core.formatNumberRange(2n, 10n, en))
    expect(core.formatNumberRange(10, 2n, en)).toBe(core.formatNumberRange(2n, 10, en))
    expect(core.formatNumberRange(5, 3, { ...en, style: 'currency', currency: 'EUR' })).toBe('€3.00 – €5.00')
  })

  it('Formatter#range', () => {
    const price = core.currencyFormatter('EUR', en)
    expect(price.range(20, 10)).toBe(price.range(10, 20))
    const day = core.dateFormatter({ ...en, timeZone: 'UTC' })
    expect(day.range('2026-11-15', '2026-11-12')).toBe(day.range('2026-11-12', '2026-11-15'))
    expect(price.from((c: number) => c / 100).range(2000, 1000)).toBe(price.range(10, 20))
  })

  it('equal ends give the single value where Intl does', () => {
    expect(core.formatDateRange('2026-11-12', '2026-11-12', en)).toBe(core.formatDate('2026-11-12', en))
    expect(core.formatNumberRange(5, 5, en)).toBe('~5')
    expect(core.formatNumberRange(5, 5, en)).toBe(new Intl.NumberFormat('en-US').formatRange(5, 5))
  })
})

describe('an invalid time zone degrades like an invalid locale', () => {
  const at = Date.UTC(2026, 10, 18, 23, 30)

  it('formatDate, formatTime, formatDateTime fall back to the active zone with one dev warning', () => {
    const want = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(at)
    expect(core.formatDate(at, { ...en, timeZone: 'Mars/Phobos' })).toBe(want)
    expect(core.formatDate(at, { ...en, timeZone: 'Mars/Phobos' })).toBe(want)
    expect(core.formatTime(at, { ...en, timeZone: 'Mars/Phobos' })).toBe(new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(at))
    expect(core.formatDateTime(at, { ...en, timeZone: 'Mars/Phobos' })).toBe(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(at))
    const zoneWarnings = warn.mock.calls.filter((c) => /"Mars\/Phobos" is not an IANA time zone name; using the active zone/.test(String(c[0])))
    expect(zoneWarnings.length).toBeGreaterThanOrEqual(1)
    expect(zoneWarnings.length).toBeLessThanOrEqual(3) // once per function
  })

  it('built formatters, ranges, relative time and parts', () => {
    expect(core.dateFormatter({ ...en, timeZone: 'Mars/Phobos' })(at)).toBe(core.formatDate(at, en))
    expect(core.dateFormatter({ ...en, timeZone: 'Mars/Phobos' }).range(at, at + 86400000 * 3)).toBe(core.formatDateRange(at, at + 86400000 * 3, en))
    expect(core.formatRelativeTo(at - 3 * 86400000, at, { ...en, timeZone: 'Mars/Phobos' })).toBe('3 days ago')
    expect(core.formatDateToParts(at, { ...en, timeZone: 'Mars/Phobos' }).length).toBeGreaterThan(0)
  })

  it('a calendar string never needed the zone, so it does not warn about it', () => {
    expect(core.formatDate('2026-11-18', { ...en, timeZone: 'Mars/Phobos' })).toBe('Nov 18, 2026')
    expect(warn.mock.calls.filter((c) => /time zone/.test(String(c[0])))).toHaveLength(0)
  })

  it('production is silent, and the result is the same', () => {
    const before = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      expect(core.formatDate(at, { ...en, timeZone: 'Nope/Zone' })).toBe(core.formatDate(at, en))
      expect(warn).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = before
    }
  })

  it('a literal zone handed to a setter still throws (programmer error)', () => {
    expect(() => reactive.setTimeZone('Mars/Phobos')).toThrow(/\[Pyreon\] setTimeZone\(\)/)
    expect(() => core.createFormatter({ timeZone: 'Mars/Phobos' })).toThrow(/\[Pyreon\] createFormatter\(\)/)
  })

  it('other option errors on a date still throw [Pyreon] errors', () => {
    expect(() => core.formatDate(0, { ...en, dateStyle: 'short', month: 'long' })).toThrow(/\[Pyreon\] formatDate\(\)/)
  })
})

describe('warnings are bounded and de-duplicated', () => {
  it('500 distinct bad values share one warning; 500 distinct messages stay bounded', () => {
    for (let i = 0; i < 500; i++) core.formatNumber(`bad${i}` as never)
    expect(warn.mock.calls).toHaveLength(1)
    for (let i = 0; i < 500; i++) core.formatDate(0, { ...en, timeZone: `Mars/Base${i}` })
    expect(_warnedSize()).toBeLessThanOrEqual(64)
  })
})
