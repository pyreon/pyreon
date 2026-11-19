import { describe, expect, it } from 'vitest'
import { allDay, expandOccurrences } from '../core'
import type { CalendarEvent } from '../core'

const range = { start: '2026-11-16', end: '2026-11-23' } as const
const run = (events: CalendarEvent[], zone = 'UTC') => expandOccurrences(events, range, zone)

describe('allDay', () => {
  it('ends on the next day, or the given number of days later', () => {
    expect(allDay('2026-11-18')).toEqual({ start: '2026-11-18', end: '2026-11-19', allDay: true })
    expect(allDay('2026-11-30', 3).end).toBe('2026-12-03')
    expect(allDay('2028-02-28', 2).end).toBe('2028-03-01')
  })

  it('rejects a bad date and a bad count with a [Pyreon] error', () => {
    expect(() => allDay('18 Nov' as never)).toThrow('[Pyreon] allDay: date must be a date')
    expect(() => allDay('2026-11-18', 0)).toThrow('days must be a whole number')
    expect(() => allDay('2026-11-18', 1.5)).toThrow('days must be a whole number')
  })
})

describe('validation of events', () => {
  const ok: CalendarEvent = { id: 'a', title: 'A', start: '2026-11-18T09:00', end: '2026-11-18T10:00' }
  const bad: [string, Partial<CalendarEvent>, string][] = [
    ['an empty id', { id: '' }, 'non-empty string id'],
    ['a missing title', { title: undefined as never }, 'needs a string title'],
    ['a start that is not a time', { start: 'tomorrow' as never }, 'needs a start and an end'],
    ['a date with a date-time', { start: '2026-11-18', end: '2026-11-18T10:00' }, 'mixes a date and a time'],
    ['allDay with times', { allDay: true }, 'marked allDay but its start and end are not dates'],
    ['allDay false with dates', { allDay: false, start: '2026-11-18', end: '2026-11-19' }, 'which makes it an all-day event'],
    ['an unknown zone', { timeZone: 'Mars/Olympus' }, 'unknown timeZone'],
    ['an end before the start', { end: '2026-11-18T08:00' }, 'ends before it starts'],
    ['an all-day end before the start', { start: '2026-11-19', end: '2026-11-18' }, 'ends before it starts'],
  ]
  it.each(bad)('rejects %s, naming the event', (_name, patch, message) => {
    expect(() => run([{ ...ok, ...patch }])).toThrow('[Pyreon] expandOccurrences:')
    expect(() => run([{ ...ok, ...patch }])).toThrow(message)
  })

  it('accepts a zero-length timed event (a moment) and treats a zero-length all-day event as one day', () => {
    const [moment] = run([{ ...ok, end: ok.start }])
    expect(moment!.start).toBe(moment!.end)
    const [day] = run([{ id: 'd', title: 'D', start: '2026-11-18', end: '2026-11-18' }])
    expect([day!.start, day!.end]).toEqual(['2026-11-18', '2026-11-19'])
  })

  it('does not accept a non-object', () => {
    expect(() => run([null as never])).toThrow('an event must be an object')
  })
})
