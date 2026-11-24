import { formatBytes } from '../core'

const unitFmt = (unit: string, digits = 1, locale = 'en-US', unitDisplay: 'short' | 'long' | 'narrow' = 'short') =>
  new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay, maximumFractionDigits: digits })

const num = (n: number, digits = 1, locale = 'en-US') => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n)

const en = { locale: 'en-US' }

describe('formatBytes: decimal (1000 steps, SI units)', () => {
  it.each([
    [0, 0],
    [1, 1],
    [999, 999],
  ])('%d bytes is written with the symbol: "%s B"', (bytes, scaled) => {
    expect(formatBytes(bytes, en)).toBe(`${num(scaled)} B`)
  })

  it.each([
    [1000, 'kilobyte', 1],
    [1023, 'kilobyte', 1.023],
    [1024, 'kilobyte', 1.024],
    [1536, 'kilobyte', 1.536],
    [999_949, 'kilobyte', 999.949],
    [1e6, 'megabyte', 1],
    [2.5e9, 'gigabyte', 2.5],
    [1e12, 'terabyte', 1],
    [1e15, 'petabyte', 1],
  ])('%d bytes -> %s', (bytes, unit, scaled) => {
    expect(formatBytes(bytes, en)).toBe(unitFmt(unit).format(scaled))
  })

  it('spec examples', () => {
    expect(formatBytes(1536, en)).toBe('1.5 kB')
    expect(formatBytes(0, en)).toBe('0 B')
    expect(formatBytes(999, en)).toBe('999 B')
  })

  it('never shows 1000 of a unit: rounding that reaches the next step carries over', () => {
    expect(formatBytes(999_950, en)).toBe('1 MB')
    expect(formatBytes(999_999, en)).toBe('1 MB')
    expect(formatBytes(999.96, en)).toBe('1 kB')
    expect(formatBytes(999.4, en)).toBe('999.4 B')
    expect(formatBytes(999_949, en)).toBe('999.9 kB')
  })

  it('never shows 1024 kB-style values in either mode', () => {
    for (const binary of [false, true]) {
      for (let exp = 1; exp <= 5; exp++) {
        const base = binary ? 1024 : 1000
        const out = formatBytes(base ** exp - 1, { ...en, binary })
        expect(out).not.toMatch(/\b1[,]?(000|024)\b/)
      }
    }
  })

  it('negative values keep their sign and pick the unit by magnitude', () => {
    expect(formatBytes(-1536, en)).toBe(unitFmt('kilobyte').format(-1.536))
    expect(formatBytes(-999.96, en)).toBe('-1 kB')
    expect(formatBytes(-5, en)).toBe('-5 B')
    expect(formatBytes(-0, en)).toBe('0 B')
  })

  it('fractional bytes', () => {
    expect(formatBytes(0.5, en)).toBe('0.5 B')
    expect(formatBytes(1500.75, en)).toBe(unitFmt('kilobyte').format(1.50075))
  })

  it('options: digits, unitDisplay, locale', () => {
    expect(formatBytes(1536, { ...en, maximumFractionDigits: 0 })).toBe(unitFmt('kilobyte', 0).format(1.536))
    expect(formatBytes(1536, { ...en, maximumFractionDigits: 3 })).toBe(unitFmt('kilobyte', 3).format(1.536))
    expect(formatBytes(1536, { ...en, unitDisplay: 'long' })).toBe(unitFmt('kilobyte', 1, 'en-US', 'long').format(1.5))
    for (const locale of ['de', 'cs', 'fr', 'ja', 'ar', 'hi']) {
      expect(formatBytes(1_500_000, { locale })).toBe(unitFmt('megabyte', 1, locale).format(1.5))
    }
  })
})

