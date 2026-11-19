import { describe, expect, it } from 'vitest'
import { applyEventChange, fitsWindows, reposition, snapTo } from '../edit'
import { expandOccurrences } from '../expand'
import type { CalendarEvent, PlainDate } from '../types'

const range = { start: '2026-11-01' as PlainDate, end: '2026-12-31' as PlainDate }
const weekly: CalendarEvent = {
  id: 'standup',
  title: 'Standup',
  start: '2026-11-02T09:00' as never,
  end: '2026-11-02T09:30' as never,
  recurrence: { start: '2026-11-02T09:00' as never, every: 'week', count: 6 } as never,
}
const starts = (events: CalendarEvent[]) => expandOccurrences(events, range, 'UTC').map((o) => o.start).sort()

describe('snapTo', () => {
  it('rounds to the step and ignores a zero step', () => {
    expect(snapTo(37, 15)).toBe(30)
    expect(snapTo(38, 15)).toBe(45)
    expect(snapTo(7, 0)).toBe(7)
  })
})

describe('applyEventChange', () => {
  it('moves a single event', () => {
    const e: CalendarEvent = { id: 'a', title: 'A', start: '2026-11-18T10:00' as never, end: '2026-11-18T11:00' as never }
    const [n] = applyEventChange(e, { event: e, start: '2026-11-19T14:00' as never, end: '2026-11-19T15:00' as never, allDay: false })
    expect(n).toMatchObject({ start: '2026-11-19T14:00', end: '2026-11-19T15:00' })
  })

  it('this: one override, the others stay', () => {
    const before = starts([weekly])
    const [n] = applyEventChange(weekly, { event: weekly, occurrence: '2026-11-09T09:00', start: '2026-11-10T10:00' as never, end: '2026-11-10T10:30' as never, allDay: false, scope: 'this' })
    const after = starts([n as CalendarEvent])
    expect(after).toHaveLength(before.length)
    expect(after).toContain('2026-11-10T10:00')
    expect(after).not.toContain('2026-11-09T09:00')
    expect(after).toContain('2026-11-16T09:00')
  })

  it('all: shifts the whole series, overrides included', () => {
    const e = { ...weekly, overrides: { '2026-11-16T09:00': { cancelled: true as const } } }
    const [n] = applyEventChange(e, { event: e, occurrence: '2026-11-09T09:00', start: '2026-11-09T11:00' as never, end: '2026-11-09T11:30' as never, allDay: false, scope: 'all' })
    const after = starts([n as CalendarEvent])
    expect(after[0]).toBe('2026-11-02T11:00')
    expect(after).not.toContain('2026-11-16T11:00')
    expect(after).toHaveLength(5)
  })

  it('following: ends the series the day before and carries on from the new start', () => {
    const out = applyEventChange(weekly, { event: weekly, occurrence: '2026-11-16T09:00', start: '2026-11-17T09:00' as never, end: '2026-11-17T09:30' as never, allDay: false, scope: 'following' })
    expect(out).toHaveLength(2)
    const after = starts(out)
    expect(after).toEqual(['2026-11-02T09:00', '2026-11-09T09:00', '2026-11-17T09:00', '2026-11-24T09:00', '2026-12-01T09:00', '2026-12-08T09:00'])
    expect(JSON.parse(JSON.stringify(out))).toEqual(out)
  })

  it('following on the first occurrence is the same as all', () => {
    const args = { event: weekly, occurrence: '2026-11-02T09:00', start: '2026-11-03T09:00' as never, end: '2026-11-03T09:30' as never, allDay: false }
    expect(applyEventChange(weekly, { ...args, scope: 'following' })).toEqual(applyEventChange(weekly, { ...args, scope: 'all' }))
  })
})

describe('reposition and fitsWindows', () => {
  it('keeps an instant event an instant', () => {
    const e: CalendarEvent = { id: 'i', title: 'I', start: Date.UTC(2026, 10, 18, 10), end: Date.UTC(2026, 10, 18, 11) }
    const [o] = expandOccurrences([e], range, 'UTC')
    const r = reposition(o as never, { start: '2026-11-19T10:00' as never, end: '2026-11-19T11:00' as never, allDay: false }, 'UTC')
    expect(r.start).toBe(Date.UTC(2026, 10, 19, 10))
  })

  it('checks working windows across midnight', () => {
    const windows = () => [{ from: 540, to: 1020 }]
    expect(fitsWindows('2026-11-18T09:00' as never, '2026-11-18T17:00' as never, windows)).toBe(true)
    expect(fitsWindows('2026-11-18T08:00' as never, '2026-11-18T10:00' as never, windows)).toBe(false)
    expect(fitsWindows('2026-11-18T16:00' as never, '2026-11-19T01:00' as never, windows)).toBe(false)
  })
})
