// #4804: number formatters take decimal strings exactly, and formatCurrency / currencyFormatter take a Money.
// Every expected string is what `Intl` itself gives for the same input in this process.
import * as core from '../core'
import * as reactive from '../index'
import { _resetWarnings } from '../warn'

const en = { locale: 'en-US' }
const intl = (options: Intl.NumberFormatOptions, value: string, locale = 'en-US') => new Intl.NumberFormat(locale, options).format(value as `${number}`)
const eur = { style: 'currency', currency: 'EUR' } as const
const BIG = '12345678901234567.89'

let warn: { mock: { calls: unknown[][] }; mockRestore(): void }

beforeEach(() => {
  _resetWarnings()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => warn.mockRestore())

describe('decimal strings are formatted exactly by every number formatter', () => {
  it('formatCurrency: a decimal string, including one beyond a float', () => {
    expect(core.formatCurrency('9.99', 'EUR', en)).toBe('€9.99')
    expect(core.formatCurrency(BIG, 'EUR', en)).toBe(intl(eur, BIG))
    expect(core.formatCurrency(BIG, 'EUR', en)).toBe('€12,345,678,901,234,567.89')
    // As a number the same amount is already wrong: the string is the only exact input.
    expect(core.formatCurrency(Number(BIG), 'EUR', en)).not.toBe('€12,345,678,901,234,567.89')
    expect(core.formatCurrency('-0.5', 'EUR', en)).toBe(intl({ ...eur, signDisplay: 'negative' }, '-0.5'))
    expect(reactive.formatCurrency('9.99', 'EUR', en)).toBe('€9.99')
  })

  it('formatNumber, formatPercent, formatCompact, formatUnit, formatBytes, formatNumberToParts', () => {
    const long = '-12345678901234567890.123456789'
    expect(core.formatNumber(long, { ...en, maximumFractionDigits: 20 })).toBe(intl({ maximumFractionDigits: 20, signDisplay: 'negative' }, long))
    expect(core.formatNumber(long, { ...en, maximumFractionDigits: 20 })).toBe('-12,345,678,901,234,567,890.123456789')
    expect(core.formatPercent('0.25', en)).toBe('25%')
    expect(core.formatCompact('1500', en)).toBe(intl({ notation: 'compact', signDisplay: 'negative' }, '1500'))
    expect(core.formatUnit('5.5', 'meter', en)).toBe(intl({ style: 'unit', unit: 'meter', unitDisplay: 'short', signDisplay: 'negative' }, '5.5'))
    expect(core.formatBytes('2048', { ...en, binary: true })).toBe(core.formatBytes(2048, { ...en, binary: true }))
    expect(core.formatNumberToParts('1234.5', en).map((p) => p.value).join('')).toBe('1,234.5')
    expect(warn.mock.calls).toEqual([])
  })

  it('formatNumberRange orders decimal strings by value, not as text, and exactly beyond a float', () => {
    const range = (a: string, b: string) => new Intl.NumberFormat('en-US', { signDisplay: 'negative' }).formatRange(a as `${number}`, b as `${number}`)
    expect(core.formatNumberRange('10', '9.5', en)).toBe(range('9.5', '10'))
    expect(core.formatNumberRange('-2', '-10', en)).toBe(range('-10', '-2'))
    // Equal as floats, different as decimals.
    expect(core.formatNumberRange('12345678901234567.89', '12345678901234567.8', { ...en, maximumFractionDigits: 2 })).toBe(
      new Intl.NumberFormat('en-US', { signDisplay: 'negative', maximumFractionDigits: 2 }).formatRange('12345678901234567.8', '12345678901234567.89'),
    )
    expect(core.formatNumberRange('007.5', '7.25', en)).toBe(range('7.25', '007.5'))
  })
})

describe('a Money is formatted on its own, exactly, with its own digits', () => {
  it('formatCurrency(m) and formatCurrency(m, options)', () => {
    expect(core.formatCurrency({ amount: '9.99', currency: 'EUR' }, en)).toBe('€9.99')
    expect(core.formatCurrency({ amount: BIG, currency: 'EUR' }, en)).toBe('€12,345,678,901,234,567.89')
    expect(core.formatCurrency({ amount: '1234.50', currency: 'EUR' }, { locale: 'de' })).toBe(intl(eur, '1234.50', 'de'))
    expect(core.formatCurrency({ amount: '100', currency: 'JPY' }, en)).toBe('¥100')
    expect(core.formatCurrency({ amount: '0.123', currency: 'KWD' }, en)).toBe(intl({ style: 'currency', currency: 'KWD' }, '0.123'))
    expect(core.formatCurrency({ amount: '-9.99', currency: 'EUR' }, 'accounting')).toBe(
      new Intl.NumberFormat(undefined, { ...eur, currencySign: 'accounting' }).format('-9.99'),
    )
    expect(reactive.formatCurrency({ amount: '9.99', currency: 'EUR' }, en)).toBe('€9.99')
  })

  it('shows the Money\'s digits even when the platform would round the currency (#4803: ISK in hundredths, HUF on V8)', () => {
    const expected = intl({ style: 'currency', currency: 'ISK', minimumFractionDigits: 2, maximumFractionDigits: 2 }, '123.45')
    expect(core.formatCurrency({ amount: '123.45', currency: 'ISK' }, en)).toBe(expected)
    expect(expected).toContain('123.45')
    expect(core.formatCurrency({ amount: '100.00', currency: 'HUF' }, en)).toContain('100.00')
    // Options that set digits themselves win.
    expect(core.formatCurrency({ amount: '9.99', currency: 'EUR' }, { ...en, maximumFractionDigits: 0 })).toBe('€10')
  })

  it('a Money with a malformed amount or currency gives the fallback with a dev warning; a currency next to a Money is a mistake', () => {
    expect(core.formatCurrency({ amount: '9,99', currency: 'EUR' }, { ...en, fallback: '?' })).toBe('?')
    expect(core.formatCurrency({ amount: '9.99', currency: 'EURO' }, { ...en, fallback: '?' })).toBe('?')
    expect(warn.mock.calls.length).toBe(2)
    expect(() => (core.formatCurrency as (...args: unknown[]) => string)({ amount: '9.99', currency: 'EUR' }, 'EUR')).toThrow(
      /\[Pyreon\] formatCurrency.*a Money carries its currency/,
    )
  })

  it('currencyFormatter: a Money in its currency, with parts and ranges; another currency is the fallback', () => {
    const price = core.currencyFormatter('EUR', en)
    expect(price({ amount: '9.99', currency: 'EUR' })).toBe('€9.99')
    expect(price('9.99')).toBe('€9.99')
    expect(price.fallback('?')({ amount: '9.99', currency: 'USD' })).toBe('?')
    expect(warn.mock.calls[0]?.[0]).toMatch(/a Money in EUR/)
    expect(price.parts({ amount: '1234.50', currency: 'EUR' }).map((p) => p.value).join('')).toBe('€1,234.50')
    expect(price.range({ amount: '20.00', currency: 'EUR' }, { amount: '10.00', currency: 'EUR' })).toBe(
      new Intl.NumberFormat('en-US', { ...eur, signDisplay: 'negative', minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatRange('10.00', '20.00'),
    )
    const isk = core.currencyFormatter('ISK', en)
    expect(isk.range({ amount: '1.50', currency: 'ISK' }, { amount: '2.25', currency: 'ISK' })).toContain('2.25')
    expect(reactive.currencyFormatter('EUR', en)({ amount: '9.99', currency: 'EUR' })).toBe('€9.99')
  })

  it('createFormatter().currency takes both forms', () => {
    const f = reactive.createFormatter(en)
    expect(f.currency({ amount: '9.99', currency: 'EUR' })).toBe('€9.99')
    expect(f.currency('9.99', 'EUR')).toBe('€9.99')
    expect(f.currency({ amount: '9.99', currency: 'EUR' }, { locale: 'de' })).toBe(intl(eur, '9.99', 'de'))
  })
})
