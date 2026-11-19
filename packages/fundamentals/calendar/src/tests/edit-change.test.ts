import { describe, expect, it } from 'vitest'
import { applyEventChange, fitsWindows, nudgeTarget, reposition, resizeTarget } from '../edit'
import { expandOccurrences } from '../expand'
import type { CalendarEvent, EventOccurrence, PlainDate } from '../types'

const range = { start: '2026-11-01' as PlainDate, end: '2026-12-31' as PlainDate }
const starts = (events: CalendarEvent[], zone = 'UTC') => expandOccurrences(events, range, zone).map((o) => o.start)
const occ = (start: string, end: string, allDay = false): EventOccurrence => ({ key: 'k', start, end, allDay }) as unknown as EventOccurrence

describe('applyEventChange: single events', () => {
  it('a timed event made all-day says so, and an all-day event made timed drops the flag', () => {
    const timed: CalendarEvent = { id: 't', title: 'T', start: '2026-11-18T10:00', end: '2026-11-18T11:00' }
    expect(applyEventChange(timed, { event: timed, start: '2026-11-19', end: '2026-11-20', allDay: true })).toEqual([{ ...timed, start: '2026-11-19', end: '2026-11-20', allDay: true }])
    const flagged: CalendarEvent = { id: 'a', title: 'A', start: '2026-11-18', end: '2026-11-19', allDay: true }
    expect(applyEventChange(flagged, { event: flagged, start: '2026-11-18T09:00', end: '2026-11-18T10:00', allDay: false })).toEqual([{ ...flagged, start: '2026-11-18T09:00', end: '2026-11-18T10:00', allDay: false }])
    const plain: CalendarEvent = { id: 'p', title: 'P', start: '2026-11-18', end: '2026-11-19' }
    expect(applyEventChange(plain, { event: plain, start: '2026-11-18T09:00', end: '2026-11-18T10:00', allDay: false })[0]).not.toHaveProperty('allDay')
  })

  it('a recurring event changed without an occurrence is moved as a whole event', () => {
    const series: CalendarEvent = { id: 's', title: 'S', start: '2026-11-02T09:00', end: '2026-11-02T09:30', recurrence: { every: 'week', start: '2026-11-02T09:00', count: 2 } as never }
    const [n] = applyEventChange(series, { event: series, start: '2026-11-03T09:00', end: '2026-11-03T09:30', allDay: false })
    expect(n).toMatchObject({ start: '2026-11-03T09:00', recurrence: { start: '2026-11-02T09:00' } })
  })
})

