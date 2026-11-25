/**
 * Formatters as values: a built formatter prints exactly what the equivalent
 * free-function call prints (across the locale matrix, through both entries),
 * and the derivation methods compose.
 */
import * as core from '../core'
import * as reactive from '../index'
import { resetLocaleState } from '../locale'
import { clearAllTables } from './helpers'

const LOCALES = ['en-US', 'en-GB', 'cs', 'de', 'fr', 'ja', 'ar', 'hi', 'pt-BR']
const AT = Date.UTC(2026, 10, 18, 14, 30)

afterEach(() => {
  resetLocaleState()
  clearAllTables()
})

describe.each([['core', core], ['reactive', reactive]] as const)('a built formatter equals the free function (%s)', (_name, f) => {
  describe.each(LOCALES)('%s', (locale) => {
    it('number-style kinds', () => {
      for (const n of [0, 1, -1, 0.5, 1234.5678, -98765.4321, 1_240_000, 42n]) {
        expect(f.numberFormatter({ locale })(n)).toBe(f.formatNumber(n, { locale }))
        expect(f.numberFormatter({ locale, maximumFractionDigits: 0 })(n)).toBe(f.formatNumber(n, { locale, maximumFractionDigits: 0 }))
        expect(f.currencyFormatter('EUR', { locale })(n)).toBe(f.formatCurrency(n, 'EUR', { locale }))
        expect(f.currencyFormatter('USD', { locale, currencyDisplay: 'code' })(n)).toBe(f.formatCurrency(n, 'USD', { locale, currencyDisplay: 'code' }))
        expect(f.percentFormatter({ locale })(n)).toBe(f.formatPercent(n, { locale }))
        expect(f.compactFormatter({ locale })(n)).toBe(f.formatCompact(n, { locale }))
        expect(f.unitFormatter('kilometer-per-hour', { locale })(n)).toBe(f.formatUnit(n, 'kilometer-per-hour', { locale }))
        expect(f.bytesFormatter({ locale })(n)).toBe(f.formatBytes(n, { locale }))
        expect(f.bytesFormatter({ locale, binary: true })(n)).toBe(f.formatBytes(n, { locale, binary: true }))
      }
    })

    it('presets', () => {
      expect(f.numberFormatter({ locale, ...{} })(1234.5)).toBe(f.formatNumber(1234.5, { locale }))
      expect(f.compactFormatter('long')(1_240_000)).toBe(f.compactFormatter({ compactDisplay: 'long' })(1_240_000))
      expect(f.currencyFormatter('EUR', 'code')(5)).toBe(f.currencyFormatter('EUR', { currencyDisplay: 'code' })(5))
      expect(f.unitFormatter('meter', 'long')(5)).toBe(f.unitFormatter('meter', { unitDisplay: 'long' })(5))
      expect(f.numberFormatter('integer')(1234.5)).toBe(f.numberFormatter({ maximumFractionDigits: 0 })(1234.5))
    })

    it('duration and list', () => {
      for (const v of [{ hours: 2, minutes: 5 }, 3_905_000, 0, -90_000]) {
        for (const style of ['long', 'short', 'narrow', 'digital'] as const) {
          expect(f.durationFormatter({ locale, style })(v)).toBe(f.formatDuration(v, { locale, style }))
        }
      }
      expect(f.durationFormatter('narrow')(3_905_000)).toBe(f.durationFormatter({ style: 'narrow' })(3_905_000))
      for (const items of [['a'], ['a', 'b'], ['a', 'b', 'c']]) {
        expect(f.listFormatter({ locale })(items)).toBe(f.formatList(items, { locale }))
        expect(f.listFormatter({ locale, type: 'disjunction' })(items)).toBe(f.formatList(items, { locale, type: 'disjunction' }))
      }
      expect(f.listFormatter('or')(['a', 'b'])).toBe(f.formatList(['a', 'b'], 'or'))
    })

    it('date-style kinds, calendar strings and instants', () => {
      const timeZone = 'Asia/Tokyo'
      for (const v of [AT, new Date(AT), '2026-11-18', '2026-11-18T14:30', '2026-11-18T14:30:00Z']) {
        expect(f.dateFormatter({ locale, timeZone })(v)).toBe(f.formatDate(v, { locale, timeZone }))
        expect(f.timeFormatter({ locale, timeZone })(v)).toBe(f.formatTime(v, { locale, timeZone }))
        expect(f.dateTimeFormatter({ locale, timeZone })(v)).toBe(f.formatDateTime(v, { locale, timeZone }))
        expect(f.dateFormatter({ locale, timeZone, dateStyle: 'full' })(v)).toBe(f.formatDate(v, { locale, timeZone, dateStyle: 'full' }))
      }
      for (const style of ['short', 'medium', 'long', 'full'] as const) {
        expect(f.dateFormatter({ locale, timeZone: 'UTC' })(AT)).toBe(f.formatDate(AT, { locale, timeZone: 'UTC' }))
        expect(f.dateFormatter(style)(AT)).toBe(f.formatDate(AT, style))
        expect(f.timeFormatter(style)(AT)).toBe(f.formatTime(AT, style))
        expect(f.dateTimeFormatter(style)(AT)).toBe(f.formatDateTime(AT, style))
      }
    })

    it('relative against a base', () => {
      const base = AT
      for (const target of [base + 5 * 60000, base - 86400000, base + 3 * 3600000, base - 20_000, base, '2026-11-17']) {
        expect(f.relativeFormatter({ locale, base })(target)).toBe(f.formatRelativeTo(target, base, { locale }))
      }
      expect(f.relativeFormatter({ locale, base, numeric: 'always' })(base - 86400000)).toBe(f.formatRelativeTo(base - 86400000, base, { locale, numeric: 'always' }))
    })

    it('range and parts', () => {
      const price = f.currencyFormatter('EUR', { locale })
      expect(price.range(10, 20)).toBe(new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).formatRange(10, 20))
      expect(price.parts(1234.5)).toEqual(new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).formatToParts(1234.5))
      expect(f.numberFormatter({ locale }).range(3, 5)).toBe(f.formatNumberRange(3, 5, { locale }))
      expect(f.numberFormatter({ locale }).parts(1234.5)).toEqual(f.formatNumberToParts(1234.5, { locale }))
      const day = f.dateFormatter({ locale, timeZone: 'UTC' })
      expect(day.range('2026-11-12', '2026-11-15')).toBe(f.formatDateRange('2026-11-12', '2026-11-15', { locale }))
      expect(day.range(AT, AT + 3 * 86400000)).toBe(f.formatDateRange(AT, AT + 3 * 86400000, { locale, timeZone: 'UTC' }))
      expect(day.parts(AT)).toEqual(new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).formatToParts(AT))
      expect(f.listFormatter({ locale }).parts(['a', 'b'])).toEqual(new Intl.ListFormat(locale).formatToParts(['a', 'b']))
      expect('parts' in f.relativeFormatter({ locale, base: AT })).toBe(false)
      expect('range' in f.listFormatter({ locale })).toBe(false)
      expect('parts' in f.durationFormatter({ locale })).toBe(false)
    })

    it('bytes parts carry the IEC unit', () => {
      const parts = f.bytesFormatter({ locale, binary: true }).parts(1536)
      expect(parts.map((p) => p.value).join('')).toBe(f.formatBytes(1536, { locale, binary: true }))
      expect(parts.find((p) => p.type === 'unit')?.value).toBe('KiB')
    })
  })
})

