import { describe, expect, it } from 'vitest'
import { addBusinessDays, addBusinessTime, businessDaysBetween, businessTimeBetween, isBusinessDay, isOpen, nextBusinessDay, nextClosing, nextOpening, openingWindows, previousBusinessDay } from '../core'
import { int, rng } from './rng'
import type { BusinessCalendar } from '../types'

const nine5 = [{ from: '09:00', to: '17:00' }] as const
const office: BusinessCalendar = { hours: { 1: nine5, 2: nine5, 3: nine5, 4: nine5, 5: nine5 } }

describe('business days', () => {
  it('weekends default to Saturday and Sunday, and can be changed (Friday and Saturday, or none)', () => {
    expect(isBusinessDay('2026-11-20', {})).toBe(true)
    expect(isBusinessDay('2026-11-21', {})).toBe(false)
    expect(isBusinessDay('2026-11-22', {})).toBe(false)
    expect(isBusinessDay('2026-11-20', { weekend: [5, 6] })).toBe(false)
    expect(isBusinessDay('2026-11-22', { weekend: [5, 6] })).toBe(true)
    expect(isBusinessDay('2026-11-21', { weekend: [] })).toBe(true)
    expect(isBusinessDay('2026-11-20T23:00', {})).toBe(true)
  })

  it('holidays are a list or a predicate; no holiday data is shipped', () => {
    expect(isBusinessDay('2026-12-25', { holidays: ['2026-12-25'] })).toBe(false)
    expect(isBusinessDay('2026-12-24', { holidays: ['2026-12-25'] })).toBe(true)
    const cal: BusinessCalendar = { holidays: (d) => d.endsWith('-12-25') || d.endsWith('-01-01') }

    expect(isBusinessDay('2027-01-01', cal)).toBe(false)
    expect(isBusinessDay('2027-01-04', cal)).toBe(true)
  })

  it('a holidays predicate that throws gives an error that names the date and the fix', () => {
    const cal: BusinessCalendar = { holidays: () => { throw new Error('API down') } }

    expect(() => isBusinessDay('2026-11-18', cal)).toThrow(/\[Pyreon\] isBusinessDay: the holidays predicate threw for 2026-11-18: API down\. A holidays predicate must return a boolean/)
  })

  it('a holidays predicate that does not return a boolean is an error, not a silent "no holiday"', () => {
    expect(() => isBusinessDay('2026-11-18', { holidays: (() => 'yes') as never })).toThrow(/returned "yes" for 2026-11-18\. A holidays predicate must return true or false/)
    expect(() => isBusinessDay('2026-11-18', { holidays: (() => undefined) as never })).toThrow(/returned undefined/)
  })

  it('addBusinessDays steps over weekends and holidays, in both directions, and zero is the date itself', () => {
    expect(addBusinessDays('2026-11-20', 1, {})).toBe('2026-11-23')
    expect(addBusinessDays('2026-11-21', 1, {})).toBe('2026-11-23')
    expect(addBusinessDays('2026-11-23', -1, {})).toBe('2026-11-20')
    expect(addBusinessDays('2026-11-21', 0, {})).toBe('2026-11-21')
    expect(addBusinessDays('2026-12-24', 2, { holidays: ['2026-12-25'] })).toBe('2026-12-29')
    expect(addBusinessDays('2026-11-18', 260, {})).toBe('2027-11-17')
    expect(addBusinessDays('2026-11-18', -5, { weekend: [] })).toBe('2026-11-13')
  })

  it('nextBusinessDay and previousBusinessDay are strict', () => {
    expect(nextBusinessDay('2026-11-19', {})).toBe('2026-11-20')
    expect(nextBusinessDay('2026-11-20', {})).toBe('2026-11-23')
    expect(previousBusinessDay('2026-11-23', {})).toBe('2026-11-20')
    expect(previousBusinessDay('2026-11-21', {})).toBe('2026-11-20')
  })

  it('businessDaysBetween counts from a (included) to b (excluded), negative backwards, and agrees with addBusinessDays', () => {
    expect(businessDaysBetween('2026-11-16', '2026-11-23', {})).toBe(5)
    expect(businessDaysBetween('2026-11-23', '2026-11-16', {})).toBe(-5)
    expect(businessDaysBetween('2026-11-21', '2026-11-22', {})).toBe(0)
    expect(businessDaysBetween('2026-11-16', '2026-11-16', {})).toBe(0)
    const r = rng(5)
    const cal: BusinessCalendar = { holidays: ['2026-12-25', '2027-01-01'] }

    for (let i = 0; i < 300; i++) {
      const a = addBusinessDays('2026-11-02', int(r, 0, 120), cal)
      const b = addBusinessDays(a, int(r, 0, 90), cal)

      expect(addBusinessDays(a, businessDaysBetween(a, b, cal), cal)).toBe(b)
    }
  })

  it('a calendar with no business day at all is an error, not a loop', () => {
    expect(() => nextBusinessDay('2026-11-18', { weekend: [1, 2, 3, 4, 5, 6, 7] })).toThrow(/every day is a weekend or a holiday/)
  })

  it('bad input names the function and the fix', () => {
    expect(() => addBusinessDays('2026-11-18', 1.5, {})).toThrow(/n must be a whole number/)
    expect(() => addBusinessDays('2026-11-18', 1, { weekend: [8 as never] })).toThrow(/weekend entries are ISO weekdays/)
    expect(() => isBusinessDay('nope' as never, {})).toThrow(/\[Pyreon\] isBusinessDay: expected date/)
    expect(() => isBusinessDay('2026-11-18', { holidays: 5 as never })).toThrow(/holidays to be an array/)
  })
})