describe('applyEventChange: recurring', () => {
  const daily: CalendarEvent = { id: 'd', title: 'D', start: '2026-11-02T09:00', end: '2026-11-02T10:00', recurrence: { every: 'day', start: '2026-11-02T09:00', count: 6 } as never }

  it('without a scope, a change of one occurrence is "this"', () => {
    const [n] = applyEventChange(daily, { event: daily, occurrence: '2026-11-04T09:00', start: '2026-11-04T11:00', end: '2026-11-04T12:00', allDay: false })
    expect(n!.overrides).toEqual({ '2026-11-04T09:00': { start: '2026-11-04T11:00', end: '2026-11-04T12:00' } })
  })

  it('"this" cannot switch one occurrence between all-day and timed, and says which way it was asked', () => {
    expect(() => applyEventChange(daily, { event: daily, occurrence: '2026-11-04T09:00', start: '2026-11-04', end: '2026-11-05', allDay: true, scope: 'this' })).toThrow('got "an all-day change for a timed event"')
    const days: CalendarEvent = { id: 'w', title: 'W', start: '2026-11-02', end: '2026-11-03', recurrence: { every: 'day', start: '2026-11-02', count: 3 } as never }
    expect(() => applyEventChange(days, { event: days, occurrence: '2026-11-03', start: '2026-11-03T09:00', end: '2026-11-03T10:00', allDay: false, scope: 'this' })).toThrow('got "a timed change for an all-day event"')
  })

  it('"following" keeps the earlier overrides on the ended series, moves the later ones by the shift, and counts what is left', () => {
    const e: CalendarEvent = { ...daily, overrides: { '2026-11-03T09:00': { title: 'early' }, '2026-11-06T09:00': { title: 'late' } } }
    const [ended, created] = applyEventChange(e, { event: e, occurrence: '2026-11-05T09:00', start: '2026-11-05T11:00', end: '2026-11-05T12:00', allDay: false, scope: 'following' })
    expect(ended!.recurrence).toEqual({ every: 'day', start: '2026-11-02T09:00', until: '2026-11-04' })
    expect(ended!.overrides).toEqual({ '2026-11-03T09:00': { title: 'early' } })
    expect(created!.id).toBe('d~2026-11-05T09:00')
    expect(created!.recurrence).toMatchObject({ start: '2026-11-05T11:00', count: 3 })
    expect(created!.overrides).toEqual({ '2026-11-06T11:00': { title: 'late' } })
    expect(starts([ended!, created!])).toEqual(['2026-11-02T09:00', '2026-11-03T09:00', '2026-11-04T09:00', '2026-11-05T11:00', '2026-11-06T11:00', '2026-11-07T11:00'])
  })

  it('"following" with no overrides before or after leaves both events without them; an open-ended rule stays open-ended', () => {
    const open: CalendarEvent = { id: 'o', title: 'O', start: '2026-11-02T09:00', end: '2026-11-02T10:00', recurrence: { every: 'day', start: '2026-11-02T09:00' } as never, overrides: { '2026-11-02T09:00': { title: 'first' } } }
    const [ended, created] = applyEventChange(open, { event: open, occurrence: '2026-11-05T09:00', start: '2026-11-05T09:00', end: '2026-11-05T11:00', allDay: false, scope: 'following' })
    expect(ended!.overrides).toEqual({ '2026-11-02T09:00': { title: 'first' } })
    expect(created).not.toHaveProperty('overrides')
    expect(created!.recurrence).not.toHaveProperty('count')
    expect(created).toMatchObject({ start: '2026-11-05T09:00', end: '2026-11-05T11:00' })
    const bare = applyEventChange(daily, { event: daily, occurrence: '2026-11-05T09:00', start: '2026-11-05T10:00', end: '2026-11-05T11:00', allDay: false, scope: 'following' })
    expect(bare[0]).not.toHaveProperty('overrides')
    expect(bare[1]).not.toHaveProperty('overrides')
  })

  it('an instant series stays in instants for "all" and "following"; the wall clock of its own zone is what shifts', () => {
    const at = (iso: string): number => Date.parse(iso)
    const instant: CalendarEvent = { id: 'i', title: 'I', start: at('2026-11-02T08:00:00Z'), end: at('2026-11-02T09:00:00Z'), timeZone: 'Europe/Prague', recurrence: { every: 'day', start: '2026-11-02T09:00', count: 4 } as never }
    const [all] = applyEventChange(instant, { event: instant, occurrence: '2026-11-03T09:00', start: at('2026-11-03T09:00:00Z'), end: at('2026-11-03T10:00:00Z'), allDay: false, scope: 'all' }, 'UTC')
    expect(all).toMatchObject({ start: at('2026-11-02T09:00:00Z'), end: at('2026-11-02T10:00:00Z'), recurrence: { start: '2026-11-02T10:00' } })
    const [, created] = applyEventChange(instant, { event: instant, occurrence: '2026-11-04T09:00', start: at('2026-11-04T09:00:00Z'), end: at('2026-11-04T10:00:00Z'), allDay: false, scope: 'following' }, 'UTC')
    expect(created).toMatchObject({ start: at('2026-11-04T09:00:00Z'), end: at('2026-11-04T10:00:00Z'), recurrence: { start: '2026-11-04T10:00', count: 2 } })
  })

  it('"all" on an all-day series moves dates and the override keys with them', () => {
    const days: CalendarEvent = { id: 'w', title: 'W', start: '2026-11-02', end: '2026-11-03', recurrence: { every: 'week', start: '2026-11-02', count: 3 } as never, overrides: { '2026-11-09': { title: 'two' } } }
    const [n] = applyEventChange(days, { event: days, occurrence: '2026-11-09', start: '2026-11-10', end: '2026-11-11', allDay: true, scope: 'all' })
    expect(n).toMatchObject({ start: '2026-11-03', end: '2026-11-04', recurrence: { start: '2026-11-03' }, overrides: { '2026-11-10': { title: 'two' } } })
  })
})

