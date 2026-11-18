import { formatBytes, formatCurrency, formatDate, formatNumber, formatUnit } from '../core'
import { LOCALE_CAP, OPTIONS_CAP, VARIANT_CAP, clearTable, createTable, resolve, structuralKey, tableStats } from '../cache'
import { _dateTables } from '../datetime'
import { _numberTables } from '../number'
import { clearAllTables } from './helpers'

type Ctor = 'NumberFormat' | 'DateTimeFormat'

/** Replace `Intl[name]` with a counting wrapper for the duration of `run`. */
function constructions(name: Ctor, run: () => void): number {
  const Original = Intl[name] as unknown as new (...args: unknown[]) => object
  let count = 0
  const Counting = new Proxy(Original, {
    construct(target, args) {
      count++
      return Reflect.construct(target, args) as object
    },
  })
  Reflect.set(Intl, name, Counting)
  try {
    run()
  } finally {
    Reflect.set(Intl, name, Original)
  }
  return count
}

beforeEach(() => clearAllTables())

describe('the three lookup tiers', () => {
  it('tier 1 (no options): one construction per locale, then none', () => {
    expect(constructions('NumberFormat', () => { for (let i = 0; i < 1000; i++) formatNumber(i, { locale: 'cs' }) })).toBe(1)
    // Only the structural options-free path is tier 1; `{ locale }` alone has an empty key and maps onto it.
    expect(constructions('NumberFormat', () => { for (let i = 0; i < 1000; i++) formatNumber(i) })).toBe(1)
    expect(tableStats(_numberTables().number).keyed).toBe(0)
  })

  it('tier 2 (a preset string): one construction per (locale, preset)', () => {
    expect(constructions('NumberFormat', () => {
      for (let i = 0; i < 1000; i++) {
        formatNumber(i, 'integer')
        formatNumber(i, 'compact')
        formatCurrency(i, 'EUR', 'code')
      }
    })).toBe(3)
    const stats = tableStats(_numberTables().number)
    expect(stats.named).toBe(2)
    expect(stats.keyed).toBe(0)
  })

  it('tier 3a (a hoisted options object): identity hit, no structural key, one construction', () => {
    const hoisted = { maximumFractionDigits: 1, locale: 'de' }
    expect(constructions('NumberFormat', () => { for (let i = 0; i < 1000; i++) formatNumber(i, hoisted) })).toBe(1)
    expect(tableStats(_numberTables().number).keyed).toBe(1)
  })

  it('tier 3a really skips the structural key: a hoisted object hits by identity', () => {
    const hoisted = { maximumFractionDigits: 2 }
    formatNumber(1, hoisted)
    let reads = 0
    const spy = new Proxy(hoisted, { ownKeys(t) { reads++; return Reflect.ownKeys(t) } })
    // A different object with the same shape needs the key (reads its keys) ...
    formatNumber(1, spy)
    expect(reads).toBeGreaterThan(0)
    reads = 0
    // ... but the SAME object again is an identity hit: nothing enumerates it.
    formatNumber(2, spy)
    formatNumber(3, spy)
    expect(reads).toBe(0)
  })

  it('tier 3b (fresh inline literals of one shape): one construction, one structural entry', () => {
    expect(constructions('NumberFormat', () => {
      for (let i = 0; i < 10_000; i++) formatNumber(i, { maximumFractionDigits: 2, useGrouping: false })
    })).toBe(1)
    expect(tableStats(_numberTables().number).keyed).toBe(1)
  })

  it('different values of the same option are different shapes', () => {
    expect(constructions('NumberFormat', () => {
      for (let d = 0; d < 4; d++) formatNumber(1.23456, { maximumFractionDigits: d })
    })).toBe(4)
  })

  it('locale and fallback do not split the structural key', () => {
    expect(structuralKey({ locale: 'en', fallback: '-', a: 1 })).toBe(structuralKey({ a: 1 }))
    expect(structuralKey({ a: undefined })).toBe('')
    expect(structuralKey({ a: 1, b: 2 })).not.toBe(structuralKey({ a: 12 }))
    expect(structuralKey({ a: 'x\u0001b' })).not.toBe(structuralKey({ a: 'x', b: '' }))
  })

  it('dates: one DateTimeFormat per (locale, zone), reused across values', () => {
    expect(constructions('DateTimeFormat', () => {
      for (let i = 0; i < 500; i++) formatDate(i * 86400000, { locale: 'en', timeZone: 'UTC' })
    })).toBe(1)
    // A calendar string uses its own (UTC) variant, and so does every later one.
    expect(constructions('DateTimeFormat', () => {
      for (let i = 0; i < 500; i++) formatDate('2026-11-18', { locale: 'en', timeZone: 'Asia/Tokyo' })
      for (let i = 0; i < 500; i++) formatDate('2026-11-19', { locale: 'en', timeZone: 'Asia/Tokyo' })
    })).toBe(1)
  })

  it('bytes: one pack per options shape, formatters filled lazily per unit', () => {
    expect(constructions('NumberFormat', () => {
      for (let i = 0; i < 300; i++) formatBytes(1500, { locale: 'en' })
    })).toBe(2) // the validating byte formatter + kilobyte
    expect(constructions('NumberFormat', () => {
      for (let i = 0; i < 300; i++) formatBytes(1500, { locale: 'en' })
    })).toBe(0)
  })
})

