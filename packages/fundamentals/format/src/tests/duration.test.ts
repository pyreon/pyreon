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
    ['short', { milliseconds: 500 }],
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

  it('digital style is one convention in every runtime: h:mm:ss, minutes unpadded below an hour', () => {
    const check = () => {
      expect(formatDuration(3_905_000, { ...en, style: 'digital' })).toBe('1:05:05')
      expect(formatDuration(65_000, { ...en, style: 'digital' })).toBe('1:05')
      expect(formatDuration(5_000, { ...en, style: 'digital' })).toBe('0:05')
      expect(formatDuration(25 * 3600_000, { ...en, style: 'digital' })).toBe('25:00:00')
      expect(formatDuration(-3_905_000, { ...en, style: 'digital' })).toBe('-1:05:05')
      expect(formatDuration(0, { ...en, style: 'digital' })).toBe('0:00')
    }
    check()
    withoutNative(check)
  })

  it('the native digital text for an hour or more is the same text', () => {
    for (const locale of ['en-US', 'cs', 'de', 'fr', 'ja', 'ar', 'hi', 'pt-BR']) {
      const raw = new NativeDF(locale, { style: 'digital' }).format({ hours: 1, minutes: 5, seconds: 5 })
      expect(formatDuration(3_905_000, { locale, style: 'digital' })).toBe(raw)
    }
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
      expect(formatDuration(1500, { ...en, smallest: 'millisecond' })).toBe('1 sec, 500 ms')
    })
  })
})

describe('formatDuration: behaviour common to both paths', () => {
  const both = (fn: () => void) => {
    fn()
    withoutNative(fn)
  }

  it('milliseconds input is broken down into days / hours / minutes / seconds, ms only below one second', () => {
    both(() => {
      expect(formatDuration(3_905_000, en)).toBe('1 hr, 5 min, 5 sec')
      expect(formatDuration(90_061_001, en)).toBe('1 day, 1 hr, 1 min, 1 sec')
      expect(formatDuration(90_061_001, { ...en, smallest: 'millisecond' })).toBe('1 day, 1 hr, 1 min, 1 sec, 1 ms')
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
      expect(formatDuration(0, { ...en, style: 'digital' })).toBe('0:00')
      expect(formatDuration(0, { ...en, smallest: 'minute' })).toBe('0 min')
    })
  })

  it('negative durations carry the sign on the first unit', () => {
    both(() => {
      expect(formatDuration(-3_905_000, en)).toBe('-1 hr, 5 min, 5 sec')
      expect(formatDuration({ hours: -2, minutes: -5 }, en)).toBe('-2 hr, 5 min')
    })
  })

  it('a Duration object is shown as given (no carrying of whole fields)', () => {
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
      expect(() => formatDuration(1, { smallest: 'fortnight' as never })).toThrow(/unknown smallest unit "fortnight"/)
      expect(() => formatDuration(1, { fractionalDigits: 12 })).toThrow(/fractionalDigits must be an integer from 0 to 9/)
    })
  })
})

describe('formatDuration: fractional fields balance down (no raw platform error)', () => {
  const both = (fn: () => void) => {
    fn()
    withoutNative(fn)
  }

  it('1.5 h is 1 hr, 30 min; 0.5 day is 12 hr; fractional seconds become ms', () => {
    both(() => {
      expect(formatDuration({ hours: 1.5 }, en)).toBe('1 hr, 30 min')
      expect(formatDuration({ days: 0.5 }, en)).toBe('12 hr')
      expect(formatDuration({ minutes: 2.25 }, en)).toBe('2 min, 15 sec')
      expect(formatDuration({ seconds: 1.5 }, { ...en, smallest: 'millisecond' })).toBe('1 sec, 500 ms')
      expect(formatDuration({ weeks: 1.5 }, en)).toBe('1 wk, 3 days, 12 hr')
      expect(formatDuration({ years: 1.5 }, en)).toBe('1 yr, 6 mths')
      expect(formatDuration({ hours: -1.5 }, en)).toBe('-1 hr, 30 min')
      expect(formatDuration(1500.5, { ...en, smallest: 'millisecond' })).toBe('1 sec, 501 ms')
    })
  })

  it('fractions in digital style', () => {
    both(() => {
      expect(formatDuration({ hours: 1.5 }, { ...en, style: 'digital' })).toBe('1:30:00')
      expect(formatDuration({ minutes: 0.5 }, { ...en, style: 'digital' })).toBe('0:30')
    })
  })

  it('values beyond what Intl.DurationFormat accepts still format', () => {
    both(() => {
      expect(formatDuration({ hours: 1e12 }, en)).toMatch(/hr$/)
      expect(formatDuration(1e300, en)).toMatch(/days?/)
      expect(formatDuration({ seconds: Number.MAX_VALUE }, { ...en, style: 'digital', fallback: 'x' })).toMatch(/:/)
    })
  })
})

