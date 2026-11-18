import * as core from '../core'
import * as reactive from '../index'
import { _resetLocaleState } from '../locale'
import { clearAllTables } from './helpers'

const ZONES = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata', 'Pacific/Chatham', 'Europe/Prague']
const en = 'en-US'
/** The raw Intl rendering of a wall-clock / instant, in `timeZone`. */
const raw = (ms: number, options: Intl.DateTimeFormatOptions, timeZone = 'UTC') =>
  new Intl.DateTimeFormat(en, { ...options, timeZone }).format(ms)
const T = Date.UTC
const DT = { dateStyle: 'medium', timeStyle: 'short' } as const

describe.each([['core', core], ['reactive', reactive]] as const)('calendar values never shift (%s)', (_n, f) => {
  afterEach(() => _resetLocaleState())

  it.each(ZONES)('formatDate("2026-11-18") is the 18th under timeZone %s', (timeZone) => {
    expect(f.formatDate('2026-11-18', { locale: en, timeZone })).toBe('Nov 18, 2026')
    expect(f.formatDate('2026-11-18', { locale: en, timeZone, dateStyle: 'full' })).toBe('Wednesday, November 18, 2026')
    expect(f.formatDate('2026-01-01', { locale: en, timeZone })).toBe('Jan 1, 2026')
    expect(f.formatDate('2026-12-31', { locale: en, timeZone })).toBe('Dec 31, 2026')
  })

  it.each(ZONES)('a wall-clock date-time keeps its clock time under %s', (timeZone) => {
    expect(f.formatDateTime('2026-11-18T23:59', { locale: en, timeZone })).toBe(raw(T(2026, 10, 18, 23, 59), DT))
    expect(f.formatTime('2026-11-18T00:00:30', { locale: en, timeZone })).toBe(raw(T(2026, 10, 18, 0, 0, 30), { timeStyle: 'short' }))
    expect(f.formatDateTime('2026-11-18 08:15', { locale: en, timeZone })).toBe(raw(T(2026, 10, 18, 8, 15), DT))
  })

  it('a range of calendar dates is calendar days', () => {
    for (const timeZone of ZONES) {
      expect(f.formatDateRange('2026-11-12', '2026-11-15', { locale: en, timeZone })).toBe(new Intl.DateTimeFormat(en, { dateStyle: 'medium', timeZone: 'UTC' }).formatRange(T(2026, 10, 12), T(2026, 10, 15)))
    }
  })

  it('an explicit zone name is dropped for calendar values (no "UTC" next to a date that has no zone)', () => {
    expect(f.formatDateTime('2026-11-18T14:30', { locale: en, timeZoneName: 'short', timeZone: 'Asia/Tokyo' })).not.toMatch(/UTC|JST/)
  })

  it('instants (Z, offset, number, Date) DO move with the zone', () => {
    expect(f.formatDateTime('2026-11-18T23:30:00Z', { locale: en, timeZone: 'Asia/Tokyo' })).toBe(raw(T(2026, 10, 18, 23, 30), DT, 'Asia/Tokyo'))
    expect(f.formatDateTime('2026-11-18T23:30:00Z', { locale: en, timeZone: 'America/Los_Angeles' })).toBe(raw(T(2026, 10, 18, 23, 30), DT, 'America/Los_Angeles'))
    expect(f.formatDate('2026-11-18T23:30:00-05:00', { locale: en, timeZone: 'UTC' })).toBe('Nov 19, 2026')
    expect(f.formatDate(Date.UTC(2026, 10, 18, 23, 30), { locale: en, timeZone: 'Pacific/Kiritimati' })).toBe('Nov 19, 2026')
    expect(f.formatDate(new Date(Date.UTC(2026, 10, 18, 3, 0)), { locale: en, timeZone: 'America/Los_Angeles' })).toBe('Nov 17, 2026')
  })

  it('leap days and year edges', () => {
    expect(f.formatDate('2028-02-29', { locale: en, timeZone: 'Pacific/Kiritimati' })).toBe('Feb 29, 2028')
    expect(f.formatDate('0001-01-01', { locale: en, timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric' })).toMatch(/1\/1\/1/)
    expect(f.formatDate('9999-12-31', { locale: en, timeZone: 'Pacific/Kiritimati' })).toBe('Dec 31, 9999')
  })
})

describe('the process TZ does not matter either', () => {
  const original = process.env.TZ
  afterEach(() => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
    clearAllTables()
  })

  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Kolkata'])('TZ=%s, no timeZone option', (tz) => {
    process.env.TZ = tz
    clearAllTables()
    expect(new Date(2026, 10, 18, 12).getDate()).toBe(18) // the runtime really changed zone
    expect(core.formatDate('2026-11-18', { locale: en })).toBe('Nov 18, 2026')
    expect(core.formatDateTime('2026-11-18T00:00', { locale: en })).toBe(raw(T(2026, 10, 18, 0, 0), DT))
    expect(core.formatDateTime('2026-11-18T23:59:59.999', { locale: en })).toBe(raw(T(2026, 10, 18, 23, 59, 59, 999), DT))
  })

  it('an instant follows the process zone when no timeZone is given', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    clearAllTables()
    expect(core.formatDate(Date.UTC(2026, 10, 18, 12), { locale: en })).toBe('Nov 19, 2026')
    process.env.TZ = 'Pacific/Pago_Pago'
    clearAllTables()
    expect(core.formatDate(Date.UTC(2026, 10, 18, 12), { locale: en })).toBe('Nov 18, 2026')
  })
})

