import { formatBytes } from '../core'

const unitFmt = (unit: string, digits = 1, locale = 'en-US', unitDisplay: 'short' | 'long' | 'narrow' = 'short') =>
  new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay, maximumFractionDigits: digits })

const en = { locale: 'en-US' }

describe('formatBytes: decimal (1000 steps, SI units)', () => {
  it.each([
    [0, 'byte', 0],
    [1, 'byte', 1],
    [999, 'byte', 999],
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
    expect(formatBytes(0, en)).toBe(unitFmt('byte').format(0))
  })

  it('never shows 1000 of a unit: rounding that reaches the next step carries over', () => {
    expect(formatBytes(999_950, en)).toBe('1 MB')
    expect(formatBytes(999_999, en)).toBe('1 MB')
    expect(formatBytes(999.96, en)).toBe('1 kB')
    expect(formatBytes(999.4, en)).toBe(unitFmt('byte').format(999.4))
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

  it('huge values stay in the largest unit', () => {
    expect(formatBytes(1e18, en)).toBe(unitFmt('petabyte').format(1000))
    expect(formatBytes(Number.MAX_SAFE_INTEGER, en)).toBe(unitFmt('petabyte').format(Number.MAX_SAFE_INTEGER / 1e15))
    expect(formatBytes(10n ** 20n, en)).toBe(unitFmt('petabyte').format(1e5))
  })

  it('negative values keep their sign and pick the unit by magnitude', () => {
    expect(formatBytes(-1536, en)).toBe(unitFmt('kilobyte').format(-1.536))
    expect(formatBytes(-999.96, en)).toBe('-1 kB')
    expect(formatBytes(-0, en)).toBe(unitFmt('byte').format(-0))
  })

  it('fractional bytes', () => {
    expect(formatBytes(0.5, en)).toBe(unitFmt('byte').format(0.5))
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

describe('formatBytes: binary (1024 steps, IEC symbols)', () => {
  const bin = { ...en, binary: true }

  it.each([
    [1023, 'byte', 1023],
    [1024, 'KiB', 1],
    [1536, 'KiB', 1.5],
    [1024 ** 2, 'MiB', 1],
    [1024 ** 3 * 2.5, 'GiB', 2.5],
    [1024 ** 4, 'TiB', 1],
    [1024 ** 5, 'PiB', 1],
  ])('%d bytes -> %s', (bytes, unit, scaled) => {
    const out = formatBytes(bytes, bin)
    if (unit === 'byte') expect(out).toBe(unitFmt('byte').format(scaled))
    else expect(out).toBe(`${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(scaled)} ${unit}`)
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
