/**
 * Type-level tests: they are checked by `tsc` (`bun run typecheck`); the
 * `@ts-expect-error` lines FAIL the typecheck if the thing stops being an error.
 */
import {
  bytesFormatter,
  currencyFormatter,
  dateFormatter,
  defineFormats,
  durationFormatter,
  formatBytes,
  formatDate,
  formatList,
  formatNumber,
  formatUnit,
  listFormatter,
  numberFormatter,
  parseDate,
  relativeFormatter,
  unitFormatter,
} from '../core'
import type { ListPart, PlainDateString, SimpleUnit, Unit } from '../types'

/** `true` only when A and B are the same type. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const assertType = <_T extends true>() => {}

describe('Unit', () => {
  it('equals the runtime list of sanctioned units', () => {
    const typed: readonly SimpleUnit[] = Intl.supportedValuesOf('unit') as SimpleUnit[]
    const runtime = Intl.supportedValuesOf('unit')
    expect([...typed].sort()).toEqual([...runtime].sort())
    // Every runtime unit is accepted by the type, and a new runtime unit would be missing from it:
    const all = new Set<string>(runtime)
    const literal: Record<SimpleUnit, true> = {
      acre: true, bit: true, byte: true, celsius: true, centimeter: true, day: true, degree: true, fahrenheit: true,
      'fluid-ounce': true, foot: true, gallon: true, gigabit: true, gigabyte: true, gram: true, hectare: true, hour: true,
      inch: true, kilobit: true, kilobyte: true, kilogram: true, kilometer: true, liter: true, megabit: true,
      megabyte: true, meter: true, microsecond: true, mile: true, 'mile-scandinavian': true, milliliter: true,
      millimeter: true, millisecond: true, minute: true, month: true, nanosecond: true, ounce: true, percent: true,
      petabyte: true, pound: true, second: true, stone: true, terabit: true, terabyte: true, week: true, yard: true, year: true,
    }
    expect(new Set(Object.keys(literal))).toEqual(all)
  })

  it('a wrong unit is a type error; simple and compound units compile', () => {
    formatUnit(1, 'kilometer')
    formatUnit(1, 'kilometer-per-hour')
    formatUnit(1, 'liter-per-kilometer')
    // @ts-expect-error not a sanctioned unit
    expect(() => formatUnit(1, 'furlong')).toThrow()
    // @ts-expect-error misspelt compound
    expect(() => formatUnit(1, 'kilometer-per-hours')).toThrow()
    // @ts-expect-error the American spelling of a sanctioned unit is still not the unit
    expect(() => formatUnit(1, 'kilometre')).toThrow()
    assertType<Equal<'meter' extends Unit ? true : false, true>>()
    assertType<Equal<'meter-per-second' extends Unit ? true : false, true>>()
  })
})

describe('option and preset typing', () => {
  it('presets are closed unions', () => {
    formatDate(0, 'short')
    formatNumber(1, 'integer')
    formatList(['a'], 'or')
    // @ts-expect-error not a date preset
    expect(() => formatDate(0, 'tiny')).toThrow()
    // @ts-expect-error not a number preset
    expect(() => formatNumber(1, 'weird')).toThrow()
  })

  it('Intl option names are the platform names', () => {
    formatNumber(1, { maximumFractionDigits: 2, notation: 'compact', locale: 'de', fallback: '-' })
    formatDate(0, { dateStyle: 'full', timeZone: 'UTC' })
    formatBytes(1, { binary: true, unitDisplay: 'long' })
    // @ts-expect-error unknown option name
    formatNumber(1, { maximumFractionDigitz: 2 })
    // @ts-expect-error binary only exists on formatBytes
    formatNumber(1, { binary: true })
  })

  it('inputs: nullish is allowed everywhere', () => {
    formatNumber(null)
    formatNumber(undefined)
    formatNumber(10n)
    formatDate(null)
    formatDate('2026-11-18')
    formatDate(new Date())
    // @ts-expect-error a boolean is not a number
    expect(formatNumber(true)).toBe('')
  })
})

describe('parseDate returns a template-literal string', () => {
  it('assignable to a YYYY-MM-DD shape without a cast', () => {
    const d: PlainDateString | null = parseDate('18. 11. 2026', { locale: 'cs' })
    expect(d).toBe('2026-11-18')
    const literal: PlainDateString = '2026-11-18'
    expect(literal).toBe('2026-11-18')
  })
})

describe('defineFormats', () => {
  const f = defineFormats({
    price: { kind: 'currency', currency: 'EUR', locale: 'en-US' },
    priceShort: { extends: 'price', notation: 'compact' },
    size: { kind: 'bytes', locale: 'en-US' },
    day: { kind: 'date', dateStyle: 'short', locale: 'en-US', timeZone: 'UTC' },
    since: { kind: 'relative', base: '2026-11-18', locale: 'en-US' },
    tags: { kind: 'list', locale: 'en-US' },
  })

  it('keys are inferred and each is a real Formatter', () => {
    expect(f.price(9.99)).toContain('9.99')
    expect(f.priceShort(1234567)).toBe('€1.2M')
    expect(f.size(1536)).toBe('1.5 kB')
    expect(f.day('2026-11-18')).toBe('11/18/26')
    expect(f.since('2026-11-17')).toBe('yesterday')
    expect(f.price.with({ maximumFractionDigits: 0 })(9.99)).toBe('€10')
    expect(f.price.from((c: number) => c / 100)(999)).toBe('€9.99')
    assertType<Equal<keyof typeof f, 'price' | 'priceShort' | 'size' | 'day' | 'since' | 'tags'>>()
  })

  it('an extended spec has its base kind: input type, range and parts follow it', () => {
    f.priceShort.range(1, 2)
    f.priceShort.parts(1)
    f.day.range('2026-11-12', '2026-11-15')
    // @ts-expect-error a list formatter has no range
    expect(f.tags.range).toBeUndefined()
    // @ts-expect-error a relative formatter has no range
    expect(f.since.range).toBeUndefined()
    // @ts-expect-error a relative formatter has no parts
    expect(f.since.parts).toBeUndefined()
  })

  it('an unknown key, a wrong value type, a wrong override, an unknown extends and a wrong kind are type errors', () => {
    // @ts-expect-error no such format
    expect(() => f.nope(1)).toThrow()
    // @ts-expect-error a currency takes a number, not a Date
    expect(typeof f.price(new Date())).toBe('string')
    // @ts-expect-error a bytes format has no `currency` override
    expect(f.size.with({ currency: 'EUR' })(1)).toBe('1 byte')
    // @ts-expect-error a date formatter takes a date-like, not an array
    expect(typeof f.day(['x'])).toBe('string')
    // @ts-expect-error unknown kind
    expect(() => defineFormats({ bad: { kind: 'bogus' } })).toThrow()
    // @ts-expect-error a currency spec needs its currency
    expect(typeof defineFormats({ bad: { kind: 'currency' } })).toBe('object')
    // @ts-expect-error a unit spec needs a real unit
    expect(typeof defineFormats({ bad: { kind: 'unit', unit: 'furlong' } })).toBe('object')
    // @ts-expect-error extends names a format that is not in the set
    expect(() => defineFormats({ a: { kind: 'number' }, b: { extends: 'nope' } })).toThrow()
  })
})

describe('Formatter<In, K>', () => {
  it('range exists on number-like and date-like kinds, and is absent from the type elsewhere', () => {
    const n = numberFormatter()
    const d = dateFormatter()
    n.range(1, 2)
    d.range('2026-11-12', '2026-11-15')
    // @ts-expect-error a list formatter has no range
    expect(listFormatter().range).toBeUndefined()
    // @ts-expect-error a duration formatter has no range
    expect(durationFormatter().range).toBeUndefined()
    // @ts-expect-error a bytes formatter has no range
    expect(bytesFormatter().range).toBeUndefined()
    // @ts-expect-error a duration formatter has no parts
    expect(durationFormatter().parts).toBeUndefined()
  })

  it('parts are typed per kind', () => {
    assertType<Equal<ReturnType<ReturnType<typeof numberFormatter>['parts']>, readonly Intl.NumberFormatPart[]>>()
    assertType<Equal<ReturnType<ReturnType<typeof dateFormatter>['parts']>, readonly Intl.DateTimeFormatPart[]>>()
    assertType<Equal<ReturnType<ReturnType<typeof listFormatter>['parts']>, readonly ListPart[]>>()
  })

  it('from changes the input type, and with takes that kind\'s options', () => {
    const price = currencyFormatter('EUR')
    const fromCents = price.from((cents: number) => cents / 100)
    fromCents(999)
    // @ts-expect-error the adapted formatter takes the adapter's input type
    expect(typeof fromCents('9.99')).toBe('string')
    const fromRow = fromCents.from((row: { total: number }) => row.total)
    fromRow({ total: 1 })
    // @ts-expect-error a number is no longer the input
    expect(typeof fromRow(1)).toBe('string')
    price.with({ maximumFractionDigits: 0, currency: 'USD' })
    // @ts-expect-error an option of the wrong type
    expect(() => price.with({ maximumFractionDigits: 'many' })(1)).toThrow()
    assertType<Equal<Parameters<typeof fromCents>[0], number>>()
    assertType<Equal<Parameters<typeof fromRow>[0], { total: number }>>()
  })

  it('the factories type their arguments', () => {
    // @ts-expect-error a unit formatter needs a sanctioned unit
    expect(() => unitFormatter('furlong')(1)).toThrow()
    // @ts-expect-error a relative formatter needs a base
    expect(typeof relativeFormatter({ locale: 'en' })).toBe('function')
    dateFormatter('long')
    // @ts-expect-error not a date style
    expect(() => dateFormatter('tiny')).toThrow()
  })
})