describe('reposition, fitsWindows', () => {
  it('an all-day target is a pair of dates whatever the event was', () => {
    expect(reposition(occ('2026-11-18T09:00', '2026-11-18T10:00'), { start: '2026-11-19', end: '2026-11-20', allDay: true }, 'Europe/Prague')).toEqual({ start: '2026-11-19', end: '2026-11-20', allDay: true })
  })

  it('dates always fit; a day with no hours fits; an end at midnight is the end of the day before; a range over two days needs both', () => {
    const nine = (): { from: number; to: number }[] => [{ from: 540, to: 1020 }]
    expect(fitsWindows('2026-11-18', '2026-11-19', () => [])).toBe(true)
    expect(fitsWindows('2026-11-18T08:00', '2026-11-18T09:00', () => null)).toBe(true)
    expect(fitsWindows('2026-11-18T09:00', '2026-11-18T17:00', nine)).toBe(true)
    expect(fitsWindows('2026-11-18T09:00', '2026-11-18T17:30', nine)).toBe(false)
    const always = (): { from: number; to: number }[] => [{ from: 0, to: 1440 }]
    expect(fitsWindows('2026-11-18T22:00', '2026-11-19T00:00', always)).toBe(true)
    expect(fitsWindows('2026-11-18T22:00', '2026-11-19T00:00', (d) => (d === '2026-11-19' ? [] : always()))).toBe(true)
    expect(fitsWindows('2026-11-18T22:00', '2026-11-19T01:00', (d) => (d === '2026-11-19' ? [{ from: 120, to: 300 }] : always()))).toBe(false)
    expect(fitsWindows('2026-11-18T22:00', '2026-11-19T01:00', always)).toBe(true)
  })
})

describe('resizeTarget over day cells, nudgeTarget', () => {
  it('a timed event resized over day cells moves its edge by whole days and keeps the time of day, never past the other edge', () => {
    const o = occ('2026-11-18T09:00', '2026-11-19T18:00')
    expect(resizeTarget(o, 'end', { date: '2026-11-21', minute: null }, 30, 30)).toEqual({ start: '2026-11-18T09:00', end: '2026-11-21T18:00', allDay: false })
    expect(resizeTarget(o, 'start', { date: '2026-11-16', minute: null }, 30, 30)).toEqual({ start: '2026-11-16T09:00', end: '2026-11-19T18:00', allDay: false })
    expect(resizeTarget(o, 'end', { date: '2026-11-17', minute: null }, 30, 30)).toEqual({ start: '2026-11-18T09:00', end: '2026-11-18T09:30', allDay: false })
    expect(resizeTarget(o, 'start', { date: '2026-11-25', minute: null }, 30, 30)).toEqual({ start: '2026-11-19T17:30', end: '2026-11-19T18:00', allDay: false })
  })

  it('nudge: an all-day event by days (Shift resizes it, never below a day); a timed event in the month by days', () => {
    const day = occ('2026-11-18', '2026-11-20', true)
    expect(nudgeTarget(day, 'ArrowDown', { grid: 'time', snap: 30, minDuration: 30 })).toEqual({ start: '2026-11-25', end: '2026-11-27', allDay: true })
    expect(nudgeTarget(day, 'ArrowRight', { grid: 'month', snap: 30, minDuration: 30, shift: true })).toEqual({ start: '2026-11-18', end: '2026-11-21', allDay: true })
    expect(nudgeTarget(day, 'ArrowUp', { grid: 'month', snap: 30, minDuration: 30, shift: true })).toEqual({ start: '2026-11-18', end: '2026-11-19', allDay: true })
    const timed = occ('2026-11-18T09:00', '2026-11-18T10:00')
    expect(nudgeTarget(timed, 'ArrowLeft', { grid: 'month', snap: 30, minDuration: 30, shift: true })).toEqual({ start: '2026-11-18T09:00', end: '2026-11-18T09:30', allDay: false })
    expect(nudgeTarget(timed, 'ArrowRight', { grid: 'month', snap: 30, minDuration: 30, shift: true })).toEqual({ start: '2026-11-18T09:00', end: '2026-11-19T10:00', allDay: false })
    expect(nudgeTarget(timed, 'ArrowDown', { grid: 'month', snap: 30, minDuration: 30, shift: true })).toBeNull()
  })
})