describe('ISO parsing edge cases', () => {
  it.each([
    '2026-02-30', '2026-13-01', '2026-00-10', '2026-11-00', '2026-11-18T24:00', '2026-11-18T14:60', '2026-11-18T14:30:61',
    '2026-11-18T14', '2026-11-18X14:30', '2026-11-18T14:30+25:00', '2026-11-18T14:30Zjunk', '18-11-2026', '2026/11/18',
    'Nov 18, 2026', '', ' 2026-11-18', '2026-11-18T14:30:00.', '2027-02-29',
  ])('rejects %j', (bad) => {
    expect(core.formatDate(bad, { locale: en, fallback: '!' })).toBe('!')
  })

  it.each([
    ['2026-11-18T14:30:05.25Z', Date.UTC(2026, 10, 18, 14, 30, 5, 250)],
    ['2026-11-18T14:30:05,25Z', NaN],
    ['2026-11-18t14:30z', Date.UTC(2026, 10, 18, 14, 30)],
    ['2026-11-18T14:30+0530', Date.UTC(2026, 10, 18, 9, 0)],
    ['2026-11-18T14:30+05', Date.UTC(2026, 10, 18, 9, 30)],
    ['2026-11-18T14:30-08:00', Date.UTC(2026, 10, 18, 22, 30)],
    ['2026-11-18T14:30:05.123456789Z', Date.UTC(2026, 10, 18, 14, 30, 5, 123)],
  ])('instant %s', (s, ms) => {
    const raw = new Intl.DateTimeFormat(en, { dateStyle: 'short', timeStyle: 'long', timeZone: 'UTC' })
    expect(core.formatDateTime(s, { locale: en, timeZone: 'UTC', dateStyle: 'short', timeStyle: 'long', fallback: '!' })).toBe(
      Number.isNaN(ms) ? '!' : raw.format(ms),
    )
  })

  it('numbers out of the valid time range and invalid Dates are invalid', () => {
    expect(core.formatDate(8.64e15 + 1, { fallback: '!' })).toBe('!')
    expect(core.formatDate(NaN, { fallback: '!' })).toBe('!')
    expect(core.formatDate(new Date(NaN), { fallback: '!' })).toBe('!')
    expect(core.formatDate(true as never, { fallback: '!' })).toBe('!')
  })
})
