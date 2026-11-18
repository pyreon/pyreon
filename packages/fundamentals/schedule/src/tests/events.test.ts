import { describe, expect, it } from 'vitest'
import { expandEvents } from '../core'
import { stats } from '../expand'
import type { CalendarEvent } from '../events'

const range = (a: string, b: string) => ({ start: a as never, end: b as never })
const standup: CalendarEvent = { id: 'standup', start: '2026-11-16T09:00', end: '2026-11-16T09:15', rule: { every: 'day', on: { weekdays: [1, 2, 3, 4, 5] }, start: '2026-11-16T09:00' } }

describe('expandEvents', () => {
  it('expands recurring and single events into a window, sorted, each with a stable key', () => {
    const out = expandEvents([standup, { id: 'lunch', start: '2026-11-18T12:00', end: '2026-11-18T13:00' }], range('2026-11-18T00:00', '2026-11-20T00:00'))

    expect(out.map((i) => `${i.key} ${i.start}-${i.end}`)).toEqual([
      `standup:${Date.UTC(2026, 10, 18, 9)} 2026-11-18T09:00-2026-11-18T09:15`,
      `lunch:${Date.UTC(2026, 10, 18, 12)} 2026-11-18T12:00-2026-11-18T13:00`,
      `standup:${Date.UTC(2026, 10, 19, 9)} 2026-11-19T09:00-2026-11-19T09:15`,
    ])
    expect(out[0]).toMatchObject({ id: 'standup', occurrence: Date.UTC(2026, 10, 18, 9) })
  })

  it('the key and occurrence of an instance do not depend on the window', () => {
    const a = expandEvents([standup], range('2026-11-18T00:00', '2026-11-20T00:00'))
    const b = expandEvents([standup], range('2026-11-19T00:00', '2026-12-20T00:00'))

    expect(b.find((i) => i.start === '2026-11-19T09:00')).toEqual(a.find((i) => i.start === '2026-11-19T09:00'))
  })

  it('an event without an id is keyed by its position', () => {
    const out = expandEvents([{ start: '2026-11-18T10:00', end: '2026-11-18T11:00' }], range('2026-11-18T00:00', '2026-11-19T00:00'))

    expect(out[0]!.key).toBe(`#0:${Date.UTC(2026, 10, 18, 10)}`)
    expect(out[0]).not.toHaveProperty('id')
  })

  it('an instance overlaps when it starts before the window ends and ends after the window starts', () => {
    const e: CalendarEvent = { id: 'e', start: '2026-11-17T22:00', end: '2026-11-18T02:00' }

    expect(expandEvents([e], range('2026-11-18T00:00', '2026-11-19T00:00'))).toHaveLength(1)
    expect(expandEvents([e], range('2026-11-18T02:00', '2026-11-19T00:00'))).toHaveLength(0)
    expect(expandEvents([e], range('2026-11-17T00:00', '2026-11-17T22:00'))).toHaveLength(0)
  })

  it('a long recurring event that began before the window still shows', () => {
    const e: CalendarEvent = { id: 'camp', start: '2026-11-16T08:00', end: '2026-11-18T20:00', rule: { every: 'week', start: '2026-11-16T08:00' } }
    const out = expandEvents([e], range('2026-11-24T00:00', '2026-11-25T00:00'))

    expect(out.map((i) => i.start)).toEqual(['2026-11-23T08:00'])
  })

  it('all-day events use dates, with the end the day after', () => {
    const holiday: CalendarEvent = { id: 'h', start: '2026-12-24', end: '2026-12-27' }
    const out = expandEvents([holiday], range('2026-12-25', '2026-12-26'))

    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ start: '2026-12-24', end: '2026-12-27' })
    expect(expandEvents([{ id: 'w', start: '2026-11-16', end: '2026-11-17', rule: { every: 'week', start: '2026-11-16' } }], range('2026-11-20', '2026-12-01')).map((i) => i.start)).toEqual(['2026-11-23', '2026-11-30'])
  })

  it('overrides cancel an instance, or move it (keeping its length unless an end is given)', () => {
    const occ = Date.UTC(2026, 10, 18, 9)
    const w = range('2026-11-18T00:00', '2026-11-21T00:00')

    expect(expandEvents([{ ...standup, overrides: [{ occurrence: occ, cancelled: true }] }], w).map((i) => i.start)).toEqual(['2026-11-19T09:00', '2026-11-20T09:00'])
    const moved = expandEvents([{ ...standup, overrides: [{ occurrence: occ, start: '2026-11-18T10:00' }] }], w)

    expect(moved.find((i) => i.occurrence === occ)).toMatchObject({ start: '2026-11-18T10:00', end: '2026-11-18T10:15' })
    const longer = expandEvents([{ ...standup, overrides: [{ occurrence: occ, start: '2026-11-18T10:00', end: '2026-11-18T11:00' }] }], w)

    expect(longer.find((i) => i.occurrence === occ)!.end).toBe('2026-11-18T11:00')
  })

  it('an instance moved into the window shows even when its original time is outside it, and a moved-out one does not', () => {
    const outside = Date.UTC(2026, 10, 25, 9)
    const into = expandEvents([{ ...standup, overrides: [{ occurrence: outside, start: '2026-11-19T15:00' }] }], range('2026-11-19T12:00', '2026-11-19T18:00'))

    expect(into.map((i) => i.start)).toEqual(['2026-11-19T15:00'])
    const away = expandEvents([{ ...standup, overrides: [{ occurrence: Date.UTC(2026, 10, 19, 9), start: '2026-11-30T09:00' }] }], range('2026-11-19T00:00', '2026-11-20T00:00'))

    expect(away).toEqual([])
  })

  it('a recurring event that started years ago costs the window, not the years', () => {
    const old: CalendarEvent = { id: 'old', start: '2006-01-02T09:00', end: '2006-01-02T10:00', rule: { every: 'day', start: '2006-01-02T09:00' } }

    stats.candidates = 0
    expandEvents([old], range('2026-11-18T00:00', '2026-11-25T00:00'))
    expect(stats.candidates).toBeLessThan(40)
  })

  it('refuses a rule that does not start at the event, mixed shapes, reversed events and ranges', () => {
    expect(() => expandEvents([{ id: 'x', start: '2026-11-16T09:00', end: '2026-11-16T10:00', rule: { every: 'day', start: '2026-11-17T09:00' } }], range('2026-11-18T00:00', '2026-11-19T00:00'))).toThrow(/rule.start .* differs from the event's start/)
    expect(() => expandEvents([{ start: '2026-11-16', end: '2026-11-16T10:00' } as never], range('2026-11-18T00:00', '2026-11-19T00:00'))).toThrow(/mixes a date and a date-time/)
    expect(() => expandEvents([{ start: '2026-11-16T11:00', end: '2026-11-16T10:00' }], range('2026-11-18T00:00', '2026-11-19T00:00'))).toThrow(/ends before it starts/)
    expect(() => expandEvents([], range('2026-11-19T00:00', '2026-11-18T00:00'))).toThrow(/the range ends before it starts/)
    expect(() => expandEvents(null as never, range('2026-11-18T00:00', '2026-11-19T00:00'))).toThrow(/array of events/)
  })
})