describe('formatBytes: below one kilobyte reads like the units around it (item: bytes symbol)', () => {
  const LOCALES = ['en-US', 'en-GB', 'cs', 'de', 'fr', 'ja', 'ar', 'hi', 'pt-BR', 'ru', 'ko', 'he', 'th', 'es', 'zh']

  it.each(LOCALES)('%s: the byte count uses the locale\'s own kilobyte pattern with the byte symbol', (locale) => {
    const kilo = new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilobyte', unitDisplay: 'short', maximumFractionDigits: 1 })
    const kiloUnit = kilo.formatToParts(5).find((p) => p.type === 'unit')?.value ?? ''
    const narrowKilo = new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilobyte', unitDisplay: 'narrow' }).formatToParts(5).find((p) => p.type === 'unit')?.value ?? ''
    const byteSymbol = new Intl.NumberFormat(locale, { style: 'unit', unit: 'byte', unitDisplay: 'narrow' }).formatToParts(5).find((p) => p.type === 'unit')?.value ?? ''
    for (const n of [0, 1, 999]) {
      const out = formatBytes(n, { locale })
      if (kiloUnit.toLowerCase() === narrowKilo.toLowerCase()) {
        // A locale that writes short units as symbols: the byte count is that pattern with the symbol in the unit's place.
        const expected = kilo
          .formatToParts(5)
          .map((p) => (p.type === 'unit' ? byteSymbol : p.type === 'integer' ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n) : p.value))
          .join('')
        expect(out, `${locale} ${n}`).toBe(expected)
        expect(out).toContain(byteSymbol)
      } else {
        // A locale that writes short units as words (ar, he, th): Intl's own word for a byte, untouched.
        expect(out, `${locale} ${n}`).toBe(new Intl.NumberFormat(locale, { style: 'unit', unit: 'byte', unitDisplay: 'short', maximumFractionDigits: 1 }).format(n))
      }
    }
  })

  it('the symbol is in the kilobyte position and spacing of the locale (not English hard-coded)', () => {
    expect(formatBytes(999, { locale: 'en-US' })).toBe('999 B')
    expect(formatBytes(999, { locale: 'de' })).toBe('999 B')
    expect(formatBytes(999, { locale: 'fr' })).toBe(`999${formatBytes(5, { locale: 'fr' }).slice(1, 2)}o`)
    expect(formatBytes(999, { locale: 'ko' })).toBe('999byte')
    expect(formatBytes(999, { locale: 'ja' })).toMatch(/^999 B$/)
    expect(formatBytes(1536, { locale: 'ja' })).toBe(unitFmt('kilobyte', 1, 'ja').format(1.5))
  })

  it('binary mode below 1 KiB uses the symbol too', () => {
    expect(formatBytes(0, { ...en, binary: true })).toBe('0 B')
    expect(formatBytes(1023, { ...en, binary: true })).toBe('1,023 B')
    expect(formatBytes(1024, { ...en, binary: true })).toBe('1 KiB')
  })

  it('long keeps Intl\'s plural-correct words in every locale', () => {
    for (const locale of LOCALES) {
      for (const n of [0, 1, 2, 5, 999]) {
        expect(formatBytes(n, { locale, unitDisplay: 'long' }), `${locale} ${n}`).toBe(
          new Intl.NumberFormat(locale, { style: 'unit', unit: 'byte', unitDisplay: 'long', maximumFractionDigits: 1 }).format(n),
        )
      }
    }
    expect(formatBytes(999, { ...en, unitDisplay: 'long' })).toBe('999 bytes')
    expect(formatBytes(1, { ...en, unitDisplay: 'long' })).toBe('1 byte')
  })

  it('narrow stays Intl\'s narrow form', () => {
    expect(formatBytes(999, { ...en, unitDisplay: 'narrow' })).toBe('999B')
  })

  it('the parts of a small value carry the symbol', () => {
    expect(JSON.stringify(formatBytes(5, en))).toBe('"5 B"')
  })
})

