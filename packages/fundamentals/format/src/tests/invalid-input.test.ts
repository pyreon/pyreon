import * as core from '../core'
import * as reactive from '../index'
import { _resetWarnings } from '../warn'
import { _resetLocaleState } from '../locale'

const en = { locale: 'en-US' }
let warn: { mock: { calls: unknown[][] }; mockRestore(): void }
const nodeEnv = process.env.NODE_ENV

beforeEach(() => {
  _resetWarnings()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
  process.env.NODE_ENV = nodeEnv
  _resetLocaleState()
})

const CALLS: Array<[string, (v: unknown, fb: string) => string]> = [
  ['formatNumber', (v, fallback) => core.formatNumber(v as number, { ...en, fallback })],
  ['formatCurrency', (v, fallback) => core.formatCurrency(v as number, 'EUR', { ...en, fallback })],
  ['formatPercent', (v, fallback) => core.formatPercent(v as number, { ...en, fallback })],
  ['formatCompact', (v, fallback) => core.formatCompact(v as number, { ...en, fallback })],
  ['formatUnit', (v, fallback) => core.formatUnit(v as number, 'meter', { ...en, fallback })],
  ['formatBytes', (v, fallback) => core.formatBytes(v as number, { ...en, fallback })],
]
const DATE_CALLS: Array<[string, (v: unknown, fb: string) => string]> = [
  ['formatDate', (v, fallback) => core.formatDate(v as string, { ...en, fallback })],
  ['formatTime', (v, fallback) => core.formatTime(v as string, { ...en, fallback })],
  ['formatDateTime', (v, fallback) => core.formatDateTime(v as string, { ...en, fallback })],
]

describe('nullish input returns the fallback, silently', () => {
  it.each([...CALLS, ...DATE_CALLS])('%s', (_name, call) => {
    expect(call(null, '-')).toBe('-')
    expect(call(undefined, '-')).toBe('-')
    expect(call(undefined, '')).toBe('')
    expect(warn).not.toHaveBeenCalled()
  })

  it('the default fallback is the empty string', () => {
    expect(core.formatNumber(null)).toBe('')
    expect(core.formatDate(undefined)).toBe('')
    expect(core.formatList(null)).toBe('')
    expect(core.formatDuration(null)).toBe('')
    expect(core.formatRelativeTo(null, 0)).toBe('')
    expect(core.formatDateRange(null, 0)).toBe('')
    expect(core.formatNumberRange(null, 1)).toBe('')
    expect(core.formatNumberToParts(null)).toEqual([])
    expect(core.formatDateToParts(null)).toEqual([])
  })
})

describe('invalid input returns the fallback with a dev warning, once', () => {
  it.each(CALLS)('%s(NaN / a string / an object)', (name, call) => {
    expect(call(NaN, '?')).toBe('?')
    expect(call('12', '?')).toBe('?')
    expect(call({}, '?')).toBe('?')
    // one warning per (function, kind of bad value, expectation), however many calls
    expect(warn.mock.calls.filter((c) => String(c[0]).includes(`${name}()`)).length).toBeLessThanOrEqual(3)
    const n = warn.mock.calls.length
    for (let i = 0; i < 20; i++) call(NaN, '?')
    expect(warn.mock.calls.length).toBe(n)
  })

  it.each(DATE_CALLS)('%s("garbage")', (name, call) => {
    expect(call('garbage', '?')).toBe('?')
    expect(call('2026-02-30', '?')).toBe('?')
    expect(call(NaN, '?')).toBe('?')
    expect(call({}, '?')).toBe('?')
    expect(warn.mock.calls[0]?.[0]).toMatch(new RegExp(`^\\[Pyreon\\] ${name}\\(\\): expected a Date`))
    const n = warn.mock.calls.length
    for (let i = 0; i < 20; i++) call('garbage', '?')
    expect(warn.mock.calls.length).toBe(n)
  })

  it('the warning says how to fix it', () => {
    core.formatNumber(NaN)
    expect(warn.mock.calls[0]?.[0]).toMatch(/^\[Pyreon\] formatNumber\(\): expected a number or bigint .* got NaN; returning the fallback\. Pass a valid value/)
  })

  it('the warning set is itself bounded', () => {
    for (let i = 0; i < 500; i++) core.formatNumber(`bad${i}` as never)
    // 500 distinct strings share one (function, type, expectation) key.
    expect(warn.mock.calls.length).toBe(1)
  })

  it('other invalid shapes: lists, relative, ranges, currency codes, bad locales', () => {
    expect(core.formatRelative(NaN, 'day', { ...en, fallback: '?' })).toBe('?')
    expect(core.formatRelativeTo('x', 0, { ...en, fallback: '?' })).toBe('?')
    expect(core.formatRelativeTo(0, 'x', { ...en, fallback: '?' })).toBe('?')
    expect(core.formatDateRange('x', 0, { ...en, fallback: '?' })).toBe('?')
    expect(core.formatDateRange(0, 'x', { ...en, fallback: '?' })).toBe('?')
    expect(core.formatNumberRange(1, NaN, { ...en, fallback: '?' })).toBe('?')
    expect(core.formatNumberRange('a' as never, 1, { ...en, fallback: '?' })).toBe('?')
    expect(core.formatCurrency(1, 'EURO', { ...en, fallback: '?' })).toBe('?')
    expect(core.formatCurrency(1, '€', { ...en, fallback: '?' })).toBe('?')
    expect(core.formatCurrency(1, null as never, { ...en, fallback: '?' })).toBe('?')
    expect(core.formatNumberToParts(NaN)).toEqual([])
    expect(core.formatDateToParts('x')).toEqual([])
    expect(core.formatDuration('x' as never, { fallback: '?' })).toBe('?')
  })

  it('an invalid locale tag degrades to the runtime default with a warning (it may be request data)', () => {
    expect(core.formatNumber(1234.5, { locale: 'en_US' })).toBe(new Intl.NumberFormat().format(1234.5))
    expect(core.formatDate(0, { locale: 'not a tag', timeZone: 'UTC' })).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(0))
    expect(warn.mock.calls.some((c) => /not a valid BCP 47 tag/.test(String(c[0])))).toBe(true)
  })
})

