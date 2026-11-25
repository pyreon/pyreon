/**
 * Every formatter's output equals the raw `Intl` call it wraps, in the same
 * process (CLDR data differs by runtime, so no hand-written locale strings).
 * Run through BOTH entries: `/core` (explicit locale) and the reactive entry
 * (explicit locale, and the active locale).
 */
import * as core from '../core'
import * as reactive from '../index'
import { resetLocaleState } from '../locale'

const LOCALES = ['en-US', 'en-GB', 'cs', 'de', 'fr', 'ja', 'ar', 'hi', 'pt-BR', 'de-CH', 'ar-EG']
const NUMBERS = [0, 1, -1, 0.5, 1234.5678, -98765.4321, 1_240_000, 1e12, 0.000123, 42n]
const AT = Date.UTC(2026, 10, 18, 14, 30, 5, 250)

const ENTRIES = [
  ['core', core],
  ['reactive', reactive],
] as const

describe.each(ENTRIES)('differential vs raw Intl (%s entry)', (_name, f) => {
  afterEach(() => resetLocaleState())

  describe.each(LOCALES)('%s', (locale) => {
    it('formatNumber', () => {
      for (const n of NUMBERS) {
        expect(f.formatNumber(n, { locale })).toBe(new Intl.NumberFormat(locale).format(n))
        const o = { maximumFractionDigits: 0, useGrouping: false } as const
        expect(f.formatNumber(n, { locale, ...o })).toBe(new Intl.NumberFormat(locale, o).format(n))
        const s = { minimumFractionDigits: 2, signDisplay: 'always' } as const
        expect(f.formatNumber(n, { locale, ...s })).toBe(new Intl.NumberFormat(locale, s).format(n))
      }
    })

    it('formatNumber presets', () => {
      expect(f.formatNumber(1234.567, { locale, maximumFractionDigits: 0 })).toBe(
        new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(1234.567),
      )
      // A preset string needs the locale from elsewhere: bound formatter.
      const b = core.createFormatter({ locale })
      expect(b.number(1234.567, 'integer')).toBe(new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(1234.567))
      expect(b.number(1234.567, 'plain')).toBe(new Intl.NumberFormat(locale, { useGrouping: false }).format(1234.567))
      expect(b.number(1234567, 'compact')).toBe(new Intl.NumberFormat(locale, { notation: 'compact' }).format(1234567))
      expect(b.number(0.42, 'percent')).toBe(new Intl.NumberFormat(locale, { style: 'percent' }).format(0.42))
    })

    it('formatCurrency', () => {
      for (const currency of ['EUR', 'USD', 'JPY', 'CZK']) {
        expect(f.formatCurrency(1234.5, currency, { locale })).toBe(
          new Intl.NumberFormat(locale, { style: 'currency', currency }).format(1234.5),
        )
        expect(f.formatCurrency(-9.99, currency, { locale, currencyDisplay: 'code' })).toBe(
          new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code' }).format(-9.99),
        )
        expect(f.formatCurrency(-9.99, currency, { locale, currencySign: 'accounting' })).toBe(
          new Intl.NumberFormat(locale, { style: 'currency', currency, currencySign: 'accounting' }).format(-9.99),
        )
      }
      const b = core.createFormatter({ locale })
      expect(b.currency(5, 'EUR', 'name')).toBe(
        new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', currencyDisplay: 'name' }).format(5),
      )
    })

    it('formatPercent and formatCompact', () => {
      for (const n of [0.42, -0.05, 1.5, 0]) {
        expect(f.formatPercent(n, { locale })).toBe(new Intl.NumberFormat(locale, { style: 'percent' }).format(n))
        expect(f.formatPercent(n, { locale, maximumFractionDigits: 1 })).toBe(
          new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(n),
        )
      }
      for (const n of [999, 1240, 1_240_000, 5e9]) {
        expect(f.formatCompact(n, { locale })).toBe(new Intl.NumberFormat(locale, { notation: 'compact' }).format(n))
        expect(f.formatCompact(n, { locale, compactDisplay: 'long' })).toBe(
          new Intl.NumberFormat(locale, { notation: 'compact', compactDisplay: 'long' }).format(n),
        )
      }
      expect(core.createFormatter({ locale }).compact(1240, 'long')).toBe(
        new Intl.NumberFormat(locale, { notation: 'compact', compactDisplay: 'long' }).format(1240),
      )
    })

    it('formatUnit', () => {
      for (const unit of ['kilometer-per-hour', 'celsius', 'liter', 'byte'] as const) {
        expect(f.formatUnit(72, unit, { locale })).toBe(
          new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(72),
        )
        expect(f.formatUnit(1.5, unit, { locale, unitDisplay: 'long' })).toBe(
          new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(1.5),
        )
      }
      expect(core.createFormatter({ locale }).unit(3, 'meter', 'narrow')).toBe(
        new Intl.NumberFormat(locale, { style: 'unit', unit: 'meter', unitDisplay: 'narrow' }).format(3),
      )
    })

    it('formatList', () => {
      const items = ['red', 'green', 'blue']
      expect(f.formatList(items, { locale })).toBe(new Intl.ListFormat(locale).format(items))
      expect(f.formatList(items, { locale, type: 'disjunction', style: 'short' })).toBe(
        new Intl.ListFormat(locale, { type: 'disjunction', style: 'short' }).format(items),
      )
      const b = core.createFormatter({ locale })
      expect(b.list(items, 'or')).toBe(new Intl.ListFormat(locale, { type: 'disjunction' }).format(items))
      expect(b.list(items, 'unit')).toBe(new Intl.ListFormat(locale, { type: 'unit' }).format(items))
      expect(b.list(new Set(items), 'and')).toBe(new Intl.ListFormat(locale, { type: 'conjunction' }).format(items))
    })

    it('formatDate / formatTime / formatDateTime', () => {
      const tz = 'UTC'
      expect(f.formatDate(AT, { locale, timeZone: tz })).toBe(
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: tz }).format(AT),
      )
      expect(f.formatTime(AT, { locale, timeZone: tz })).toBe(
        new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: tz }).format(AT),
      )
      expect(f.formatDateTime(AT, { locale, timeZone: tz })).toBe(
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(AT),
      )
      const own = { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo' } as const
      expect(f.formatDate(AT, { locale, ...own })).toBe(new Intl.DateTimeFormat(locale, own).format(AT))
      const b = core.createFormatter({ locale, timeZone: tz })
      for (const style of ['short', 'medium', 'long', 'full'] as const) {
        expect(b.date(AT, style)).toBe(new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: tz }).format(AT))
        expect(b.time(AT, style)).toBe(new Intl.DateTimeFormat(locale, { timeStyle: style, timeZone: tz }).format(AT))
        expect(b.dateTime(AT, style)).toBe(
          new Intl.DateTimeFormat(locale, { dateStyle: style, timeStyle: style, timeZone: tz }).format(AT),
        )
      }
    })

    it('Date objects and ISO instants match the epoch value', () => {
      const raw = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(AT)
      expect(f.formatDateTime(new Date(AT), { locale, timeZone: 'UTC' })).toBe(raw)
      expect(f.formatDateTime('2026-11-18T14:30:05.250Z', { locale, timeZone: 'UTC' })).toBe(raw)
      expect(f.formatDateTime('2026-11-18T16:30:05.250+02:00', { locale, timeZone: 'UTC' })).toBe(raw)
    })

    it('formatRelative / formatRelativeTo', () => {
      for (const unit of ['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'] as const) {
        for (const v of [-3, -1, 0, 1, 2.5]) {
          expect(f.formatRelative(v, unit, { locale })).toBe(new Intl.RelativeTimeFormat(locale).format(v, unit))
          expect(f.formatRelative(v, unit, { locale, numeric: 'auto', style: 'short' })).toBe(
            new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(v, unit),
          )
        }
      }
      const auto = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
      const base = AT
      const o = { locale, timeZone: 'UTC' } as const
      expect(f.formatRelativeTo(base + 5 * 60000, base, o)).toBe(auto.format(5, 'minute'))
      expect(f.formatRelativeTo(base - 86400000, base, o)).toBe(auto.format(-1, 'day'))
      expect(f.formatRelativeTo(base + 3 * 3600000, base, o)).toBe(auto.format(3, 'hour'))
      expect(f.formatRelativeTo(base - 20 * 1000, base, o)).toBe(auto.format(-20, 'second'))
      expect(f.formatRelativeTo(base + 3 * 7 * 86400000, base, o)).toBe(auto.format(3, 'week'))
      // Calendar distances: 2026-08-20 is three calendar months before 2026-11-18, 2029-01-26 three calendar years after.
      expect(f.formatRelativeTo(base - 90 * 86400000, base, o)).toBe(auto.format(-3, 'month'))
      expect(f.formatRelativeTo(base + 800 * 86400000, base, o)).toBe(auto.format(3, 'year'))
      expect(f.formatRelativeTo(base, base, o)).toBe(auto.format(0, 'second'))
    })

    it('ranges', () => {
      expect(f.formatNumberRange(3, 5, { locale })).toBe(new Intl.NumberFormat(locale).formatRange(3, 5))
      expect(f.formatNumberRange(1000, 25000, { locale, style: 'currency', currency: 'EUR' })).toBe(
        new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).formatRange(1000, 25000),
      )
      const a = Date.UTC(2026, 10, 12)
      const b = Date.UTC(2026, 10, 15)
      expect(f.formatDateRange(a, b, { locale, timeZone: 'UTC' })).toBe(
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).formatRange(a, b),
      )
      expect(f.formatDateRange('2026-11-12', '2026-11-15', { locale })).toBe(
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).formatRange(a, b),
      )
    })

    it('to-parts', () => {
      expect(f.formatNumberToParts(1234.5, { locale })).toEqual(new Intl.NumberFormat(locale).formatToParts(1234.5))
      expect(f.formatDateToParts(AT, { locale, timeZone: 'UTC' })).toEqual(
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).formatToParts(AT),
      )
    })
  })
})

describe('the reactive entry follows the active locale', () => {
  afterEach(() => resetLocaleState())

  it.each(LOCALES)('%s: setLocale drives every formatter', (locale) => {
    reactive.setLocale(locale)
    expect(reactive.formatNumber(1234567.891)).toBe(new Intl.NumberFormat(locale).format(1234567.891))
    expect(reactive.formatCurrency(9.99, 'EUR')).toBe(new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(9.99))
    expect(reactive.formatDate(AT, { timeZone: 'UTC' })).toBe(
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(AT),
    )
  })
})
