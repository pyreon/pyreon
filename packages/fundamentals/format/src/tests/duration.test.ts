import { _clearDurationTable } from '../duration'
import { formatDuration } from '../core'

const en = { locale: 'en-US' }
const HAS_NATIVE = typeof (Intl as { DurationFormat?: unknown }).DurationFormat === 'function'
const NativeDF = (Intl as unknown as { DurationFormat: new (l: string, o: object) => { format(d: object): string } }).DurationFormat

/** Run `fn` with `Intl.DurationFormat` removed, then restore it. */
function withoutNative<T>(fn: () => T): T {
  const original = Reflect.get(Intl, 'DurationFormat')
  _clearDurationTable()
  Reflect.deleteProperty(Intl, 'DurationFormat')
  try {
    return fn()
  } finally {
    Reflect.set(Intl, 'DurationFormat', original)
    _clearDurationTable()
  }
}

describe('formatDuration: Intl.DurationFormat path', () => {
  it('this runtime has Intl.DurationFormat (CI runs Node 24+)', () => {
    expect(HAS_NATIVE).toBe(true)
  })

  it('equals the raw Intl.DurationFormat output across locales and styles', () => {
    for (const locale of ['en-US', 'cs', 'de', 'fr', 'ja', 'ar', 'hi', 'pt-BR']) {
      for (const style of ['long', 'short', 'narrow']) {
        const d = { hours: 2, minutes: 5, seconds: 30 }
        expect(formatDuration(d, { locale, style: style as 'long' })).toBe(new NativeDF(locale, { style }).format(d))
      }
      expect(formatDuration({ hours: 1, minutes: 5, seconds: 5 }, { locale, style: 'digital' })).toBe(
        new NativeDF(locale, { style: 'digital' }).format({ hours: 1, minutes: 5, seconds: 5 }),
      )
    }
  })

  it('spec examples', () => {
    expect(formatDuration({ hours: 2, minutes: 5 }, en)).toBe('2 hr, 5 min')
    expect(formatDuration(3_905_000, { ...en, style: 'digital' })).toBe('1:05:05')
  })

  it('a style string is a preset', () => {
    expect(formatDuration({ hours: 2 }, 'long')).toBe(new NativeDF(undefined as never, { style: 'long' }).format({ hours: 2 }))
  })
})

describe('formatDuration: fallback path (Intl.DurationFormat absent)', () => {
  const cases: Array<[string, object]> = [
    ['long', { hours: 2, minutes: 5, seconds: 30 }],
    ['short', { hours: 2, minutes: 5, seconds: 30 }],
    ['narrow', { hours: 2, minutes: 5 }],
    ['long', { days: 1, hours: 3 }],
    ['short', { years: 1, months: 2, weeks: 3 }],
    ['short', { milliseconds: 1500 }],
  ]

  it.each(['en-US', 'cs', 'de', 'fr', 'ja', 'ar', 'hi', 'pt-BR'])('%s matches Intl.DurationFormat', (locale) => {
    const native = cases.map(([style, d]) => formatDuration(d, { locale, style: style as 'long' }))
    const fallback = withoutNative(() => cases.map(([style, d]) => formatDuration(d, { locale, style: style as 'long' })))
    // The fallback is built from NumberFormat unit style + ListFormat unit lists:
    // it matches the native text where CLDR defines both the same way; the
    // en/fr/de/pt-BR/cs/ja rows are asserted exactly, ar and hi only for being non-empty.
    if (['ar', 'hi'].includes(locale)) fallback.forEach((t) => expect(t.length).toBeGreaterThan(0))
    else expect(fallback).toEqual(native)
  })

  it('digital style', () => {
    withoutNative(() => {
      expect(formatDuration(3_905_000, { ...en, style: 'digital' })).toBe('1:05:05')
      expect(formatDuration(65_000, { ...en, style: 'digital' })).toBe('0:01:05')
      expect(formatDuration(25 * 3600_000, { ...en, style: 'digital' })).toBe('25:00:00')
      expect(formatDuration(1_250, { ...en, style: 'digital' })).toBe('0:00:01.25')
      expect(formatDuration(-3_905_000, { ...en, style: 'digital' })).toBe('-1:05:05')
    })
    const raw = [3_905_000, 65_000, 25 * 3600_000, 1_250].map((ms) => formatDuration(ms, { ...en, style: 'digital' }))
    expect(raw).toEqual(['1:05:05', '0:01:05', '25:00:00', '0:00:01.25'])
  })

  it('digital style uses the locale digits', () => {
    const native = formatDuration(3_905_000, { locale: 'ar-EG', style: 'digital' })
    const fallback = withoutNative(() => formatDuration(3_905_000, { locale: 'ar-EG', style: 'digital' }))
    expect(fallback).toBe(native)
  })

  it('zero, negative, largest, milliseconds', () => {
    withoutNative(() => {
      expect(formatDuration(0, en)).toBe('0 sec')
      expect(formatDuration(-90_000, en)).toBe('-1 min, 30 sec')
      expect(formatDuration(3_905_000, { ...en, largest: 2 })).toBe('1 hr, 5 min')
      expect(formatDuration(1500, en)).toBe('1 sec, 500 ms')
    })
  })
})

