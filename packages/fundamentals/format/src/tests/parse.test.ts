import { formatDate, formatNumber, parseDate, parseNumber } from '../core'
import { _parseCacheSize } from '../parse'

const LOCALES = ['en-US', 'en-GB', 'cs', 'de', 'fr', 'ja', 'ar', 'ar-EG', 'ar-SA', 'hi', 'pt-BR', 'de-CH', 'sv', 'es', 'ru', 'pl', 'th-TH', 'fa', 'bn', 'ko', 'hu']
const VALUES = [0, 1, -1, 0.5, -0.25, 12, 123, 1234, 12345.5, 123456.789, 1234567.5, -1234567.891, 999999999.99, 0.001, 100000, 1000]

describe('parseNumber round trip: parseNumber(formatNumber(x)) === x', () => {
  describe.each(LOCALES)('%s', (locale) => {
    it('default grouping and decimals', () => {
      for (const x of VALUES) {
        const text = formatNumber(x, { locale })
        expect(parseNumber(text, { locale }), `${locale} ${JSON.stringify(text)}`).toBe(x)
      }
    })
    it('without grouping, with sign always, percent, compact-free currency', () => {
      for (const x of VALUES) {
        expect(parseNumber(formatNumber(x, { locale, useGrouping: false }), { locale })).toBe(x)
        expect(parseNumber(formatNumber(x, { locale, signDisplay: 'always' }), { locale })).toBe(x)
        expect(parseNumber(formatNumber(x, { locale, minimumFractionDigits: 3 }), { locale })).toBe(x)
      }
      for (const x of [0.42, 0.5, 1.25, -0.05]) {
        expect(parseNumber(formatNumber(x, { locale, style: 'percent', maximumFractionDigits: 2 }), { locale })).toBeCloseTo(x, 10)
      }
    })
  })

  it('a property sweep over random values and locales', () => {
    let seed = 12345
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let i = 0; i < 400; i++) {
      const locale = LOCALES[Math.floor(rnd() * LOCALES.length)] as string
      const x = Math.round((rnd() - 0.5) * 10 ** Math.floor(rnd() * 12) * 1000) / 1000
      const text = formatNumber(x, { locale })
      expect(parseNumber(text, { locale }), `${locale} ${text}`).toBe(Object.is(x, -0) ? 0 : x)
    }
  })

  it('actually exercises the Arabic-Indic, Devanagari-style and NBSP shapes', () => {
    expect(formatNumber(1234.5, { locale: 'ar-EG' })).toMatch(/[٠-٩]/)
    expect(formatNumber(1234567.5, { locale: 'cs' })).toContain(' ')
    expect(formatNumber(1234567.5, { locale: 'hi' })).toBe('12,34,567.5')
    expect(formatNumber(1234567.5, { locale: 'de-CH' })).toMatch(/['’]/)
    expect(formatNumber(-5, { locale: 'ar' })).toMatch(/؜|-/)
  })
})

describe('parseNumber: typed variants', () => {
  it('cs: plain space, NBSP and narrow NBSP all group', () => {
    for (const sep of [' ', ' ', ' ', ' ']) {
      expect(parseNumber(`1${sep}234${sep}567,5`, { locale: 'cs' })).toBe(1234567.5)
    }
    expect(parseNumber('1 234,5', { locale: 'cs' })).toBe(1234.5)
  })
  it('fr: narrow NBSP and plain space', () => {
    expect(parseNumber('1 234,5', { locale: 'fr' })).toBe(1234.5)
    expect(parseNumber('1 234,5', { locale: 'fr' })).toBe(1234.5)
  })
  it("de-CH: apostrophe (typed ') and typographic apostrophe group", () => {
    expect(parseNumber("1'234'567.5", { locale: 'de-CH' })).toBe(1234567.5)
    expect(parseNumber('1’234’567.5', { locale: 'de-CH' })).toBe(1234567.5)
  })
  it('en: minus sign variants, plus, surrounding space, no leading digit', () => {
    expect(parseNumber('-5', { locale: 'en-US' })).toBe(-5)
    expect(parseNumber('−5', { locale: 'en-US' })).toBe(-5)
    expect(parseNumber('+5', { locale: 'en-US' })).toBe(5)
    expect(parseNumber('  1,234.5  ', { locale: 'en-US' })).toBe(1234.5)
    expect(parseNumber('.5', { locale: 'en-US' })).toBe(0.5)
    expect(parseNumber('5.', { locale: 'en-US' })).toBe(5)
    expect(parseNumber('50%', { locale: 'en-US' })).toBe(0.5)
    expect(parseNumber('50 %', { locale: 'de' })).toBe(0.5)
  })
  it('digits of other scripts are read in any locale', () => {
    expect(parseNumber('١٢٣', { locale: 'en-US' })).toBe(123)
    expect(parseNumber('१२३', { locale: 'hi' })).toBe(123)
    expect(parseNumber('１２', { locale: 'ja' })).toBe(12)
    expect(parseNumber('۱۲', { locale: 'fa' })).toBe(12)
  })
  it('hi: Indian grouping and plain western grouping', () => {
    expect(parseNumber('12,34,567.5', { locale: 'hi' })).toBe(1234567.5)
    expect(parseNumber('1234567.5', { locale: 'hi' })).toBe(1234567.5)
  })
  it('no locale: the runtime default', () => {
    const sample = new Intl.NumberFormat().format(1234.5)
    expect(parseNumber(sample)).toBe(1234.5)
  })
})

describe('parseNumber: garbage is null', () => {
  it.each([
    '', ' ', 'abc', '12abc', 'abc12', '1,2,3', '1,23,456', '12,3456', ',123', '123,', '1.2.3', '--5', '5-', '1e5', 'Infinity', 'NaN', '$5', '1 2', '1,,234', '1,234,5', '0x10', '%', '-', '.', '١٢٣a',
  ])('%j', (garbage) => {
    expect(parseNumber(garbage, { locale: 'en-US' })).toBeNull()
  })
  it('a group separator used as a decimal is rejected, never guessed', () => {
    expect(parseNumber('1.5', { locale: 'de' })).toBeNull()
    expect(parseNumber('1,5', { locale: 'en-US' })).toBeNull()
  })
  it('non-strings are null', () => {
    expect(parseNumber(null)).toBeNull()
    expect(parseNumber(undefined)).toBeNull()
    expect(parseNumber(5 as never)).toBeNull()
  })
  it('an invalid locale tag falls back to the runtime default', () => {
    expect(parseNumber('1,234.5', { locale: 'en_US' })).toBe(1234.5)
  })
  it('symbol probes are bounded', () => {
    for (let i = 0; i < 200; i++) parseNumber('1', { locale: `en-u-x${i}-${'a'.repeat(i % 5 + 2)}` })
    expect(_parseCacheSize()).toBeLessThanOrEqual(64)
  })
})

const SHORT_LOCALES = ['en-US', 'en-GB', 'cs', 'de', 'fr', 'ja', 'ar', 'hi', 'pt-BR', 'es', 'ru', 'pl', 'sv', 'ko', 'hu', 'th-TH', 'zh-TW', 'nl', 'tr', 'it']
const DATES = ['2026-11-18', '2026-01-05', '2026-12-31', '2028-02-29', '2000-01-01', '1999-12-31', '2068-06-15', '1970-03-09']

describe('parseDate round trip: numeric forms of formatDate(..., short)', () => {
  describe.each(SHORT_LOCALES)('%s', (locale) => {
    it.each(DATES)('%s', (iso) => {
      // A two-digit Buddhist year is read as BE 25yy (CE 1957-2056).
      if (locale === 'th-TH' && iso > '2056') return
      const text = formatDate(iso, { locale, year: 'numeric', month: 'numeric', day: 'numeric' })
      expect(parseDate(text, { locale }), `${locale} ${JSON.stringify(text)}`).toBe(iso)
      const short = formatDate(iso, { locale, dateStyle: 'short' })
      expect(parseDate(short, { locale }), `${locale} short ${JSON.stringify(short)}`).toBe(iso)
    })
    it('2-digit day and month', () => {
      const text = formatDate('2026-03-04', { locale, year: 'numeric', month: '2-digit', day: '2-digit' })
      expect(parseDate(text, { locale })).toBe('2026-03-04')
    })
  })

  it('spec example: cs', () => {
    expect(parseDate('18. 11. 2026', { locale: 'cs' })).toBe('2026-11-18')
    expect(parseDate('18.11.2026', { locale: 'cs' })).toBe('2026-11-18')
    expect(parseDate('18. 11. 26', { locale: 'cs' })).toBe('2026-11-18')
  })

  it('order comes from the locale', () => {
    expect(parseDate('11/12/2026', { locale: 'en-US' })).toBe('2026-11-12')
    expect(parseDate('11/12/2026', { locale: 'en-GB' })).toBe('2026-12-11')
    expect(parseDate('2026/11/12', { locale: 'ja' })).toBe('2026-11-12')
  })

  it('ISO is accepted in any locale', () => {
    for (const locale of ['en-US', 'cs', 'ja', 'de']) expect(parseDate('2026-11-18', { locale })).toBe('2026-11-18')
  })

  it('rejects impossible dates', () => {
    expect(parseDate('31. 2. 2026', { locale: 'cs' })).toBeNull()
    expect(parseDate('2/30/2026', { locale: 'en-US' })).toBeNull()
    expect(parseDate('31/04/2026', { locale: 'en-GB' })).toBeNull()
    expect(parseDate('29/02/2027', { locale: 'en-GB' })).toBeNull()
    expect(parseDate('29/02/2028', { locale: 'en-GB' })).toBe('2028-02-29')
    expect(parseDate('0/1/2026', { locale: 'en-US' })).toBeNull()
    expect(parseDate('13/1/2026', { locale: 'en-US' })).toBeNull()
    expect(parseDate('1/32/2026', { locale: 'en-US' })).toBeNull()
    expect(parseDate('2026-02-30', { locale: 'cs' })).toBeNull()
  })

  it('two-digit years follow the POSIX %y rule: 00-68 is 20xx, 69-99 is 19xx', () => {
    expect(parseDate('1/2/00', { locale: 'en-US' })).toBe('2000-01-02')
    expect(parseDate('1/2/68', { locale: 'en-US' })).toBe('2068-01-02')
    expect(parseDate('1/2/69', { locale: 'en-US' })).toBe('1969-01-02')
    expect(parseDate('1/2/99', { locale: 'en-US' })).toBe('1999-01-02')
  })

  it('Buddhist-era years are converted (th-TH)', () => {
    expect(parseDate('18/11/2569', { locale: 'th-TH' })).toBe('2026-11-18')
    expect(parseDate('18/11/69', { locale: 'th-TH' })).toBe('2026-11-18')
  })

  it('garbage is null', () => {
    for (const bad of ['', 'abc', '18 November 2026', '1/2', '1/2/3/4', '1/2/202', '1//2026', 'Nov 18 2026', '18.11.20266', '١٨/١١', '1/2/20x6'] ) {
      expect(parseDate(bad, { locale: 'en-US' }), bad).toBeNull()
    }
    expect(parseDate(null)).toBeNull()
    expect(parseDate(undefined)).toBeNull()
    expect(parseDate(20260101 as never)).toBeNull()
  })

  it('digits of the locale are read (ar-EG)', () => {
    for (const locale of ['ar-EG']) {
      const text = formatDate('2026-11-18', { locale, year: 'numeric', month: 'numeric', day: 'numeric', calendar: 'gregory' })
      expect(parseDate(text, { locale })).toBe('2026-11-18')
    }
  })

  it('non-Gregorian default calendars other than Buddhist / Minguo are null, not a wrong date', () => {
    const text = formatDate('2026-11-18', { locale: 'fa', year: 'numeric', month: 'numeric', day: 'numeric' })
    expect(parseDate(text, { locale: 'fa' })).toBeNull()
  })
})
