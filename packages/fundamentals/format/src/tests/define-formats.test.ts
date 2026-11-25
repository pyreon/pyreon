import * as core from '../core'
import * as reactive from '../index'
import { resetLocaleState } from '../locale'
import { _numberTables, tableStats } from '../number'
import { clearAllTables } from './helpers'

afterEach(() => {
  resetLocaleState()
  clearAllTables()
})

const specs = {
  price: { kind: 'currency', currency: 'EUR' },
  size: { kind: 'bytes', binary: true },
  count: { kind: 'number', maximumFractionDigits: 0 },
  share: { kind: 'percent', maximumFractionDigits: 1 },
  short: { kind: 'compact' },
  speed: { kind: 'unit', unit: 'kilometer-per-hour' },
  took: { kind: 'duration', style: 'long' },
  tags: { kind: 'list', type: 'disjunction' },
  day: { kind: 'date', dateStyle: 'full', timeZone: 'UTC' },
  clock: { kind: 'time', timeStyle: 'short', timeZone: 'UTC' },
  stamp: { kind: 'dateTime', timeZone: 'UTC' },
  ago: { kind: 'relative', base: '2026-11-18' },
} as const

describe.each([['core', core], ['reactive', reactive]] as const)('defineFormats (%s)', (_n, f) => {
  const withLocale = Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, { ...v, locale: 'en-US' }])) as unknown as typeof specs
  const fmt = f.defineFormats(withLocale)
  const at = Date.UTC(2026, 10, 18, 14, 30)

  it('each key is a formatter built from the spec options', () => {
    expect(fmt.price(9.99)).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(9.99))
    expect(fmt.size(1536)).toBe('1.5 KiB')
    expect(fmt.count(1234.56)).toBe('1,235')
    expect(fmt.share(0.4234)).toBe('42.3%')
    expect(fmt.short(1240000)).toBe('1.2M')
    expect(fmt.speed(72)).toBe('72 km/h')
    expect(fmt.took({ hours: 2, minutes: 5 })).toBe(f.formatDuration({ hours: 2, minutes: 5 }, { locale: 'en-US', style: 'long' }))
    expect(fmt.tags(['a', 'b', 'c'])).toBe(new Intl.ListFormat('en-US', { type: 'disjunction' }).format(['a', 'b', 'c']))
    expect(fmt.day(at)).toBe(new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(at))
    expect(fmt.clock(at)).toBe(new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(at))
    expect(fmt.stamp(at)).toBe(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(at))
    expect(fmt.ago('2026-11-17')).toBe('yesterday')
  })

  it('entries are real Formatters: with, from, fallback, range, parts', () => {
    expect(fmt.price.with({ currency: 'USD' })(9.99)).toBe('$9.99')
    expect(fmt.price.from((c: number) => c / 100)(999)).toBe('€9.99')
    expect(fmt.price.fallback('n/a')(null)).toBe('n/a')
    expect(fmt.price.range(10, 20)).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).formatRange(10, 20))
    expect(fmt.price.parts(1)[0]?.type).toBe('currency')
    expect(fmt.day.range('2026-11-12', '2026-11-15')).toBe(
      new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).formatRange(Date.UTC(2026, 10, 12), Date.UTC(2026, 10, 15)),
    )
  })

  it('works as a callback', () => {
    expect([1, 2].map(fmt.count)).toEqual(['1', '2'])
  })

  it('nullish returns the spec fallback', () => {
    const g = f.defineFormats({ price: { kind: 'currency', currency: 'EUR', fallback: 'n/a' } })
    expect(g.price(null)).toBe('n/a')
    expect(g.price.fallback('-')(undefined)).toBe('-')
  })

  it('an unknown kind is a programmer error at definition time', () => {
    expect(() => f.defineFormats({ bad: { kind: 'nope' } as never })).toThrow(/\[Pyreon\] defineFormats\(\): the format "bad" has unknown kind "nope"/)
    expect(() => f.defineFormats({ bad: 5 as never })).toThrow(/must be an object/)
  })
})

describe('extends', () => {
  const g = core.defineFormats({
    price: { kind: 'currency', currency: 'EUR', locale: 'en-US' },
    priceShort: { extends: 'price', notation: 'compact' },
    priceWhole: { extends: 'price', maximumFractionDigits: 0 },
    priceWholeCode: { extends: 'priceWhole', currencyDisplay: 'code' },
    big: { kind: 'number', locale: 'en-US' },
  })

  it('inherits the kind and merges options over the base', () => {
    expect(g.priceShort(1234567)).toBe('€1.2M')
    expect(g.priceWhole(9.99)).toBe('€10')
    expect(g.priceWholeCode(9.99)).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, currencyDisplay: 'code' }).format(9.99))
    expect(g.priceWholeCode.options).toEqual({ locale: 'en-US', currency: 'EUR', maximumFractionDigits: 0, currencyDisplay: 'code' })
  })

  it('the base is unchanged and a derived spec can override its base options', () => {
    expect(g.price(9.99)).toBe('€9.99')
    const h = core.defineFormats({ a: { kind: 'number', maximumFractionDigits: 3, locale: 'en-US' }, b: { extends: 'a', maximumFractionDigits: 1 } })
    expect(h.b(1.23456)).toBe('1.2')
    expect(h.a(1.23456)).toBe('1.235')
  })

  it('definition order does not matter', () => {
    const h = core.defineFormats({ b: { extends: 'a', maximumFractionDigits: 0 }, a: { kind: 'number', locale: 'en-US' } })
    expect(h.b(1.5)).toBe('2')
  })

  it('an unknown name is a [Pyreon] error at definition time', () => {
    expect(() => core.defineFormats({ a: { extends: 'nope' } } as never)).toThrow(/\[Pyreon\] defineFormats\(\): the format "a" extends "nope", which is not defined in the same set\. Defined: a/)
  })

  it('cycles are rejected', () => {
    expect(() => core.defineFormats({ a: { extends: 'b' }, b: { extends: 'a' } } as never)).toThrow(/form a cycle/)
    expect(() => core.defineFormats({ a: { extends: 'a' } } as never)).toThrow(/form a cycle/)
    expect(() => core.defineFormats({ a: { extends: 'b' }, b: { extends: 'c' }, c: { extends: 'a' } } as never)).toThrow(/form a cycle/)
  })

  it('an inherited name is not a format (own keys only)', () => {
    expect(() => core.defineFormats({ a: { extends: 'constructor' } } as never)).toThrow(/not defined in the same set/)
  })
})

describe('defineFormats (reactive) follows the active locale', () => {
  it('without a locale in the spec', () => {
    const fmt = reactive.defineFormats({ price: { kind: 'currency', currency: 'EUR' } })
    reactive.setLocale('en-US')
    const en = fmt.price(1234.5)
    reactive.setLocale('de')
    expect(fmt.price(1234.5)).toBe(new Intl.NumberFormat('de', { style: 'currency', currency: 'EUR' }).format(1234.5))
    expect(en).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(1234.5))
  })

  it('shares cache entries with the free functions', () => {
    const fmt = reactive.defineFormats({ n: { kind: 'number', locale: 'en-US', maximumFractionDigits: 2 } })
    fmt.n(1)
    const before = tableStats(_numberTables().number).keyed
    for (let i = 0; i < 100; i++) fmt.n(i)
    expect(tableStats(_numberTables().number).keyed).toBe(before)
  })
})