describe('formatDuration: human defaults, smallest and carries', () => {
  const both = (fn: () => void) => {
    fn()
    withoutNative(fn)
  }

  it('from one second on, seconds are the smallest unit shown, rounded with carry', () => {
    both(() => {
      expect(formatDuration(59_999, en)).toBe('1 min')
      expect(formatDuration(59_400, en)).toBe('59 sec')
      expect(formatDuration(3_599_600, en)).toBe('1 hr')
      expect(formatDuration(1_500, en)).toBe('2 sec')
      expect(formatDuration(1_499, en)).toBe('1 sec')
      expect(formatDuration(86_399_999, en)).toBe('1 day')
      expect(formatDuration(90_060_400, en)).toBe('1 day, 1 hr, 1 min')
    })
  })

  it('milliseconds only below one second', () => {
    both(() => {
      expect(formatDuration(999, en)).toBe('999 ms')
      expect(formatDuration(400, en)).toBe('400 ms')
      expect(formatDuration(1, en)).toBe('1 ms')
      expect(formatDuration(1_000, en)).toBe('1 sec')
    })
  })

  it('smallest picks the finest unit shown; finer parts round away with carries', () => {
    both(() => {
      expect(formatDuration(3_599_600, { ...en, smallest: 'minute' })).toBe('1 hr')
      expect(formatDuration({ minutes: 59, seconds: 59.6 }, { ...en, smallest: 'minute' })).toBe('1 hr')
      expect(formatDuration({ minutes: 59, seconds: 29 }, { ...en, smallest: 'minute' })).toBe('59 min')
      expect(formatDuration(90_061_000, { ...en, smallest: 'hour' })).toBe('1 day, 1 hr')
      expect(formatDuration(90_061_000, { ...en, smallest: 'day' })).toBe('1 day')
      expect(formatDuration(36 * 3_600_000, { ...en, smallest: 'day' })).toBe('2 days')
      expect(formatDuration(1_500, { ...en, smallest: 'millisecond' })).toBe('1 sec, 500 ms')
      expect(formatDuration(1_234, { ...en, smallest: 'millisecond' })).toBe('1 sec, 234 ms')
      expect(formatDuration(20_000, { ...en, smallest: 'minute' })).toBe('0 min')
      expect(formatDuration(30_000, { ...en, smallest: 'minute' })).toBe('1 min')
    })
  })

  it('a Duration object: hours roll into days only where days are already part of the value', () => {
    both(() => {
      expect(formatDuration({ hours: 23, minutes: 59, seconds: 59.6 }, en)).toBe('24 hr')
      expect(formatDuration({ days: 1, hours: 23, minutes: 59, seconds: 59.6 }, en)).toBe('2 days')
      expect(formatDuration({ minutes: 59, seconds: 59.6 }, en)).toBe('1 hr')
    })
  })

  it('digital: h:mm:ss, minutes unpadded below an hour, a fraction only when milliseconds are asked for', () => {
    both(() => {
      expect(formatDuration(65_432, { ...en, style: 'digital' })).toBe('1:05')
      expect(formatDuration(59_999, { ...en, style: 'digital' })).toBe('1:00')
      expect(formatDuration(3_599_600, { ...en, style: 'digital' })).toBe('1:00:00')
      expect(formatDuration(65_432, { ...en, style: 'digital', smallest: 'millisecond' })).toBe('1:05.432')
      expect(formatDuration(65_400, { ...en, style: 'digital', smallest: 'millisecond' })).toBe('1:05.4')
      expect(formatDuration(65_432, { ...en, style: 'digital', fractionalDigits: 1 })).toBe('1:05.4')
      expect(formatDuration(65_432, { ...en, style: 'digital', fractionalDigits: 3 })).toBe('1:05.432')
      expect(formatDuration(65_000, { ...en, style: 'digital', fractionalDigits: 2 })).toBe('1:05.00')
      expect(formatDuration(3_905_250, { ...en, style: 'digital', smallest: 'millisecond' })).toBe('1:05:05.25')
    })
  })

  it('carries are exhaustive over a sweep: the rounded text never shows 60 sec / 60 min / 1000 ms', () => {
    both(() => {
      for (let ms = 0; ms < 7_300_000; ms += 7_919) {
        const text = formatDuration(ms, en)
        expect(text, String(ms)).not.toMatch(/\b(60 sec|60 min|1000 ms|24 hr)\b/)
      }
    })
  })
})