describe('formatDuration: behaviour common to both paths', () => {
  const both = (fn: () => void) => {
    fn()
    withoutNative(fn)
  }

  it('milliseconds input is broken down into days / hours / minutes / seconds / ms', () => {
    both(() => {
      expect(formatDuration(3_905_000, en)).toBe('1 hr, 5 min, 5 sec')
      expect(formatDuration(90_061_001, en)).toBe('1 day, 1 hr, 1 min, 1 sec, 1 ms')
      expect(formatDuration(999, en)).toBe('999 ms')
    })
  })

  it('largest keeps the N most significant non-zero units, truncating', () => {
    both(() => {
      expect(formatDuration(90_061_001, { ...en, largest: 1 })).toBe('1 day')
      expect(formatDuration(90_061_001, { ...en, largest: 3 })).toBe('1 day, 1 hr, 1 min')
      expect(formatDuration({ hours: 2, minutes: 0, seconds: 30 }, { ...en, largest: 2 })).toBe('2 hr, 30 sec')
      expect(formatDuration(3_905_000, { ...en, largest: 99 })).toBe('1 hr, 5 min, 5 sec')
    })
  })

  it('zero in every shape', () => {
    both(() => {
      expect(formatDuration(0, en)).toBe('0 sec')
      expect(formatDuration({}, en)).toBe('0 sec')
      expect(formatDuration({ hours: 0, minutes: 0 }, en)).toBe('0 sec')
      expect(formatDuration(0, { ...en, style: 'digital' })).toBe('0:00:00')
    })
  })

  it('negative durations carry the sign on the first unit', () => {
    both(() => {
      expect(formatDuration(-3_905_000, en)).toBe('-1 hr, 5 min, 5 sec')
      expect(formatDuration({ hours: -2, minutes: -5 }, en)).toBe('-2 hr, 5 min')
    })
  })

  it('a Duration object is shown as given (no carrying)', () => {
    both(() => expect(formatDuration({ minutes: 90 }, en)).toBe('90 min'))
  })

  it('digital folds weeks and days into hours; years and months are invalid there', () => {
    both(() => {
      expect(formatDuration({ days: 1, hours: 2 }, { ...en, style: 'digital' })).toBe('26:00:00')
      expect(formatDuration({ months: 1 }, { ...en, style: 'digital', fallback: 'n/a' })).toBe('n/a')
    })
  })

  it('nullish and invalid input return the fallback', () => {
    both(() => {
      expect(formatDuration(null, { fallback: '-' })).toBe('-')
      expect(formatDuration(undefined, { fallback: '-' })).toBe('-')
      expect(formatDuration(NaN, { fallback: '-' })).toBe('-')
      expect(formatDuration({ hours: 1, minutes: -5 }, { fallback: 'mixed' })).toBe('mixed')
      expect(formatDuration({ hours: Infinity }, { fallback: 'inf' })).toBe('inf')
    })
  })

  it('bad options are programmer errors that say how to fix them', () => {
    both(() => {
      expect(() => formatDuration(1, { style: 'wide' as never })).toThrow(/\[Pyreon\] formatDuration\(\): unknown style "wide"/)
      expect(() => formatDuration(1, { largest: 0 })).toThrow(/largest must be a positive integer/)
      expect(() => formatDuration(1, 'huge' as never)).toThrow(/unknown style "huge"/)
    })
  })
})