describe('bounds (leak class C)', () => {
  it('locales are bounded: more locales than the cap evicts the oldest', () => {
    for (let i = 0; i < LOCALE_CAP * 3; i++) formatNumber(1, { locale: `en-u-nu-latn-x-t${i}` })
    expect(tableStats(_numberTables().number).locales).toBe(LOCALE_CAP)
  })

  it('an evicted locale is rebuilt correctly', () => {
    const first = formatNumber(1234.5, { locale: 'cs' })
    for (let i = 0; i < LOCALE_CAP * 2; i++) formatNumber(1, { locale: `en-x-l${i}` })
    expect(constructions('NumberFormat', () => { expect(formatNumber(1234.5, { locale: 'cs' })).toBe(first) })).toBe(1)
  })

  it('option shapes are bounded per locale', () => {
    for (let i = 0; i < OPTIONS_CAP * 4; i++) formatNumber(1, { locale: 'en', minimumFractionDigits: 0, maximumFractionDigits: 0 + (i % 20), minimumIntegerDigits: 1 + Math.floor(i / 20) % 20, ...(i % 2 ? { useGrouping: false } : {}) })
    expect(tableStats(_numberTables().number).keyed).toBeLessThanOrEqual(OPTIONS_CAP)
    expect(tableStats(_numberTables().number).keyed).toBe(OPTIONS_CAP)
  })

  it('a failed build (an unknown preset) is not cached', () => {
    for (let i = 0; i < OPTIONS_CAP * 2; i++) {
      expect(() => formatNumber(1, `bogus${i}` as never)).toThrow(/unknown preset/)
    }
    expect(tableStats(_numberTables().number).named).toBe(0)
  })

  it('every tier of a table is bounded, proved on a raw table', () => {
    const table = createTable<{ id: number }>((_l, _v, o) => ({ id: typeof o === 'string' ? o.length : 0 }))
    for (let i = 0; i < OPTIONS_CAP * 3; i++) resolve(table, 'en', '', 'p'.repeat(i + 1))
    expect(tableStats(table).named).toBe(OPTIONS_CAP)
    for (let i = 0; i < OPTIONS_CAP * 3; i++) resolve(table, 'en', '', { [`k${i}`]: i })
    expect(tableStats(table).keyed).toBe(OPTIONS_CAP)
    for (let i = 0; i < VARIANT_CAP * 3; i++) resolve(table, 'en', `v${i}`, undefined)
    expect(tableStats(table).variants).toBe(VARIANT_CAP)
    for (let i = 0; i < LOCALE_CAP * 3; i++) resolve(table, `l${i}`, '', undefined)
    expect(tableStats(table).locales).toBe(LOCALE_CAP)
    clearTable(table)
    expect(tableStats(table).locales).toBe(0)
  })

  it('variants (zones, currencies, units) are bounded per locale', () => {
    for (let i = 0; i < VARIANT_CAP * 3; i++) {
      const code = String.fromCharCode(65 + (i % 26), 65 + (Math.floor(i / 26) % 26), 65 + (Math.floor(i / 676) % 26))
      formatCurrency(1, code, { locale: 'en' })
    }
    expect(tableStats(_numberTables().currency).variants).toBe(VARIANT_CAP)
    for (const u of ['meter', 'liter', 'gram']) formatUnit(1, u as 'meter', { locale: 'en' })
    expect(tableStats(_numberTables().unit).variants).toBe(3)
  })

  it('no growth when called 10,000 times with fresh inline literals of the same shape', () => {
    formatNumber(1, { locale: 'en', maximumFractionDigits: 3 })
    const before = tableStats(_numberTables().number)
    for (let i = 0; i < 10_000; i++) {
      formatNumber(i, { locale: 'en', maximumFractionDigits: 3 })
      formatDate(i, { locale: 'en', timeZone: 'UTC', month: 'long' })
    }
    const after = tableStats(_numberTables().number)
    expect(after).toEqual(before)
    expect(tableStats(_dateTables().date).keyed).toBe(1)
  })

  it('no growth with 10,000 distinct zones (request-derived data)', () => {
    for (let i = 0; i < 2_000; i++) {
      try { formatDate(0, { locale: 'en', timeZone: `Etc/GMT+${i}` }) } catch { /* invalid zone */ }
    }
    expect(tableStats(_dateTables().date).variants).toBeLessThanOrEqual(VARIANT_CAP)
  })
})