describe('formatBytes: beyond petabytes', () => {
  it('SI: EB, ZB, YB from the locale\'s own petabyte unit text (symbols the number part does not depend on)', () => {
    expect(formatBytes(1e18, en)).toBe('1 EB')
    expect(formatBytes(1e21, en)).toBe('1 ZB')
    expect(formatBytes(1.5e24, en)).toBe('1.5 YB')
    expect(formatBytes(1e27, en)).toBe('1,000 YB')
    expect(formatBytes(1e21, { locale: 'de' })).toBe('1 ZB')
    // French writes octets (Po): the prefix letter is swapped, the suffix is the locale's
    expect(formatBytes(1e21, { locale: 'fr' }).replace(/\s/g, ' ')).toBe('1 Zo')
    expect(formatBytes(10n ** 20n, en)).toBe('100 EB')
  })

  it('binary: EiB, ZiB, YiB are language-neutral and always available', () => {
    expect(formatBytes(1024 ** 6, { ...en, binary: true })).toBe('1 EiB')
    expect(formatBytes(1024 ** 7, { locale: 'de', binary: true })).toBe('1 ZiB')
    expect(formatBytes(1024 ** 8, { locale: 'fr', binary: true }).replace(/\s/g, ' ')).toBe('1 YiB')
  })

  it('a locale whose petabyte text does not start with "P" (ru, ar) stops at petabytes, grouped', () => {
    expect(formatBytes(1e21, { locale: 'ru' })).toBe(new Intl.NumberFormat('ru', { style: 'unit', unit: 'petabyte', unitDisplay: 'short', maximumFractionDigits: 1 }).format(1e6))
  })

  it('long display never leaves petabytes (the unit word cannot be derived): grouped petabytes', () => {
    expect(formatBytes(1e21, { ...en, unitDisplay: 'long' })).toBe('1,000,000 petabytes')
  })

  it('rounding that reaches the next big unit carries over too', () => {
    expect(formatBytes(999.96e15, en)).toBe('1 EB')
  })
})

describe('formatBytes: binary (1024 steps, IEC symbols)', () => {
  const bin = { ...en, binary: true }

  it.each([
    [1024, 'KiB', 1],
    [1536, 'KiB', 1.5],
    [1024 ** 2, 'MiB', 1],
    [1024 ** 3 * 2.5, 'GiB', 2.5],
    [1024 ** 4, 'TiB', 1],
    [1024 ** 5, 'PiB', 1],
  ])('%d bytes -> %s', (bytes, unit, scaled) => {
    expect(formatBytes(bytes, bin)).toBe(`${num(scaled)} ${unit}`)
  })

  it('spec example', () => {
    expect(formatBytes(1536, bin)).toBe('1.5 KiB')
  })

  it('1023.99 KiB carries to 1 MiB', () => {
    expect(formatBytes(1024 * 1023.99, bin)).toBe('1 MiB')
  })

  it('keeps the locale number format and unit placement', () => {
    expect(formatBytes(1536, { locale: 'de', binary: true })).toBe('1,5 KiB')
    expect(formatBytes(1536, { locale: 'fr', binary: true, unitDisplay: 'narrow' })).toBe(
      unitFmt('kilobyte', 1, 'fr', 'narrow').format(1.5).replace(/kB|ko/, 'KiB'),
    )
  })
})

describe('formatBytes: bad input', () => {
  it('nullish returns the fallback', () => {
    expect(formatBytes(null, { fallback: '-' })).toBe('-')
    expect(formatBytes(undefined)).toBe('')
  })
  it('NaN and Infinity return the fallback', () => {
    expect(formatBytes(NaN, { fallback: '?' })).toBe('?')
    expect(formatBytes(Infinity, { fallback: '?' })).toBe('?')
  })
  it('a string preset is a programmer error', () => {
    expect(() => formatBytes(1, 'short' as never)).toThrow(/\[Pyreon\] formatBytes\(\): unknown preset/)
  })
})
