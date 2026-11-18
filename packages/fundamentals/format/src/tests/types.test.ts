/**
 * Type-level tests: they are checked by `tsc` (`bun run typecheck`); the
 * `@ts-expect-error` lines FAIL the typecheck if the thing stops being an error.
 */
import { defineFormats, formatBytes, formatDate, formatList, formatNumber, formatUnit, parseDate } from '../core'
import type { PlainDateString, SimpleUnit, Unit } from '../types'

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
    size: { kind: 'bytes', locale: 'en-US' },
    day: { kind: 'date', dateStyle: 'short', locale: 'en-US', timeZone: 'UTC' },
    ago: { kind: 'relative', unit: 'day', locale: 'en-US' },
  })

  it('keys are inferred', () => {
    expect(f.price(9.99)).toContain('9.99')
    expect(f.size(1536)).toBe('1.5 kB')
    expect(f.day('2026-11-18')).toBe('11/18/26')
    expect(f.ago(-3)).toBe('3 days ago')
    assertType<Equal<keyof typeof f, 'price' | 'size' | 'day' | 'ago'>>()
  })

  it('an unknown key, a wrong value type, a wrong override and a wrong kind are type errors', () => {
    // @ts-expect-error no such format
    expect(() => f.nope(1)).toThrow()
    // @ts-expect-error a currency takes a number, not a Date
    expect(typeof f.price(new Date())).toBe('string')
    // @ts-expect-error a bytes format has no `currency` override
    expect(f.size(1, { currency: 'EUR' })).toBe('1 byte')
    // @ts-expect-error a relative format takes a number
    expect(typeof f.ago('yesterday')).toBe('string')
    // @ts-expect-error unknown kind
    defineFormats({ bad: { kind: 'bogus' } })
    // @ts-expect-error a currency spec needs its currency
    defineFormats({ bad: { kind: 'currency' } })
    // @ts-expect-error a unit spec needs a real unit
    defineFormats({ bad: { kind: 'unit', unit: 'furlong' } })
  })
})