describe('business time', () => {
  it('"8 working hours from Friday 15:00" is Monday 15:00', () => {
    expect(addBusinessTime('2026-11-20T15:00', { hours: 8 }, office)).toBe('2026-11-23T15:00')
  })

  it('starts counting at the next opening when started outside hours, and ends at closing time when it fills the window', () => {
    expect(addBusinessTime('2026-11-21T10:00', { hours: 1 }, office)).toBe('2026-11-23T10:00')
    expect(addBusinessTime('2026-11-20T20:00', { hours: 1 }, office)).toBe('2026-11-23T10:00')
    expect(addBusinessTime('2026-11-18T09:00', { hours: 8 }, office)).toBe('2026-11-18T17:00')
    expect(addBusinessTime('2026-11-18T09:00', { hours: 8, minutes: 30 }, office)).toBe('2026-11-19T09:30')
    expect(addBusinessTime('2026-11-18T10:00', { minutes: 0 }, office)).toBe('2026-11-18T10:00')
  })

  it('skips holidays and works backwards for a negative duration', () => {
    expect(addBusinessTime('2026-12-24T16:00', { hours: 2 }, { ...office, holidays: ['2026-12-25'] })).toBe('2026-12-28T10:00')
    expect(addBusinessTime('2026-11-23T10:00', { hours: -2 }, office)).toBe('2026-11-20T16:00')
    expect(addBusinessTime('2026-11-23T09:00', { hours: -1 }, office)).toBe('2026-11-20T16:00')
  })

  it('handles split shifts', () => {
    const split: BusinessCalendar = { hours: { 3: [{ from: '09:00', to: '12:00' }, { from: '13:00', to: '17:00' }] } }

    expect(addBusinessTime('2026-11-18T11:00', { hours: 2 }, split)).toBe('2026-11-18T14:00')
    expect(businessTimeBetween('2026-11-18T08:00', '2026-11-18T18:00', split)).toEqual({ hours: 7, minutes: 0 })
  })

  it('handles overnight shifts: a 22:00 to 06:00 window belongs to the day it starts on', () => {
    const night: BusinessCalendar = { hours: { 5: [{ from: '22:00', to: '06:00' }] } }

    expect(isOpen('2026-11-20T23:00', night)).toBe(true)
    expect(isOpen('2026-11-21T05:59', night)).toBe(true)
    expect(isOpen('2026-11-21T06:00', night)).toBe(false)
    expect(isOpen('2026-11-20T21:59', night)).toBe(false)
    expect(addBusinessTime('2026-11-20T23:00', { hours: 3 }, night)).toBe('2026-11-21T02:00')
    expect(addBusinessTime('2026-11-20T23:00', { hours: 9 }, night)).toBe('2026-11-28T00:00')
    expect(businessTimeBetween('2026-11-20T00:00', '2026-11-22T00:00', night)).toEqual({ hours: 8, minutes: 0 })
  })

  it('overlapping and touching windows are merged; a whole-day window is "00:00" to "00:00"', () => {
    const cal: BusinessCalendar = { hours: { 2: [{ from: '09:00', to: '13:00' }, { from: '12:00', to: '15:00' }, { from: '15:00', to: '17:00' }] } }

    expect(businessTimeBetween('2026-11-17T00:00', '2026-11-18T00:00', cal)).toEqual({ hours: 8, minutes: 0 })
    expect(businessTimeBetween('2026-11-17T00:00', '2026-11-18T00:00', { hours: { 2: [{ from: '00:00', to: '00:00' }] } })).toEqual({ hours: 24, minutes: 0 })
  })

  it('businessTimeBetween counts only open time, negative backwards, with seconds when needed', () => {
    expect(businessTimeBetween('2026-11-20T15:00', '2026-11-23T11:00', office)).toEqual({ hours: 4, minutes: 0 })
    expect(businessTimeBetween('2026-11-23T11:00', '2026-11-20T15:00', office)).toEqual({ hours: -4, minutes: 0 })
    expect(businessTimeBetween('2026-11-23T11:00', '2026-11-23T11:00', office)).toEqual({ hours: 0, minutes: 0 })
    expect(businessTimeBetween('2026-11-23T09:00:10', '2026-11-23T09:01', office)).toEqual({ hours: 0, minutes: 0, seconds: 50 })
  })

  it('isOpen is half-open; nextOpening and nextClosing are strictly after', () => {
    expect(isOpen('2026-11-18T09:00', office)).toBe(true)
    expect(isOpen('2026-11-18T17:00', office)).toBe(false)
    expect(isOpen('2026-11-21T12:00', office)).toBe(false)
    expect(nextOpening('2026-11-20T18:00', office)).toBe('2026-11-23T09:00')
    expect(nextOpening('2026-11-18T10:00', office)).toBe('2026-11-19T09:00')
    expect(nextOpening('2026-11-18T09:00', office)).toBe('2026-11-19T09:00')
    expect(nextClosing('2026-11-18T10:00', office)).toBe('2026-11-18T17:00')
    expect(nextClosing('2026-11-18T17:00', office)).toBe('2026-11-19T17:00')
    expect(nextClosing('2026-11-21T10:00', office)).toBe('2026-11-23T17:00')
  })

  it('no open hours: counting time is an error, asking about opening is null or false', () => {
    expect(() => addBusinessTime('2026-11-18T10:00', { hours: 1 }, { hours: {} })).toThrow(/no open hours/)
    expect(() => addBusinessTime('2026-11-18T10:00', { hours: 1 }, {})).toThrow(/has no hours/)
    expect(isOpen('2026-11-18T10:00', { hours: {} })).toBe(false)
    expect(nextOpening('2026-11-18T10:00', { hours: {} })).toBeNull()
    expect(nextClosing('2026-11-18T10:00', { hours: { 1: [] } })).toBeNull()
    expect(businessTimeBetween('2026-11-18T00:00', '2026-12-18T00:00', { hours: {} })).toEqual({ hours: 0, minutes: 0 })
  })

  it('rejects empty windows, bad times, bad keys, calendar units in durations', () => {
    expect(() => isOpen('2026-11-18T10:00', { hours: { 1: [{ from: '09:00', to: '09:00' }] } })).toThrow(/is empty/)
    expect(() => isOpen('2026-11-18T10:00', { hours: { 1: [{ from: '9', to: '17:00' }] } as never })).toThrow(/PlainTime/)
    expect(() => isOpen('2026-11-18T10:00', { hours: { 9: nine5 } as never })).toThrow(/keys are ISO weekdays/)
    expect(() => addBusinessTime('2026-11-18T10:00', { days: 1 }, office)).toThrow(/Use addBusinessDays for days/)
    expect(() => addBusinessTime('2026-11-18T10:00', 'PT1H' as never, office)).toThrow(/Duration/)
  })

  it('a throwing holidays predicate fails the time functions too', () => {
    const cal: BusinessCalendar = { ...office, holidays: () => { throw new Error('boom') } }

    expect(() => addBusinessTime('2026-11-18T10:00', { hours: 1 }, cal)).toThrow(/predicate threw/)
  })
})

