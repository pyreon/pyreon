import { describe, expect, it } from 'vitest'
import { daySpan, expandOccurrences, layoutDay, packColumns, slotTimes, viewTitle, visibleRange } from '../core'
import type { CalendarEvent, EventOccurrence } from '../core'

const week = { start: '2026-11-16', end: '2026-11-23' } as const

describe('edges of the core', () => {
  it('an override may move only the start or only the end of an occurrence', () => {
    const e: CalendarEvent = {
      id: 's',
      title: 'S',
      start: '2026-11-16T09:00',
      end: '2026-11-16T10:00',
      recurrence: { every: 'day', start: '2026-11-16T09:00', count: 3 },
      overrides: { '2026-11-17T09:00': { start: '2026-11-17T08:00' }, '2026-11-18T09:00': { end: '2026-11-18T11:30' } },
    }
    const got = expandOccurrences([e], week, 'UTC').map((o) => [o.key, o.start, o.end])
    expect(got).toEqual([
      ['s:2026-11-16T09:00', '2026-11-16T09:00', '2026-11-16T10:00'],
      ['s:2026-11-17T09:00', '2026-11-17T08:00', '2026-11-17T09:00'],
      ['s:2026-11-18T09:00', '2026-11-18T09:00', '2026-11-18T11:30'],
    ])
  })

  it('an all-day override moves the dates of one occurrence', () => {
    const e: CalendarEvent = { id: 'w', title: 'W', start: '2026-11-16', end: '2026-11-17', recurrence: { every: 'day', start: '2026-11-16', count: 2 }, overrides: { '2026-11-17': { start: '2026-11-19', end: '2026-11-21' } } }
    expect(expandOccurrences([e], week, 'UTC').map((o) => [o.start, o.end, o.allDay])).toEqual([
      ['2026-11-16', '2026-11-17', true],
      ['2026-11-19', '2026-11-21', true],
    ])
  })

  it('a zero-length all-day occurrence takes its one day', () => {
    const o = { key: 'z', startMs: 0, endMs: 0, start: '2026-11-18', end: '2026-11-18', allDay: true } as unknown as EventOccurrence
    expect(daySpan(o)).toEqual({ first: '2026-11-18', last: '2026-11-18' })
  })

  it('daySpan checks its one occurrence: nothing, an event and the whole list are named as such, not as a crash inside', () => {
    expect(() => daySpan(undefined as never)).toThrow('[Pyreon] daySpan: occurrence must be one occurrence from expandOccurrences(), got undefined.')
    const event: CalendarEvent = { id: 'e', title: 'e', start: '2026-11-18', end: '2026-11-19' }
    expect(() => daySpan(event as never)).toThrow(/^\[Pyreon\] daySpan: occurrence must be one occurrence from expandOccurrences\(\), got an object with the keys id, title, start, end\. An event is not an occurrence/)
    const list = expandOccurrences([event], week, 'UTC')
    expect(() => daySpan(list as never)).toThrow('got an array of 1')
    expect(() => daySpan(list as never)).toThrow('That is a list: pass one of its items.')
    expect(daySpan(list[0]!)).toEqual({ first: '2026-11-18', last: '2026-11-18' })
  })

  it('slotTimes: a slot of whole hours, or of minutes only', () => {
    expect(slotTimes({ slot: { hours: 2 } }).slice(0, 3)).toEqual(['00:00', '02:00', '04:00'])
    expect(slotTimes({ slot: { hours: 2 } })).toHaveLength(12)
    expect(slotTimes({ slot: { minutes: 15 }, dayStart: '09:00', dayEnd: '10:00' })).toEqual(['09:00', '09:15', '09:30', '09:45'])
  })

  it('layoutDay: a zero-length event exactly at dayStart is kept, one that ends at dayStart is not', () => {
    const [kept, gone] = expandOccurrences(
      [
        { id: 'at', title: 'at', start: '2026-11-18T08:00', end: '2026-11-18T08:00' },
        { id: 'before', title: 'before', start: '2026-11-18T07:00', end: '2026-11-18T08:00' },
      ],
      week,
      'UTC',
    )
    const blocks = layoutDay('2026-11-18', [kept!, gone!], 'UTC', { dayStart: '08:00' })
    expect(blocks.map((b) => [b.occurrenceKey, b.startMinute, b.endMinute])).toEqual([['at:2026-11-18T08:00', 480, 480]])
  })

  it('layoutDay: pinned keeps a block in its column; the order on screen is top, then column', () => {
    const list = expandOccurrences(
      [
        { id: 'a', title: 'a', start: '2026-11-18T09:00', end: '2026-11-18T10:00' },
        { id: 'b', title: 'b', start: '2026-11-18T09:00', end: '2026-11-18T10:00' },
      ],
      week,
      'UTC',
    )
    const free = layoutDay('2026-11-18', list, 'UTC').map((b) => [b.occurrenceKey.split(':')[0], b.column])
    expect(free).toEqual([
      ['a', 0],
      ['b', 1],
    ])
    const pinned = layoutDay('2026-11-18', list, 'UTC', { pinned: new Map([['b:2026-11-18T09:00', 0]]) }).map((b) => [b.occurrenceKey.split(':')[0], b.column])
    expect(pinned).toEqual([
      ['b', 0],
      ['a', 1],
    ])
  })

  it('packColumns: two items with the same times and the same key do not depend on their order', () => {
    const one = packColumns([
      { key: 'x', start: 0, end: 10 },
      { key: 'x', start: 0, end: 10 },
    ])
    expect(one.map((p) => p.column).sort()).toEqual([0, 1])
  })

  it('viewTitle of a day view on a hidden weekday (no dates) names the start of the window', () => {
    const shown = visibleRange('day', '2026-11-21', { hiddenDays: [6, 7] })
    expect(shown.dates).toEqual([])
    expect(viewTitle(shown)).toBe('2026-11-21')
    expect(viewTitle(shown, (info) => `${info.first}|${info.last}`)).toBe('2026-11-21|2026-11-21')
  })

  it('a long wrong argument is cut in the error message', () => {
    expect(() => visibleRange('month', 'x'.repeat(60) as never)).toThrow(`"${'x'.repeat(40)}…"`)
  })
})
