import * as core from '../core'
import * as reactive from '../index'
import { _dateTables } from '../datetime'
import { _numberTables, tableStats } from '../number'
import { _resetLocaleState } from '../locale'
import { clearAllTables, constructions } from './helpers'

beforeEach(() => clearAllTables())
afterEach(() => _resetLocaleState())

describe('formatters share the bounded cache', () => {
  it('10,000 derived formatters with identical options: one construction, one cache entry', () => {
    const base = core.currencyFormatter('EUR', { locale: 'en-US' })
    const derived: Array<(v: number) => string> = []
    const made = constructions('NumberFormat', () => {
      for (let i = 0; i < 10_000; i++) {
        const f = base.with({ maximumFractionDigits: 0 })
        derived.push(f)
        expect(f(12.5)).toBe('€13')
      }
    })
    expect(made).toBe(1)
    const stats = tableStats(_numberTables().currency)
    expect(stats.keyed).toBe(1)
    expect(stats.locales).toBe(1)
    expect(stats.variants).toBe(1)
  })

  it('10,000 from / fallback / with chains: still one construction and one entry', () => {
    const base = core.numberFormatter({ locale: 'en-US', maximumFractionDigits: 1 })
    const made = constructions('NumberFormat', () => {
      for (let i = 0; i < 10_000; i++) {
        const f = base.from((x: number) => x * 2).fallback('-').with({ minimumFractionDigits: 1 })
        f(i)
      }
    })
    expect(made).toBe(1)
    expect(tableStats(_numberTables().number).keyed).toBe(1)
  })

  it('creating formatters in a loop without calling them touches no table', () => {
    const before = tableStats(_numberTables().number)
    const made = constructions('NumberFormat', () => {
      for (let i = 0; i < 10_000; i++) core.numberFormatter({ maximumFractionDigits: i % 3 }).with({ useGrouping: false }).from((x: number) => x)
    })
    expect(made).toBe(0)
    expect(tableStats(_numberTables().number)).toEqual(before)
  })

  it('a built formatter and the free function share cache entries', () => {
    const f = core.numberFormatter({ locale: 'en-US', maximumFractionDigits: 2 })
    const made = constructions('NumberFormat', () => {
      f(1)
      core.formatNumber(2, { locale: 'en-US', maximumFractionDigits: 2 })
    })
    expect(made).toBe(1)
  })

  it('many distinct option shapes stay bounded', () => {
    for (let i = 0; i < 300; i++) {
      core.numberFormatter({ locale: 'en-US', minimumIntegerDigits: 1 + (i % 20), maximumFractionDigits: i % 21, useGrouping: i % 2 === 0 })(1)
    }
    expect(tableStats(_numberTables().number).keyed).toBeLessThanOrEqual(64)
  })

  it('dates: one DateTimeFormat per (locale, zone) however many formatters', () => {
    const made = constructions('DateTimeFormat', () => {
      for (let i = 0; i < 2_000; i++) core.dateFormatter({ locale: 'en-US', timeZone: 'UTC' }).with({ month: 'long' })(0)
    })
    expect(made).toBe(1)
    expect(tableStats(_dateTables().date).keyed).toBe(1)
  })

  it('the hot path hits the memoized Intl: no table lookup after the first call', () => {
    const f = core.numberFormatter({ locale: 'en-US' })
    f(1)
    const table = _numberTables().number
    const get = vi.spyOn(table.byLocale, 'get')
    for (let i = 0; i < 1_000; i++) f(i)
    expect(get).not.toHaveBeenCalled()
    get.mockRestore()
  })

  it('the memo follows the locale: a switch resolves once, then is memoized again', () => {
    reactive.setLocale('en-US')
    const f = reactive.numberFormatter()
    const made = constructions('NumberFormat', () => {
      for (let i = 0; i < 100; i++) f(i)
      reactive.setLocale('de')
      for (let i = 0; i < 100; i++) f(i)
      reactive.setLocale('en-US')
      for (let i = 0; i < 100; i++) f(i)
    })
    expect(made).toBe(2)
  })
})