describe('specialHours: a date with its own opening windows (#4806)', () => {
  const shortDay = [{ from: '09:00', to: '13:00' }] as const
  const xmas: BusinessCalendar = { ...office, holidays: ['2026-12-25'], specialHours: { '2026-12-24': shortDay } }

  it('replaces the weekday hours for that date in isOpen, nextOpening and nextClosing', () => {
    expect(isOpen('2026-12-24T15:00', xmas)).toBe(false)
    expect(isOpen('2026-12-24T12:59', xmas)).toBe(true)
    expect(nextClosing('2026-12-24T10:00', xmas)).toBe('2026-12-24T13:00')
    expect(nextOpening('2026-12-24T13:00', xmas)).toBe('2026-12-28T09:00')
    expect(nextClosing('2026-12-23T10:00', xmas)).toBe('2026-12-23T17:00')
  })

  it('counts only the special windows in addBusinessTime and businessTimeBetween', () => {
    expect(businessTimeBetween('2026-12-23T09:00', '2026-12-28T09:00', xmas)).toEqual({ hours: 12, minutes: 0 })
    expect(addBusinessTime('2026-12-24T12:00', { hours: 2 }, xmas)).toBe('2026-12-28T10:00')
    expect(addBusinessTime('2026-12-28T10:00', { hours: -2 }, xmas)).toBe('2026-12-24T12:00')
  })

  it('opens a weekend day or a holiday, and an empty list closes a working day', () => {
    const cal: BusinessCalendar = { ...office, holidays: ['2026-12-25'], specialHours: { '2026-12-26': shortDay, '2026-12-25': shortDay, '2026-12-23': [] } }

    expect(isBusinessDay('2026-12-26', cal)).toBe(true)
    expect(isBusinessDay('2026-12-25', cal)).toBe(true)
    expect(isBusinessDay('2026-12-23', cal)).toBe(false)
    expect(isOpen('2026-12-26T10:00', cal)).toBe(true)
    expect(isOpen('2026-12-23T10:00', cal)).toBe(false)
    expect(nextOpening('2026-12-22T18:00', cal)).toBe('2026-12-24T09:00')
    expect(addBusinessDays('2026-12-22', 1, cal)).toBe('2026-12-24')
    expect(addBusinessDays('2026-12-24', 2, cal)).toBe('2026-12-26')
    expect(businessDaysBetween('2026-12-21', '2026-12-28', cal)).toBe(5)
    expect(nextBusinessDay('2026-12-26', cal)).toBe('2026-12-28')
    expect(previousBusinessDay('2026-12-24', cal)).toBe('2026-12-22')
  })

  it('takes a function, which returns a date\'s windows or undefined for the usual hours', () => {
    const cal: BusinessCalendar = { ...office, specialHours: (d) => (d.endsWith('-12-24') || d.endsWith('-12-31') ? shortDay : undefined) }

    expect(nextClosing('2027-12-31T09:30', cal)).toBe('2027-12-31T13:00')
    expect(isOpen('2026-12-24T14:00', cal)).toBe(false)
    expect(isOpen('2026-12-22T14:00', cal)).toBe(true)
  })

  it('needs no weekday hours, and handles overnight and split windows like hours do', () => {
    const cal: BusinessCalendar = { specialHours: { '2026-12-31': [{ from: '22:00', to: '02:00' }, { from: '10:00', to: '12:00' }] } }

    expect(isOpen('2027-01-01T01:00', cal)).toBe(true)
    expect(isOpen('2026-12-31T13:00', cal)).toBe(false)
    expect(businessTimeBetween('2026-12-31T00:00', '2027-01-02T00:00', cal)).toEqual({ hours: 6, minutes: 0 })
    expect(nextOpening('2026-12-31T12:00', cal)).toBe('2026-12-31T22:00')
  })

  it('rejects malformed entries with a [Pyreon] error naming the problem', () => {
    expect(() => isOpen('2026-12-24T10:00', { ...office, specialHours: { 'Dec 24': shortDay } as never })).toThrow(/\[Pyreon\] isOpen.*specialHours date/)
    expect(() => isOpen('2026-12-24T10:00', { ...office, specialHours: { '2026-12-24': 'closed' } as never })).toThrow(/\[Pyreon\] isOpen.*specialHours\[2026-12-24\]/)
    expect(() => isOpen('2026-12-24T10:00', { ...office, specialHours: { '2026-12-24': [{ from: '9am', to: '13:00' }] } as never })).toThrow(/\[Pyreon\] isOpen.*PlainTime/)
    expect(() => isOpen('2026-12-24T10:00', { ...office, specialHours: (() => 'closed') as never })).toThrow(/\[Pyreon\] isOpen.*specialHours function returned "closed" for 2026-12-2[34]/)
    expect(() => isOpen('2026-12-24T10:00', { ...office, specialHours: () => { throw new Error('offline') } })).toThrow(/specialHours function threw for 2026-12-2[34]: offline/)
    expect(() => isOpen('2026-12-24T10:00', { ...office, specialHours: [shortDay] as never })).toThrow(/\[Pyreon\] isOpen.*specialHours to be an object/)
  })
})