describe('production is silent', () => {
  it('no warnings for any invalid input', () => {
    process.env.NODE_ENV = 'production'
    expect(core.formatNumber(NaN, { fallback: '?' })).toBe('?')
    expect(core.formatDate('garbage', { fallback: '?' })).toBe('?')
    expect(core.formatBytes(Infinity, { fallback: '?' })).toBe('?')
    expect(core.formatCurrency(1, 'EURO', { fallback: '?' })).toBe('?')
    expect(core.formatNumber(1, { locale: 'en_US' })).toBe(new Intl.NumberFormat().format(1))
    reactive.setLocale('en')
    expect(warn).not.toHaveBeenCalled()
  })

  it('programmer errors still throw in production', () => {
    process.env.NODE_ENV = 'production'
    expect(() => core.formatNumber(1, 'nope' as never)).toThrow(/\[Pyreon\]/)
    expect(() => core.formatUnit(1, 'furlong' as never)).toThrow(/\[Pyreon\] formatUnit\(\)/)
  })
})

describe('programmer errors throw [Pyreon] errors that say how to fix', () => {
  it('unknown unit', () => {
    expect(() => core.formatUnit(1, 'furlong' as never, en)).toThrow(/\[Pyreon\] formatUnit\(\): .*Intl\.supportedValuesOf\('unit'\)/)
    expect(() => core.formatUnit(1, '' as never, en)).toThrow(/the unit must be a string/)
  })
  it('bad option values', () => {
    expect(() => core.formatNumber(1, { ...en, maximumFractionDigits: 200 })).toThrow(/\[Pyreon\] formatNumber\(\): .*Check the options/)
    expect(() => core.formatDate(0, { ...en, timeZone: 'Mars/Olympus' })).toThrow(/\[Pyreon\] formatDate\(\): .*timeZone must be an IANA name/)
    expect(() => core.formatDate(0, { ...en, dateStyle: 'short', month: 'long' })).toThrow(/cannot be combined with field options/)
    expect(() => core.formatList(['a'], { ...en, type: 'nope' as never })).toThrow(/\[Pyreon\] formatList\(\)/)
    expect(() => core.formatRelative(1, 'fortnight' as never, en)).toThrow(/\[Pyreon\] formatRelative\(\): .*unit is one of/)
    expect(() => core.formatRelative(1, 'day', { ...en, numeric: 'sometimes' as never })).toThrow(/\[Pyreon\] formatRelative\(\)/)
  })
  it('unknown presets name the valid ones', () => {
    expect(() => core.formatDate(0, 'tiny' as never)).toThrow(/unknown preset "tiny"\. Valid presets: short, medium, long, full/)
    expect(() => core.formatNumber(0, 'weird' as never)).toThrow(/Valid presets: integer, plain, compact, percent/)
    expect(() => core.formatPercent(0, 'x' as never)).toThrow(/unknown preset/)
    expect(() => core.formatCompact(0, 'x' as never)).toThrow(/Valid presets: short, long/)
    expect(() => core.formatList(['a'], 'x' as never)).toThrow(/Valid presets: and, or, unit/)
    expect(() => core.formatCurrency(1, 'EUR', 'x' as never)).toThrow(/Valid presets: symbol/)
    expect(() => core.formatRelative(1, 'day', 'x' as never)).toThrow(/Valid presets: always, auto/)
  })
  it('a toString-named preset is not an inherited member', () => {
    expect(() => core.formatNumber(1, 'constructor' as never)).toThrow(/unknown preset "constructor"/)
    expect(() => core.formatDate(0, 'toString' as never)).toThrow(/unknown preset "toString"/)
  })
  it('the locale API validates what it is handed', () => {
    expect(() => reactive.setLocale('en_US')).toThrow(/\[Pyreon\] setLocale\(\): "en_US" is not a valid BCP 47/)
    expect(() => reactive.setTimeZone('Mars/Olympus')).toThrow(/\[Pyreon\] setTimeZone\(\): .*IANA/)
    expect(() => core.createFormatter({ timeZone: 'Nope/Zone' })).toThrow(/\[Pyreon\] createFormatter\(\)/)
  })
})
