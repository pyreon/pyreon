/**
 * What people really type: a numpad dot in comma locales, money with its symbol, dates with month names.
 */
import { formatCurrency, formatDate, formatNumber, parseCurrency, parseDate, parseNumber } from '../core'

const NUMPAD_LOCALES = ['cs', 'fr', 'ru', 'pl', 'sk', 'uk', 'sv', 'fi', 'nb', 'hu', 'bg', 'lt', 'de', 'es', 'it', 'nl', 'pt-BR', 'tr', 'id', 'da', 'ro', 'en-US', 'ja']

describe('a lone dot is a decimal separator where the dot is not the group separator', () => {
  it.each(NUMPAD_LOCALES)('%s: the rule comes from Intl parts, not from a list', (locale) => {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5)
    const decimal = parts.find((p) => p.type === 'decimal')?.value
    const group = parts.find((p) => p.type === 'group')?.value
    const dotIsDecimalToo = decimal === ',' && group !== '.'
    expect(parseNumber('1234.5', { locale }), `${locale} decimal=${decimal} group=${JSON.stringify(group)}`).toBe(dotIsDecimalToo || decimal === '.' ? 1234.5 : null)
  })

  it('cs, fr, ru, pl accept it; de, es, it, nl, pt-BR never do (the dot groups there)', () => {
    for (const locale of ['cs', 'fr', 'ru', 'pl']) {
      expect(parseNumber('1234.5', { locale })).toBe(1234.5)
      expect(parseNumber('0.5', { locale })).toBe(0.5)
      expect(parseNumber('-12.25', { locale })).toBe(-12.25)
      expect(parseNumber('.5', { locale })).toBe(0.5)
    }
    for (const locale of ['de', 'es', 'it', 'nl', 'pt-BR']) {
      expect(parseNumber('1.234', { locale })).toBe(1234)
      expect(parseNumber('1.5', { locale })).toBeNull()
      expect(parseNumber('1234.5', { locale })).toBeNull()
    }
  })

  it('mixing is still rejected: two dots, or a dot after a comma decimal', () => {
    expect(parseNumber('1.234.5', { locale: 'cs' })).toBeNull()
    expect(parseNumber('1,5.5', { locale: 'cs' })).toBeNull()
    expect(parseNumber('1 234.5', { locale: 'cs' })).toBe(1234.5)
  })

  it('the locale\'s own form still parses', () => {
    for (const locale of ['cs', 'fr', 'ru', 'pl']) expect(parseNumber(formatNumber(1234567.25, { locale }), { locale })).toBe(1234567.25)
  })
})

const CURRENCIES = ['EUR', 'USD', 'JPY', 'CZK', 'GBP', 'CHF', 'INR']
const LOCALES = ['en-US', 'en-GB', 'cs', 'de', 'fr', 'ja', 'ar', 'hi', 'pt-BR', 'es', 'ru', 'sv']

describe('parseCurrency', () => {
  it('spec examples', () => {
    expect(parseCurrency('€9.99', 'EUR', { locale: 'en-US' })).toBe(9.99)
    expect(parseCurrency('9,99 €', 'EUR', { locale: 'de' })).toBe(9.99)
    expect(parseCurrency('1 234,50 Kč', 'CZK', { locale: 'cs' })).toBe(1234.5)
    expect(parseCurrency('$1,234.50', 'USD', { locale: 'en-US' })).toBe(1234.5)
    expect(parseCurrency('-$5.00', 'USD', { locale: 'en-US' })).toBe(-5)
    expect(parseCurrency('($5.00)', 'USD', { locale: 'en-US' })).toBe(-5)
    expect(parseCurrency('EUR 9.99', 'EUR', { locale: 'en-US' })).toBe(9.99)
    expect(parseCurrency('9.99 euros', 'EUR', { locale: 'en-US' })).toBe(9.99)
    expect(parseCurrency('9.99', 'EUR', { locale: 'en-US' })).toBe(9.99)
  })

  it('round trip: parseCurrency(formatCurrency(x)) === x across locales, currencies and displays', () => {
    for (const locale of LOCALES) {
      for (const currency of CURRENCIES) {
        for (const currencyDisplay of ['symbol', 'narrowSymbol', 'code', 'name'] as const) {
          for (const x of [0, 5, 9.99, 1234.5, -9.99, -1234.5, 1_000_000]) {
            const maximumFractionDigits = currency === 'JPY' ? 0 : 2
            const text = formatCurrency(x, currency, { locale, currencyDisplay, maximumFractionDigits })
            const rounded = (Math.sign(x) * Math.round(Math.abs(x) * 10 ** maximumFractionDigits)) / 10 ** maximumFractionDigits
            expect(parseCurrency(text, currency, { locale }), `${locale} ${currency} ${currencyDisplay} ${JSON.stringify(text)}`).toBe(rounded === 0 ? 0 : rounded)
          }
        }
      }
    }
  })

  it('accounting parentheses', () => {
    for (const locale of ['en-US', 'ja', 'de', 'fr']) {
      const text = formatCurrency(-12.5, 'USD', { locale, currencySign: 'accounting' })
      expect(parseCurrency(text, 'USD', { locale }), `${locale} ${text}`).toBe(-12.5)
    }
  })

  it('another currency\'s symbol, text and garbage are null', () => {
    expect(parseCurrency('€9.99', 'USD', { locale: 'en-US' })).toBeNull()
    expect(parseCurrency('9.99 dollars', 'EUR', { locale: 'en-US' })).toBeNull()
    expect(parseCurrency('€', 'EUR', { locale: 'en-US' })).toBeNull()
    expect(parseCurrency('', 'EUR', { locale: 'en-US' })).toBeNull()
    expect(parseCurrency('€ 9.99 €', 'EUR', { locale: 'en-US' })).toBeNull()
    expect(parseCurrency('abc', 'EUR', { locale: 'en-US' })).toBeNull()
    expect(parseCurrency(null, 'EUR')).toBeNull()
    expect(parseCurrency(undefined, 'EUR')).toBeNull()
    expect(parseCurrency('€9.99', '' as never)).toBeNull()
    expect(parseCurrency('€9.99', 5 as never)).toBeNull()
    expect(parseCurrency(9.99 as never, 'EUR')).toBeNull()
  })

  it('an invalid currency code or locale degrades: only the number is read', () => {
    expect(parseCurrency('9.99', 'EURO', { locale: 'en-US' })).toBe(9.99)
    expect(parseCurrency('€9.99', 'EUR', { locale: 'en_US' })).toBe(9.99)
  })
})

