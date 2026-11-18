import * as core from '../core'
import * as reactive from '../index'
import { _resetLocaleState } from '../locale'
import { clearAllTables } from './helpers'
import { _numberTables, tableStats } from '../number'

afterEach(() => {
  _resetLocaleState()
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
  ago: { kind: 'relative', unit: 'day', numeric: 'auto' },
} as const

describe.each([['core', core], ['reactive', reactive]] as const)('defineFormats (%s)', (_n, f) => {
  const loc = { locale: 'en-US' } as const
  const withLocale = Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, { ...v, ...loc }])) as unknown as typeof specs
  const fmt = f.defineFormats(withLocale)
  const at = Date.UTC(2026, 10, 18, 14, 30)

  it('each key calls its formatter with the spec options', () => {
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
    expect(fmt.ago(-1)).toBe('yesterday')
  })

  it('overrides win, per call', () => {
    expect(fmt.price(9.99, { currency: 'USD' })).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(9.99))
    expect(fmt.count(1234.56, { maximumFractionDigits: 1 })).toBe('1,234.6')
    expect(fmt.price(9.99, { locale: 'de' })).toBe(new Intl.NumberFormat('de', { style: 'currency', currency: 'EUR' }).format(9.99))
    expect(fmt.speed(72, { unit: 'mile-per-hour' })).toBe('72 mph')
    expect(fmt.ago(3, { unit: 'week' })).toBe('in 3 weeks')
    expect(fmt.price(9.99)).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(9.99))
  })

  it('nullish returns the spec fallback', () => {
    const g = f.defineFormats({ price: { kind: 'currency', currency: 'EUR', fallback: 'n/a' } })
    expect(g.price(null)).toBe('n/a')
    expect(g.price(undefined, { fallback: '-' })).toBe('-')
  })

  it('a call without overrides hits the identity tier of the cache (the spec object is hoisted)', () => {
    const g = f.defineFormats({ n: { kind: 'number', locale: 'en-US', maximumFractionDigits: 2 } })
    g.n(1)
    const before = tableStats(_numberTables().number).keyed
    for (let i = 0; i < 100; i++) g.n(i)
    expect(tableStats(_numberTables().number).keyed).toBe(before)
  })

  it('an unknown kind is a programmer error', () => {
    const g = f.defineFormats({ bad: { kind: 'nope' } as never })
    expect(() => g.bad(1 as never)).toThrow(/\[Pyreon\] defineFormats\(\): unknown kind "nope"/)
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
})

describe('createFormatter', () => {
  const at = Date.UTC(2026, 10, 18, 23, 30)

  it('binds locale and time zone for every method', () => {
    const f = core.createFormatter({ locale: 'cs', timeZone: 'Asia/Tokyo' })
    expect(f.number(1234.5)).toBe(new Intl.NumberFormat('cs').format(1234.5))
    expect(f.currency(9.99, 'CZK')).toBe(new Intl.NumberFormat('cs', { style: 'currency', currency: 'CZK' }).format(9.99))
    expect(f.percent(0.5)).toBe(new Intl.NumberFormat('cs', { style: 'percent' }).format(0.5))
    expect(f.compact(1240000)).toBe(new Intl.NumberFormat('cs', { notation: 'compact' }).format(1240000))
    expect(f.unit(5, 'kilometer')).toBe(new Intl.NumberFormat('cs', { style: 'unit', unit: 'kilometer', unitDisplay: 'short' }).format(5))
    expect(f.bytes(1536)).toBe(core.formatBytes(1536, { locale: 'cs' }))
    expect(f.duration({ hours: 1 })).toBe(core.formatDuration({ hours: 1 }, { locale: 'cs' }))
    expect(f.list(['a', 'b'])).toBe(new Intl.ListFormat('cs').format(['a', 'b']))
    expect(f.date(at)).toBe(new Intl.DateTimeFormat('cs', { dateStyle: 'medium', timeZone: 'Asia/Tokyo' }).format(at))
    expect(f.time(at)).toBe(new Intl.DateTimeFormat('cs', { timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(at))
    expect(f.dateTime(at)).toBe(new Intl.DateTimeFormat('cs', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(at))
    expect(f.relative(-3, 'day')).toBe(new Intl.RelativeTimeFormat('cs').format(-3, 'day'))
    expect(f.relativeTo(at - 3600000, at)).toBe(new Intl.RelativeTimeFormat('cs', { numeric: 'auto' }).format(-1, 'hour'))
    expect(f.dateRange(at, at + 86400000 * 3)).toBe(new Intl.DateTimeFormat('cs', { dateStyle: 'medium', timeZone: 'Asia/Tokyo' }).formatRange(at, at + 86400000 * 3))
    expect(f.numberRange(1, 5)).toBe(new Intl.NumberFormat('cs').formatRange(1, 5))
    expect(f.numberToParts(1.5)).toEqual(new Intl.NumberFormat('cs').formatToParts(1.5))
    expect(f.dateToParts(at)).toEqual(new Intl.DateTimeFormat('cs', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).formatToParts(at))
    expect(f.parseNumber('1 234,5')).toBe(1234.5)
    expect(f.parseDate('18. 11. 2026')).toBe('2026-11-18')
  })

  it('per-call options override the base', () => {
    const f = core.createFormatter({ locale: 'cs', timeZone: 'Asia/Tokyo' })
    expect(f.number(1234.5, { locale: 'de' })).toBe(new Intl.NumberFormat('de').format(1234.5))
    expect(f.date(at, { timeZone: 'UTC' })).toBe(new Intl.DateTimeFormat('cs', { dateStyle: 'medium', timeZone: 'UTC' }).format(at))
  })

  it('no base: the runtime defaults', () => {
    const f = core.createFormatter()
    expect(f.number(1234.5)).toBe(new Intl.NumberFormat().format(1234.5))
  })

  it('a calendar date never shifts, whatever the bound zone', () => {
    expect(core.createFormatter({ locale: 'en-US', timeZone: 'Pacific/Kiritimati' }).date('2026-11-18')).toBe('Nov 18, 2026')
  })
})
