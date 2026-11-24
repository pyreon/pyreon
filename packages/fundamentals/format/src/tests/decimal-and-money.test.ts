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

  // Literal expectations: V8's own formatRange turns string ends into doubles (`~12,345,678,901,234,567.11` for the first
  // case), JavaScriptCore does not, so an expectation built from Intl in-process would pass on wrong output in Node.
  it('formatNumberRange is exact beyond a float and orders by value, on every engine', () => {
    const two = { ...en, maximumFractionDigits: 2 }
    expect(core.formatNumberRange('12345678901234567.11', '12345678901234567.19', two)).toBe('12,345,678,901,234,567.11–12,345,678,901,234,567.19')
    expect(core.formatNumberRange('12345678901234567.19', '12345678901234567.11', two)).toBe('12,345,678,901,234,567.11–12,345,678,901,234,567.19')
    expect(core.formatNumberRange('12345678901234567.11', '12345678901234567.19', { locale: 'de', maximumFractionDigits: 2 })).toBe(
      '12.345.678.901.234.567,11–12.345.678.901.234.567,19',
    )
    // Equal at the formatter's precision: Intl's approximately form, with the exact digits.
    expect(core.formatNumberRange('12345678901234567.11', '12345678901234567.19', { ...en, maximumFractionDigits: 0 })).toBe('~12,345,678,901,234,567')
    expect(core.formatNumberRange('1.5', '12345678901234567.89', en)).toBe('1.5–12,345,678,901,234,567.89')
    expect(core.formatNumberRange('10', '9.5', en)).toBe('9.5–10')
    expect(core.formatNumberRange('-2', '-10', en)).toBe('-10 – -2')
    expect(core.formatNumberRange('007.5', '7.25', en)).toBe('7.25–7.5')
    expect(core.numberFormatter(two).range('12345678901234567.19', '12345678901234567.11')).toBe('12,345,678,901,234,567.11–12,345,678,901,234,567.19')
    expect(reactive.formatNumberRange('12345678901234567.19', '12345678901234567.11', two)).toBe('12,345,678,901,234,567.11–12,345,678,901,234,567.19')
  })

  it('mixed number, bigint and string ends equal as doubles are ordered exactly', () => {
    expect(core.formatNumberRange('9007199254740993', 9007199254740992, en)).toBe('9,007,199,254,740,992–9,007,199,254,740,993')
    expect(core.formatNumberRange(9007199254740992, '9007199254740993', en)).toBe('9,007,199,254,740,992–9,007,199,254,740,993')
    expect(core.formatNumberRange(9007199254740993n, '9007199254740992.5', { ...en, maximumFractionDigits: 1 })).toBe('9,007,199,254,740,992.5–9,007,199,254,740,993')
    expect(core.formatNumberRange('0.1', 0.1, { ...en, maximumFractionDigits: 20 })).toBe(core.formatNumberRange(0.1, '0.1', { ...en, maximumFractionDigits: 20 }))
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
    expect(core.formatCurrency({ amount: '9.99', currency: 'Euro' }, { ...en, fallback: '?' })).toBe('?')
    expect(warn.mock.calls.length).toBe(2)
    expect(() => (core.formatCurrency as (...args: unknown[]) => string)({ amount: '9.99', currency: 'EUR' }, 'EUR')).toThrow(
      /\[Pyreon\] formatCurrency.*a Money carries its currency/,
    )
  })

  it('a Money range is exact beyond a float, on every engine', () => {
    const big = (amount: string) => ({ amount, currency: 'EUR' })
    expect(core.currencyFormatter('EUR', en).range(big('12345678901234567.19'), big('12345678901234567.11'))).toBe(
      '€12,345,678,901,234,567.11 – €12,345,678,901,234,567.19',
    )
    expect(core.currencyFormatter('EUR', { locale: 'de' }).range(big('12345678901234567.19'), big('12345678901234567.11'))).toBe(
      '12.345.678.901.234.567,11–12.345.678.901.234.567,19 €',
    )
  })

  it('a custom currency code (what defineCurrency registers, such as USDT) is placed by the locale\'s own code pattern', () => {
    expect(core.formatCurrency({ amount: '1234.50', currency: 'USDT' }, en)).toBe('USDT 1,234.50')
    expect(core.formatCurrency({ amount: '1234.50', currency: 'USDT' }, { locale: 'de' })).toBe('1.234,50 USDT')
    expect(core.formatCurrency({ amount: '12345678901234567.891', currency: 'LOYALTY' }, en)).toBe('LOYALTY 12,345,678,901,234,567.891')
    expect(core.formatCurrency(5, 'PTS1', en)).toBe('PTS1 5.00')
    const usdt = core.currencyFormatter('USDT', en)
    expect(usdt({ amount: '2.50', currency: 'USDT' })).toBe('USDT 2.50')
    expect(usdt.parts({ amount: '2.50', currency: 'USDT' }).find((p) => p.type === 'currency')?.value).toBe('USDT')
    expect(usdt.range({ amount: '1.00', currency: 'USDT' }, { amount: '2.50', currency: 'USDT' })).toBe('USDT 1.00–2.50')
    expect(warn.mock.calls).toEqual([])
  })

  it('an amount with more fraction digits than the engine can show is the fallback with a dev warning, never a throw', () => {
    const long = { amount: `1.${'1'.repeat(101)}`, currency: 'EUR' }
    expect(core.formatCurrency(long, { ...en, fallback: '?' })).toBe('?')
    expect(core.currencyFormatter('EUR', { ...en, fallback: '?' })(long)).toBe('?')
    expect(core.currencyFormatter('EUR', en).parts(long)).toEqual([])
    expect(warn.mock.calls[0]?.[0]).toMatch(/at most 100 fraction digits/)
    expect(core.formatCurrency({ amount: `1.${'1'.repeat(30)}`, currency: 'EUR' }, en)).toBe(`€1.${'1'.repeat(30)}`)
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