describe('openingWindows: the open times within one date', () => {
  const shortDay = [{ from: '09:00', to: '13:00' }] as const

  it('gives a date its special windows, its weekday hours, or none', () => {
    const cal: BusinessCalendar = { ...office, holidays: ['2026-12-25'], specialHours: { '2026-12-24': shortDay } }

    expect(openingWindows('2026-12-24', cal)).toEqual([{ start: '2026-12-24T09:00', end: '2026-12-24T13:00' }])
    expect(openingWindows('2026-12-23', cal)).toEqual([{ start: '2026-12-23T09:00', end: '2026-12-23T17:00' }])
    expect(openingWindows('2026-12-25', cal)).toEqual([])
    expect(openingWindows('2026-12-26', cal)).toEqual([])
  })

  it('includes the previous night\'s overnight tail even on a closed date, and cuts its own overnight window at midnight', () => {
    const cal: BusinessCalendar = { hours: { 4: [{ from: '22:00', to: '02:00' }] }, weekend: [], specialHours: { '2026-12-25': [] } }

    expect(openingWindows('2026-12-24', cal)).toEqual([{ start: '2026-12-24T22:00', end: '2026-12-25T00:00' }])
    expect(openingWindows('2026-12-25', cal)).toEqual([{ start: '2026-12-25T00:00', end: '2026-12-25T02:00' }])
    expect(isOpen('2026-12-25T01:00', cal)).toBe(true)
  })
})

describe('a calendar needs some working time to count', () => {
  it('rejects no hours and a specialHours map without any window, with the "no hours" error', () => {
    for (const cal of [{}, { specialHours: {} }, { specialHours: { '2026-12-24': [] } }] as BusinessCalendar[]) {
      expect(() => isOpen('2026-12-24T10:00', cal)).toThrow(/\[Pyreon\] isOpen.*no hours/)
      expect(() => addBusinessTime('2026-12-24T10:00', { hours: 1 }, cal)).toThrow(/\[Pyreon\] addBusinessTime.*no hours/)
      expect(() => openingWindows('2026-12-24', cal)).toThrow(/\[Pyreon\] openingWindows.*no hours/)
    }
  })

  it('accepts a specialHours function without hours (it cannot be inspected): one that never opens is a calendar that never opens', () => {
    const never: BusinessCalendar = { specialHours: () => undefined }

    expect(isOpen('2026-12-24T10:00', never)).toBe(false)
    expect(nextOpening('2026-12-24T10:00', never)).toBe(null)
    expect(() => addBusinessTime('2026-12-24T10:00', { hours: 1 }, never)).toThrow(/no open hours within 3660 days/)
  })
})
