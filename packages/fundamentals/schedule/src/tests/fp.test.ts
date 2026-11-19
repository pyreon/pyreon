import { describe, expect, it } from 'vitest'
import * as core from '../core'
import * as fp from '../fp'
import type { BusinessCalendar, Interval, Recurrence } from '../core'

const rule: Recurrence = { every: 'week', start: '2026-11-02T09:00', on: { weekdays: [1, 3] } }
const cal: BusinessCalendar = { holidays: ['2026-11-24'], hours: { 1: [{ from: '09:00', to: '17:00' }], 2: [{ from: '09:00', to: '17:00' }] } }
const a: Interval = { start: '2026-11-18T09:00', end: '2026-11-18T11:00' }
const b: Interval = { start: '2026-11-18T10:00', end: '2026-11-18T12:00' }

describe('value-last forms give what the core functions give', () => {
  it('recurrence', () => {
    expect(fp.occurrencesBetween('2026-11-02', '2026-11-18')(rule)).toEqual(core.occurrencesBetween(rule, '2026-11-02', '2026-11-18'))
    expect(fp.nextOccurrence('2026-11-04')(rule)).toEqual(core.nextOccurrence(rule, '2026-11-04'))
    expect(fp.previousOccurrence('2026-11-04')(rule)).toEqual(core.previousOccurrence(rule, '2026-11-04'))
    expect(fp.occursOn('2026-11-04')(rule)).toBe(core.occursOn(rule, '2026-11-04'))
    expect(fp.describeRule({ locale: 'en' })(rule)).toBe(core.describeRule(rule, { locale: 'en' }))
  })

  it('business', () => {
    expect(fp.isBusinessDay(cal)('2026-11-24')).toBe(false)
    expect(fp.addBusinessDays(3, cal)('2026-11-20')).toBe(core.addBusinessDays('2026-11-20', 3, cal))
    expect(fp.businessDaysBetween('2026-11-30', cal)('2026-11-16')).toBe(core.businessDaysBetween('2026-11-16', '2026-11-30', cal))
    expect(fp.nextBusinessDay(cal)('2026-11-23')).toBe(core.nextBusinessDay('2026-11-23', cal))
    expect(fp.previousBusinessDay(cal)('2026-11-25')).toBe(core.previousBusinessDay('2026-11-25', cal))
    expect(fp.addBusinessTime({ hours: 10 }, cal)('2026-11-23T10:00')).toBe(core.addBusinessTime('2026-11-23T10:00', { hours: 10 }, cal))
    expect(fp.isOpen(cal)('2026-11-23T10:00')).toBe(true)
    expect(fp.nextOpening(cal)('2026-11-23T10:00')).toBe(core.nextOpening('2026-11-23T10:00', cal))
    expect(fp.nextClosing(cal)('2026-11-23T10:00')).toBe('2026-11-23T17:00')
  })

  it('intervals and events', () => {
    expect(fp.overlaps(b)(a)).toBe(true)
    expect(fp.intersection(b)(a)).toEqual({ start: '2026-11-18T10:00', end: '2026-11-18T11:00' })
    expect(fp.subtractIntervals([b])([a])).toEqual(core.subtractIntervals([a], [b]))
    const events = [{ id: 'x', start: '2026-11-18T09:00', end: '2026-11-18T10:00' }] as const

    expect(fp.expandEvents({ start: '2026-11-18T00:00', end: '2026-11-19T00:00' })([...events])).toEqual(core.expandEvents([...events], { start: '2026-11-18T00:00', end: '2026-11-19T00:00' }))
  })

  it('errors are the core errors, naming the core function', () => {
    expect(() => fp.nextOccurrence('nope' as never)(rule)).toThrow(/\[Pyreon\] nextOccurrence: /)
    expect(() => fp.addBusinessDays(1.5, cal)('2026-11-20')).toThrow(/\[Pyreon\] addBusinessDays: /)
  })

  it('every fp name is also a core name (the same idea, value last)', () => {
    for (const name of Object.keys(fp)) expect(name in core, name).toBe(true)
  })
})
