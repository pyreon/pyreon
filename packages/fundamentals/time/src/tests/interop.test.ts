import { fromDate, localZone, now, setClock, toDate, today } from '../index'
import { now as coreNow, today as coreToday } from '../core'

describe('Date interop', () => {
  it('fromDate and toDate round-trip in an explicit zone', () => {
    const d = new Date(Date.UTC(2026, 10, 18, 13, 30))

    expect(fromDate(d, 'Europe/Prague')).toBe('2026-11-18T14:30')
    expect(toDate('2026-11-18T14:30', 'Europe/Prague').getTime()).toBe(d.getTime())
    expect(toDate('2026-11-18', 'UTC').getTime()).toBe(Date.UTC(2026, 10, 18))
    expect(toDate(123).getTime()).toBe(123)
    expect(fromDate(new Date(Date.UTC(2026, 10, 18, 13, 30, 5, 250)), 'UTC')).toBe('2026-11-18T13:30:05.250')
  })

  it('without a zone both use the runtime local zone, like new Date(y, m, d)', () => {
    const d = new Date(2026, 10, 18, 14, 30)

    expect(fromDate(d)).toBe('2026-11-18T14:30')
    expect(toDate('2026-11-18T14:30').getTime()).toBe(d.getTime())
    expect(typeof localZone()).toBe('string')
  })

  it('rejects an invalid Date and non-date values with a [Pyreon] error', () => {
    expect(() => fromDate(new Date(Number.NaN))).toThrow(/\[Pyreon\] fromDate: expected a valid Date/)
    expect(() => toDate('nope' as '2026-01-01')).toThrow(/\[Pyreon\] toDate/)
  })
})

describe('the clock (reactive entry)', () => {
  afterEach(() => setClock(null))

  it('now() and today() read the pinned clock; core reads the system clock', () => {
    setClock(() => Date.UTC(2031, 5, 18, 16, 0))
    expect(now()).toBe(Date.UTC(2031, 5, 18, 16, 0))
    expect(today('Asia/Tokyo')).toBe('2031-06-19')
    expect(today('America/New_York')).toBe('2031-06-18')
    expect(today('UTC')).toBe('2031-06-18')
    expect(coreNow()).not.toBe(Date.UTC(2031, 5, 18, 16, 0))
    expect(coreToday('UTC')).not.toBe('2031-06-18')
  })

  it('setClock(null) restores the system clock', () => {
    setClock(() => 5)
    expect(now()).toBe(5)
    setClock(null)
    expect(Math.abs(now() - Date.now())).toBeLessThan(1000)
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
