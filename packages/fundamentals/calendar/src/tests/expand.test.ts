import { describe, expect, it } from 'vitest'
import { expandOccurrences } from '../core'
import type { CalendarEvent } from '../core'

const week = { start: '2026-11-16', end: '2026-11-23' } as const

describe('what an event is shown as', () => {
  it('shows an instant in the display zone, and a floating wall clock as written', () => {
    const instant = Date.UTC(2026, 10, 18, 13, 0)
    const [a, b] = expandOccurrences(
      [
        { id: 'i', title: 'Instant', start: instant, end: instant + 3_600_000 },
        { id: 'f', title: 'Floating', start: '2026-11-18T14:00', end: '2026-11-18T15:00' },
      ],
      week,
      'America/New_York',
    )
    expect([a!.key, a!.start, a!.end]).toEqual([`i:${instant}`, '2026-11-18T08:00', '2026-11-18T09:00'])
    expect([b!.key, b!.start, b!.end]).toEqual(['f:2026-11-18T14:00', '2026-11-18T14:00', '2026-11-18T15:00'])
  })

  it('shows 9:00 in Prague as 3:00 to a viewer in New York, and in the same place for a viewer in Prague', () => {
    const e: CalendarEvent = { id: 'p', title: 'P', start: '2026-11-18T09:00', end: '2026-11-18T10:00', timeZone: 'Europe/Prague' }
    expect(expandOccurrences([e], week, 'America/New_York')[0]!.start).toBe('2026-11-18T03:00')
    expect(expandOccurrences([e], week, 'Europe/Prague')[0]!.start).toBe('2026-11-18T09:00')
    expect(expandOccurrences([e], week, 'Asia/Tokyo')[0]!.start).toBe('2026-11-18T17:00')
  })

  it('never moves an all-day event, whatever the zone', () => {
    const e: CalendarEvent = { id: 'h', title: 'Holiday', start: '2026-11-18', end: '2026-11-19' }
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC', 'Asia/Kolkata']) {
      const [o] = expandOccurrences([e], week, zone)
      expect([o!.start, o!.end, o!.allDay]).toEqual(['2026-11-18', '2026-11-19', true])
    }
  })

  it('moves an event whose own zone puts it on another day of the display zone', () => {
    const e: CalendarEvent = { id: 'late', title: 'L', start: '2026-11-18T23:30', end: '2026-11-19T00:30', timeZone: 'America/Los_Angeles' }
    expect(expandOccurrences([e], week, 'Europe/Prague')[0]!.start).toBe('2026-11-19T08:30')
  })

  it('keeps events outside the window out, and an event that ends exactly at the window start out', () => {
    const list: CalendarEvent[] = [
      { id: 'before', title: 'b', start: '2026-11-15T10:00', end: '2026-11-15T11:00' },
      { id: 'touching', title: 't', start: '2026-11-15T23:00', end: '2026-11-16T00:00' },
      { id: 'inside', title: 'i', start: '2026-11-22T23:00', end: '2026-11-23T00:00' },
      { id: 'after', title: 'a', start: '2026-11-23T00:00', end: '2026-11-23T01:00' },
      { id: 'across', title: 'c', start: '2026-11-15T22:00', end: '2026-11-16T02:00' },
    ]
    expect(expandOccurrences(list, week, 'UTC').map((o) => o.key.split(':')[0])).toEqual(['across', 'inside'])
  })

  it('shows a 400-day event in every window it touches, once', () => {
    const e: CalendarEvent = { id: 'long', title: 'Long', start: '2026-01-01', end: '2027-02-05' }
    expect(expandOccurrences([e], week, 'UTC')).toHaveLength(1)
    expect(expandOccurrences([e], { start: '2027-02-01', end: '2027-02-08' }, 'UTC')).toHaveLength(1)
    expect(expandOccurrences([e], { start: '2027-02-05', end: '2027-02-12' }, 'UTC')).toHaveLength(0)
  })
})

describe('recurring events', () => {
  const standup: CalendarEvent = {
    id: 'standup',
    title: 'Standup',
    start: '2026-11-16T09:00',
    end: '2026-11-16T09:15',
    timeZone: 'Europe/Prague',
    recurrence: { every: 'day', start: '2026-11-16T09:00', count: 5 },
    overrides: { '2026-11-17T09:00': { cancelled: true }, '2026-11-18T09:00': { title: 'Moved', start: '2026-11-18T10:00', end: '2026-11-18T10:15' } },
  }

  it('expands over the window with a cancellation and a moved occurrence, in the display zone, with stable keys', () => {
    const got = expandOccurrences([standup], week, 'America/New_York').map((o) => [o.key, o.title, o.start])
    expect(got).toEqual([
      ['standup:2026-11-16T09:00', 'Standup', '2026-11-16T03:00'],
      ['standup:2026-11-18T09:00', 'Moved', '2026-11-18T04:00'],
      ['standup:2026-11-19T09:00', 'Standup', '2026-11-19T03:00'],
      ['standup:2026-11-20T09:00', 'Standup', '2026-11-20T03:00'],
    ])
    // the same occurrence has the same key in another window
    const later = expandOccurrences([standup], { start: '2026-11-19', end: '2026-11-21' }, 'America/New_York').map((o) => o.key)
    expect(later).toEqual(['standup:2026-11-19T09:00', 'standup:2026-11-20T09:00'])
  })

  it('keeps the wall-clock time of a recurring event across a DST change of its own zone', () => {
    const e: CalendarEvent = { id: 'd', title: 'D', start: '2026-10-23T09:00', end: '2026-10-23T10:00', timeZone: 'Europe/Prague', recurrence: { every: 'day', start: '2026-10-23T09:00', count: 5 } }
    const got = expandOccurrences([e], { start: '2026-10-23', end: '2026-10-29' }, 'UTC').map((o) => o.start)
    // 9:00 Prague is 07:00 UTC in summer time (until 25 October) and 08:00 UTC after
    expect(got).toEqual(['2026-10-23T07:00', '2026-10-24T07:00', '2026-10-25T08:00', '2026-10-26T08:00', '2026-10-27T08:00'])
  })

  it('expands an all-day recurring event without moving it', () => {
    const e: CalendarEvent = { id: 'w', title: 'W', start: '2026-11-16', end: '2026-11-17', recurrence: { every: 'week', start: '2026-11-16' } }
    expect(expandOccurrences([e], { start: '2026-11-16', end: '2026-12-07' }, 'Asia/Tokyo').map((o) => o.start)).toEqual(['2026-11-16', '2026-11-23', '2026-11-30'])
  })

  it('uses an instant start in the wall clock of the event zone', () => {
    const start = Date.UTC(2026, 10, 16, 8, 0)
    const e: CalendarEvent = { id: 'x', title: 'X', start, end: start + 1_800_000, timeZone: 'Europe/Prague', recurrence: { every: 'day', start: '2026-11-16T09:00', count: 2 } }
    expect(expandOccurrences([e], week, 'Europe/Prague').map((o) => o.start)).toEqual(['2026-11-16T09:00', '2026-11-17T09:00'])
  })
})

describe('colliding ids', () => {
  it('lists both and numbers the key of the second, so rows can still be keyed', () => {
    const a: CalendarEvent = { id: 'same', title: 'A', start: '2026-11-18T09:00', end: '2026-11-18T10:00' }
    const b: CalendarEvent = { id: 'same', title: 'B', start: '2026-11-18T09:00', end: '2026-11-18T10:00' }
    expect(expandOccurrences([a, b], week, 'UTC').map((o) => o.key)).toEqual(['same:2026-11-18T09:00', 'same:2026-11-18T09:00~2'])
  })
})