describe('derivation', () => {
  const en = { locale: 'en-US' } as const
  const price = core.currencyFormatter('EUR', en)

  it('with merges options and leaves the original untouched', () => {
    const rounded = price.with({ maximumFractionDigits: 0 })
    expect(rounded(9.99)).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(9.99))
    expect(price(9.99)).toBe('€9.99')
    expect(rounded).not.toBe(price)
    expect(price.options).toEqual({ locale: 'en-US', currency: 'EUR' })
    expect(rounded.options).toEqual({ locale: 'en-US', currency: 'EUR', maximumFractionDigits: 0 })
  })

  it('options are frozen, and a caller mutating its own object changes nothing', () => {
    const opts = { locale: 'en-US', maximumFractionDigits: 1 }
    const f = core.numberFormatter(opts)
    opts.maximumFractionDigits = 3
    expect(f(1.23456)).toBe('1.2')
    expect(Object.isFrozen(f.options)).toBe(true)
  })

  it('with of with: later overrides win, earlier ones are kept', () => {
    const a = price.with({ maximumFractionDigits: 0 }).with({ currencyDisplay: 'code' })
    expect(a.options).toEqual({ locale: 'en-US', currency: 'EUR', maximumFractionDigits: 0, currencyDisplay: 'code' })
    expect(a(9.99)).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, currencyDisplay: 'code' }).format(9.99))
    expect(price.with({ maximumFractionDigits: 0 }).with({ maximumFractionDigits: 2 })(9.99)).toBe('€9.99')
  })

  it('with can change the currency and unset an option with undefined', () => {
    expect(price.with({ currency: 'USD' })(5)).toBe('$5.00')
    expect(price.with({ maximumFractionDigits: 0 }).with({ maximumFractionDigits: undefined })(9.99)).toBe('€9.99')
    expect('maximumFractionDigits' in price.with({ maximumFractionDigits: 0 }).with({ maximumFractionDigits: undefined }).options).toBe(false)
  })

  it('order independence: with and fallback commute, and from commutes with both', () => {
    const cents = (c: number) => c / 100
    const one = price.with({ maximumFractionDigits: 0 }).fallback('-').from(cents)
    const two = price.from(cents).fallback('-').with({ maximumFractionDigits: 0 })
    const three = price.fallback('-').from(cents).with({ maximumFractionDigits: 0 })
    for (const v of [999, 12345, null, undefined, Number.NaN]) {
      expect(one(v as number)).toBe(two(v as number))
      expect(two(v as number)).toBe(three(v as number))
    }
    expect(one.options).toEqual(two.options)
  })

  it('from adapts the input and chains (the last map runs first)', () => {
    const fromCents = price.from((c: number) => c / 100)
    expect(fromCents(999)).toBe('€9.99')
    const fromRow = fromCents.from((row: { total: number }) => row.total)
    expect(fromRow({ total: 1250 })).toBe('€12.50')
    expect([{ total: 100 }, { total: 250 }].map(fromRow)).toEqual(['€1.00', '€2.50'])
    const seconds = core.durationFormatter({ locale: 'en-US', style: 'narrow' }).from((s: number) => s * 1000)
    expect(seconds(3905)).toBe('1h 5m 5s')
  })

  it('from adapts range and parts too', () => {
    const fromCents = price.from((c: number) => c / 100)
    expect(fromCents.range(1000, 2000)).toBe(price.range(10, 20))
    expect(fromCents.parts(999)).toEqual(price.parts(9.99))
  })

  it('with after from keeps the adapter', () => {
    const f = price.from((c: number) => c / 100).with({ maximumFractionDigits: 0 })
    expect(f(1250)).toBe(price.with({ maximumFractionDigits: 0 })(12.5))
  })

  it('fallback sets what nullish and invalid input render as', () => {
    const f = price.fallback('n/a')
    expect(f(null)).toBe('n/a')
    expect(f(undefined)).toBe('n/a')
    expect(f(Number.NaN)).toBe('n/a')
    expect(f.options.fallback).toBe('n/a')
    expect(price(null)).toBe('')
    expect(core.dateFormatter(en).fallback('?')('garbage')).toBe('?')
    expect(core.listFormatter(en).fallback('none')([])).toBe('none')
    expect(core.durationFormatter(en).fallback('-')(null)).toBe('-')
    expect(core.bytesFormatter(en).fallback('-')(Infinity)).toBe('-')
    expect(core.relativeFormatter({ ...en, base: AT }).fallback('?')('garbage')).toBe('?')
    expect(price.range(null, 5)).toBe('')
    expect(price.parts(null)).toEqual([])
  })

  it('invalid input warns once in dev and never throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(core.numberFormatter(en)('x' as never)).toBe('')
    expect(core.currencyFormatter('Euro', en)(5)).toBe('')
    expect(core.dateFormatter(en)('2026-02-30')).toBe('')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('programmer errors throw [Pyreon] errors', () => {
    expect(() => core.unitFormatter('furlong' as never)(1)).toThrow(/\[Pyreon\]/)
    expect(() => core.numberFormatter('weird' as never)).toThrow(/\[Pyreon\] numberFormatter\(\): unknown preset/)
    expect(() => core.unitFormatter('' as never)).toThrow(/the unit must be a string/)
    expect(() => core.durationFormatter({ largest: 0 })(1)).toThrow(/largest must be a positive integer/)
  })

  it('null options mean no options', () => {
    expect(core.numberFormatter(undefined)(1234.5)).toBe(new Intl.NumberFormat().format(1234.5))
  })

  it('works as a callback: Array#map passes the index as a second argument and it is ignored', () => {
    const f = core.numberFormatter({ locale: 'en-US' })
    expect([1000, 2000].map(f)).toEqual(['1,000', '2,000'])
  })

  it('formatters compose with each other through plain values', () => {
    const size = core.bytesFormatter({ locale: 'en-US' })
    const pct = core.percentFormatter({ locale: 'en-US' })
    const usage = (used: number, total: number) => `${size(used)} of ${size(total)} (${pct(used / total)})`
    expect(usage(1536, 4096)).toBe('1.5 kB of 4.1 kB (38%)')
    expect(core.listFormatter({ locale: 'en-US' })([1250, 2500].map(price.from((c: number) => c / 100)))).toBe('€12.50 and €25.00')
  })

  it('the relative formatter reads a base accessor on every call', () => {
    let now = AT
    const rel = core.relativeFormatter({ locale: 'en-US', base: () => now })
    expect(rel(AT + 5 * 60000)).toBe('in 5 minutes')
    now = AT + 5 * 60000
    expect(rel(AT + 5 * 60000)).toBe('now')
  })

  it('a relative formatter without a base warns and returns the fallback', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(core.relativeFormatter({ locale: 'en-US' } as never)(AT)).toBe('')
    warn.mockRestore()
  })
})