const DATES = ['2026-11-18', '2026-01-05', '2026-12-31', '2028-02-29', '2000-03-09', '1999-12-31', '2026-05-01', '2026-09-30']
const DATE_LOCALES = ['en-US', 'en-GB', 'cs', 'de', 'fr', 'ja', 'ar', 'hi', 'pt-BR', 'es', 'ru', 'pl', 'sv', 'ko', 'hu', 'th-TH', 'zh-TW', 'nl', 'tr', 'it', 'fi', 'bg', 'da', 'uk', 'el', 'he', 'id', 'vi']

describe('parseDate: the locale\'s own short, medium and long forms (month names from Intl)', () => {
  describe.each(DATE_LOCALES)('%s', (locale) => {
    it.each(['short', 'medium', 'long'] as const)('round trip: dateStyle %s', (dateStyle) => {
      for (const iso of DATES) {
        // A two-digit year is read by the stated rule (00-68 is 20xx), so the short form round-trips 1969-2068 only.
        if (dateStyle === 'short' && iso < '2000' && iso >= '1969') continue
        const text = formatDate(iso, { locale, dateStyle })
        if (locale === 'th-TH' && dateStyle === 'short' && iso > '2056') continue
        expect(parseDate(text, { locale }), `${locale} ${dateStyle} ${JSON.stringify(text)}`).toBe(iso)
      }
    })
  })

  it('spec examples', () => {
    expect(parseDate('Nov 18, 2026', { locale: 'en-US' })).toBe('2026-11-18')
    expect(parseDate('November 18, 2026', { locale: 'en-US' })).toBe('2026-11-18')
    expect(parseDate('18 Nov 2026', { locale: 'en-GB' })).toBe('2026-11-18')
    expect(parseDate('18. listopadu 2026', { locale: 'cs' })).toBe('2026-11-18')
    expect(parseDate('18. LISTOPADU 2026', { locale: 'cs' })).toBe('2026-11-18')
    expect(parseDate('18. listopad 2026', { locale: 'cs' })).toBe('2026-11-18')
    expect(parseDate('18 nov. 2026', { locale: 'fr' })).toBe('2026-11-18')
    expect(parseDate('18 NOV 2026', { locale: 'fr' })).toBe('2026-11-18')
    expect(parseDate('2026年11月18日', { locale: 'ja' })).toBe('2026-11-18')
  })

  it('month names are case-insensitive, with or without the trailing dot, short or long, genitive or not', () => {
    for (const text of ['18 nov 2026', '18 Nov. 2026', '18 NOV. 2026', '18 november 2026', '18 NOVEMBER 2026', 'Nov 18 2026', '2026 Nov 18']) {
      expect(parseDate(text, { locale: 'en-GB' }), text).toBe('2026-11-18')
    }
  })

  it('impossible dates and unknown words are still rejected', () => {
    expect(parseDate('Feb 30, 2026', { locale: 'en-US' })).toBeNull()
    expect(parseDate('Nov 31, 2026', { locale: 'en-US' })).toBeNull()
    expect(parseDate('Foo 18, 2026', { locale: 'en-US' })).toBeNull()
    expect(parseDate('Nov 18', { locale: 'en-US' })).toBeNull()
    expect(parseDate('Nov Dec 18, 2026', { locale: 'en-US' })).toBeNull()
    expect(parseDate('Nov 18, 2026 12:30', { locale: 'en-US' })).toBeNull()
    expect(parseDate('Nov 1800, 2026', { locale: 'en-US' })).toBeNull()
    expect(parseDate('Sat, Nov 18, 2026', { locale: 'en-US' })).toBeNull()
  })

  it('an ambiguous abbreviation is dropped rather than guessed', () => {
    // "mar" is March and a Spanish word for sea: months are the only words read, but two months must never share a name
    for (const locale of DATE_LOCALES) {
      const text = formatDate('2026-03-05', { locale, dateStyle: 'medium' })
      expect(parseDate(text, { locale }), `${locale} ${text}`).toBe('2026-03-05')
    }
  })
})

describe('what is NOT parsed (documented)', () => {
  it('compact notation, scientific notation and natural language', () => {
    expect(parseNumber('1.2M', { locale: 'en-US' })).toBeNull()
    expect(parseNumber('1.2K', { locale: 'en-US' })).toBeNull()
    expect(parseNumber('1e3', { locale: 'en-US' })).toBeNull()
    expect(parseNumber('1E3', { locale: 'en-US' })).toBeNull()
    expect(parseDate('next Friday', { locale: 'en-US' })).toBeNull()
    expect(parseDate('tomorrow', { locale: 'en-US' })).toBeNull()
    expect(parseDate('yesterday', { locale: 'en-US' })).toBeNull()
    expect(parseCurrency('1.2M €', 'EUR', { locale: 'en-US' })).toBeNull()
  })
})
