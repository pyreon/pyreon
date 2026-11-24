import { describe, expect, it } from 'vitest'
import { applyEventChange, fitsWindows, moveTarget, nudgeTarget, reposition, resizeTarget, snapTo } from '../edit'
import { int, pick, rng } from './rng'
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

describe('moveTarget, resizeTarget and nudgeTarget', () => {
  const o = expandOccurrences([{ id: 'a', title: 'A', start: '2026-11-18T14:00' as never, end: '2026-11-18T15:00' as never }], range, 'UTC')[0] as never
  const day = expandOccurrences([{ id: 'd', title: 'D', start: '2026-11-18' as never, end: '2026-11-20' as never }], range, 'UTC')[0] as never

  it('moves by the pointer distance, snaps, and keeps the duration', () => {
    expect(moveTarget(o, { date: '2026-11-19' as never, minute: 16 * 60 + 5 }, { date: '2026-11-18' as never, minute: 14 * 60 + 30 }, 30)).toMatchObject({ start: '2026-11-19T15:30', end: '2026-11-19T16:30', allDay: false })
    expect(moveTarget(o, { date: '2026-11-18' as never, minute: 14 * 60 + 40 }, { date: '2026-11-18' as never, minute: 14 * 60 + 30 }, 15)).toMatchObject({ start: '2026-11-18T14:15', end: '2026-11-18T15:15' })
  })

  it('crosses midnight', () => {
    expect(moveTarget(o, { date: '2026-11-19' as never, minute: 30 }, { date: '2026-11-18' as never, minute: 14 * 60 + 30 }, 15)).toMatchObject({ start: '2026-11-19T00:00', end: '2026-11-19T01:00' })
  })

  it('over a day cell only the day changes; onto the all-day row an event becomes all-day; an all-day event dropped on a slot gets an hour', () => {
    expect(moveTarget(o, { date: '2026-11-25' as never, minute: null }, { date: '2026-11-18' as never, minute: null }, 30)).toMatchObject({ start: '2026-11-25T14:00', end: '2026-11-25T15:00' })
    expect(moveTarget(o, { date: '2026-11-20' as never, minute: null }, { date: '2026-11-18' as never, minute: 14 * 60 }, 30)).toMatchObject({ start: '2026-11-20', end: '2026-11-21', allDay: true })
    expect(moveTarget(day, { date: '2026-11-22' as never, minute: 9 * 60 + 10 }, { date: '2026-11-18' as never, minute: null }, 30)).toMatchObject({ start: '2026-11-22T09:00', end: '2026-11-22T10:00', allDay: false })
    expect(moveTarget(day, { date: '2026-11-22' as never, minute: null }, { date: '2026-11-19' as never, minute: null }, 30)).toMatchObject({ start: '2026-11-21', end: '2026-11-23' })
  })

  it('resize snaps, never goes below the minimum, and never makes a negative or zero event', () => {
    expect(resizeTarget(o, 'end', { date: '2026-11-18' as never, minute: 16 * 60 + 10 }, 30, 30)).toMatchObject({ end: '2026-11-18T16:00' })
    expect(resizeTarget(o, 'end', { date: '2026-11-18' as never, minute: 9 * 60 }, 30, 30)).toMatchObject({ start: '2026-11-18T14:00', end: '2026-11-18T14:30' })
    expect(resizeTarget(o, 'start', { date: '2026-11-18' as never, minute: 18 * 60 }, 30, 30)).toMatchObject({ start: '2026-11-18T14:30', end: '2026-11-18T15:00' })
    expect(resizeTarget(day, 'end', { date: '2026-11-16' as never, minute: null }, 30, 30)).toMatchObject({ start: '2026-11-18', end: '2026-11-19' })
    expect(resizeTarget(day, 'start', { date: '2026-11-25' as never, minute: null }, 30, 30)).toMatchObject({ start: '2026-11-19', end: '2026-11-20' })
  })

  it('the keyboard: arrows by the step and the day (swapped in right-to-left), Shift resizes the end, other keys do nothing', () => {
    expect(nudgeTarget(o, 'ArrowDown', { shift: false, grid: 'time', snap: 30, minDuration: 30, rtl: false })).toMatchObject({ start: '2026-11-18T14:30' })
    expect(nudgeTarget(o, 'ArrowRight', { shift: false, grid: 'time', snap: 30, minDuration: 30, rtl: false })).toMatchObject({ start: '2026-11-19T14:00' })
    expect(nudgeTarget(o, 'ArrowRight', { shift: false, grid: 'time', snap: 30, minDuration: 30, rtl: true })).toMatchObject({ start: '2026-11-17T14:00' })
    expect(nudgeTarget(o, 'ArrowUp', { shift: true, grid: 'time', snap: 30, minDuration: 30, rtl: false })).toMatchObject({ start: '2026-11-18T14:00', end: '2026-11-18T14:30' })
    expect(nudgeTarget(o, 'ArrowUp', { shift: true, grid: 'time', snap: 30, minDuration: 60, rtl: false })).toMatchObject({ end: '2026-11-18T15:00' })
    expect(nudgeTarget(day, 'ArrowDown', { shift: false, grid: 'month', snap: 30, minDuration: 30, rtl: false })).toMatchObject({ start: '2026-11-25', end: '2026-11-27' })
    expect(nudgeTarget(day, 'ArrowLeft', { shift: true, grid: 'month', snap: 30, minDuration: 30, rtl: false })).toMatchObject({ start: '2026-11-18', end: '2026-11-19' })
    expect(nudgeTarget(o, 'a', { shift: false, grid: 'time', snap: 30, minDuration: 30, rtl: false })).toBeNull()
  })
})

describe('applyEventChange round-trips, fuzzed', () => {
  it('this changes one occurrence; following leaves the earlier ones and shifts the later; all shifts every one', () => {
    const r = rng(7)
    for (let i = 0; i < 200; i++) {
      const every = pick(r, ['day', 'week'] as const)
      const count = int(r, 2, 8)
      const startDay = int(r, 1, 9)
      const hour = int(r, 6, 18)
      const startStr = `2026-11-${String(startDay).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`
      const endStr = `2026-11-${String(startDay).padStart(2, '0')}T${String(hour + 1).padStart(2, '0')}:00`
      const e: CalendarEvent = { id: 'x', title: 'X', start: startStr as never, end: endStr as never, recurrence: { every, start: startStr, count } as never }
      const before = expandOccurrences([e], range, 'UTC')
      const index = int(r, 0, before.length - 1)
      const o = before[index]!
      const shiftMinutes = pick(r, [-90, -30, 30, 60, 1440, 2880])
      const to = new Date(Date.parse(`${o.start}:00Z`) + shiftMinutes * 60_000).toISOString().slice(0, 16)
      const toEnd = new Date(Date.parse(`${o.end}:00Z`) + shiftMinutes * 60_000).toISOString().slice(0, 16)
      for (const scope of ['this', 'following', 'all'] as const) {
        const out = applyEventChange(e, { event: e, occurrence: o.occurrence, start: to as never, end: toEnd as never, allDay: false, scope }, 'UTC')
        const after = expandOccurrences(out, { start: '2026-10-01' as never, end: '2027-03-01' as never }, 'UTC')
        const note = `${every} count ${count} pick ${index} shift ${shiftMinutes} ${scope}`
        const was = expandOccurrences([e], { start: '2026-10-01' as never, end: '2027-03-01' as never }, 'UTC')
        expect(after, note).toHaveLength(was.length)
        const moved = (a: string, b: string): number => (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 60_000
        const byOccurrence = (list: typeof after): string[] => list.map((x) => x.start).sort()
        if (scope === 'this') {
          const expected = byOccurrence(was).map((x) => (x === o.occurrence ? to : x)).sort()
          expect(byOccurrence(after), note).toEqual(expected)
        } else {
          for (let k = 0; k < was.length; k++) {
            const w = was[k]!
            const a = byOccurrence(after)[k]!
            const original = byOccurrence(was)[k]!
            const isLater = scope === 'all' || original >= o.occurrence
            expect(moved(original, a), `${note} #${k} of ${w.key}`).toBe(isLater ? shiftMinutes : 0)
          }
        }
      }
    }
  })
})
