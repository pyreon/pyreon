import { describe, expect, it } from 'vitest'
import { expandOccurrences } from '../expand'
import { layoutAgenda } from '../agenda'
import { layoutTimeline, resourcesOf } from '../timeline'
import { windowRows } from '../window'
import { movedResource, applyEventChange } from '../edit'
import type { CalendarEvent, PlainDate } from '../types'
import { int, rng } from './rng'

const ev = (id: string, start: string, end: string, extra?: Partial<CalendarEvent>): CalendarEvent => ({ id, title: id, start: start as never, end: end as never, ...extra })
const range = { start: '2026-11-01' as PlainDate, end: '2026-12-01' as PlainDate }
const occ = (events: CalendarEvent[]) => expandOccurrences(events, range, 'UTC')
const days = ['2026-11-16', '2026-11-17', '2026-11-18'] as PlainDate[]
const rooms = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]

describe('layoutTimeline', () => {
  it('puts an event in the row of each of its resources, as fractions of the axis', () => {
    const rows = layoutTimeline(occ([ev('x', '2026-11-17T09:00', '2026-11-17T12:00', { resourceId: ['a', 'b'] })]), rooms, days, { from: 480, to: 1080 })
    expect(rows.map((r) => r.blocks.length)).toEqual([1, 1])
    const block = rows[0]!.blocks[0]!
    // the second of three days, from 09:00 to 12:00 of a 08:00 to 18:00 day
    expect(block.left).toBeCloseTo((600 + 60) / 1800, 6)
    expect(block.width).toBeCloseTo(180 / 1800, 6)
    expect(rows[1]!.blocks[0]!.key).toBe(`${block.occurrenceKey}@b`)
  })

  it('stacks overlapping events in lanes and the row says how many; the order of the input does not matter', () => {
    const events = [ev('p', '2026-11-16T09:00', '2026-11-16T11:00', { resourceId: 'a' }), ev('q', '2026-11-16T10:00', '2026-11-16T12:00', { resourceId: 'a' }), ev('r', '2026-11-16T11:00', '2026-11-16T12:00', { resourceId: 'a' })]
    const rows = layoutTimeline(occ(events), rooms, days, { from: 0, to: 1440 })
    expect(rows[0]!.lanes).toBe(2)
    expect(rows[0]!.blocks.map((b) => [b.occurrenceKey.split(':')[0], b.lane]).sort()).toEqual([['p', 0], ['q', 1], ['r', 0]])
    const shuffled = layoutTimeline(occ([...events].reverse()), rooms, days, { from: 0, to: 1440 })
    expect(shuffled[0]!.blocks.map((b) => b.key).sort()).toEqual(rows[0]!.blocks.map((b) => b.key).sort())
    expect(Object.fromEntries(shuffled[0]!.blocks.map((b) => [b.key, b.lane]))).toEqual(Object.fromEntries(rows[0]!.blocks.map((b) => [b.key, b.lane])))
  })

  it('clips to the shown days and the visible hours, marks the cut, and drops what is outside', () => {
    const rows = layoutTimeline(occ([ev('long', '2026-11-10', '2026-11-30', { resourceId: 'a' }), ev('night', '2026-11-16T01:00', '2026-11-16T03:00', { resourceId: 'a' }), ev('away', '2026-11-25T10:00', '2026-11-25T11:00', { resourceId: 'a' })]), rooms, days, { from: 480, to: 1080 })
    const keys = rows[0]!.blocks.map((b) => b.occurrenceKey.split(':')[0])
    expect(keys).toEqual(['long'])
    expect(rows[0]!.blocks[0]).toMatchObject({ left: 0, width: 1, continuesBefore: true, continuesAfter: true })
  })

  it('events without a resource, or with one that is not a row, go to the row asked for, else are not drawn', () => {
    const events = occ([ev('loose', '2026-11-16T09:00', '2026-11-16T10:00'), ev('lost', '2026-11-16T09:00', '2026-11-16T10:00', { resourceId: 'zzz' })])
    expect(layoutTimeline(events, rooms, days, { from: 0, to: 1440 }).flatMap((r) => r.blocks)).toHaveLength(0)
    const rows = layoutTimeline(events, rooms, days, { from: 0, to: 1440, unassigned: { id: '?', title: 'Unassigned' } })
    expect(rows.at(-1)!.blocks).toHaveLength(2)
  })

  it('checks its arguments and names itself', () => {
    expect(() => layoutTimeline([], 'x' as never, days, { from: 0, to: 10 })).toThrow(/^\[Pyreon\] layoutTimeline: resources must be/)
    expect(() => layoutTimeline([], rooms, days, { from: 10, to: 10 })).toThrow(/^\[Pyreon\] layoutTimeline: options must be/)
  })

  it('fuzz: blocks in a lane never overlap, and every block is inside the axis', () => {
    const r = rng(11)
    for (let i = 0; i < 100; i++) {
      const events = Array.from({ length: int(r, 1, 30) }, (_, k) => {
        const d = int(r, 16, 18)
        const h = int(r, 0, 20)

        return ev(`e${k}`, `2026-11-${d}T${String(h).padStart(2, '0')}:00`, `2026-11-${d}T${String(h + int(r, 1, 3)).padStart(2, '0')}:00`, { resourceId: ['a', 'b'][int(r, 0, 1)]! })
      })
      for (const row of layoutTimeline(occ(events), rooms, days, { from: 0, to: 1440 })) {
        for (const b of row.blocks) {
          expect(b.left).toBeGreaterThanOrEqual(0)
          expect(b.left + b.width).toBeLessThanOrEqual(1 + 1e-9)
          for (const o of row.blocks) if (o !== b && o.lane === b.lane) expect(o.left >= b.left + b.width - 1e-9 || b.left >= o.left + o.width - 1e-9).toBe(true)
        }
      }
    }
  })
})

describe('layoutAgenda', () => {
  it('lists days with events, all-day first, a multi-day event on each day, nothing for empty days', () => {
    const out = layoutAgenda(occ([ev('t', '2026-11-17T10:00', '2026-11-17T11:00'), ev('h', '2026-11-17', '2026-11-19'), ev('z', '2026-11-20T00:00', '2026-11-20T01:00')]), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'] as PlainDate[])
    expect(out.map((d) => d.date)).toEqual(['2026-11-17', '2026-11-18', '2026-11-20'])
    expect(out[0]!.occurrences.map((o) => o.key.split(':')[0])).toEqual(['h', 't'])
  })

  it('all-day events come first even when a timed event starts at midnight and sorts earlier by name', () => {
    const out = layoutAgenda(occ([ev('Alpha', '2026-11-17T00:00', '2026-11-17T01:00'), ev('Zulu', '2026-11-17', '2026-11-18')]), ['2026-11-17'] as PlainDate[])
    expect(out[0]!.occurrences.map((o) => o.key.split(':')[0])).toEqual(['Zulu', 'Alpha'])
  })

  it('names itself on a wrong argument', () => {
    expect(() => layoutAgenda('x' as never, [])).toThrow(/layoutAgenda/)
  })
})

describe('windowRows', () => {
  it('finds the rows in view with an overscan, and the offset above them', () => {
    const heights = Array.from({ length: 100 }, () => 40)
    expect(windowRows(heights, 0, 100, 0)).toEqual({ start: 0, end: 3, offset: 0, total: 4000 })
    expect(windowRows(heights, 405, 100, 2)).toMatchObject({ start: 8, end: 15, offset: 320 })
    expect(windowRows(heights, 99999, 100, 1)).toMatchObject({ end: 100 })
    expect(windowRows([], 0, 100)).toEqual({ start: 0, end: 0, offset: 0, total: 0 })
  })

  it('rows of different heights, and a viewport that ends inside a row', () => {
    expect(windowRows([10, 100, 10, 10], 50, 20, 0)).toEqual({ start: 1, end: 2, offset: 10, total: 130 })
  })
})

describe('resources of an event', () => {
  it('resourcesOf and movedResource', () => {
    expect(resourcesOf(occ([ev('a', '2026-11-16', '2026-11-17', { resourceId: 'x' })])[0]!)).toEqual(['x'])
    expect(resourcesOf(occ([ev('a', '2026-11-16', '2026-11-17')])[0]!)).toEqual([])
    expect(movedResource('a', 'a', 'b')).toBe('b')
    expect(movedResource(['a', 'b'], 'a', 'c')).toEqual(['c', 'b'])
    expect(movedResource(['a', 'b'], 'a', 'b')).toEqual(['b'])
    expect(movedResource(undefined, undefined, 'x')).toBe('x')
  })

  it('applyEventChange moves the resource of the series, or of one occurrence (kept in its override, and expandOccurrences shows it)', () => {
    const e = ev('w', '2026-11-16T09:00', '2026-11-16T10:00', { resourceId: 'a', recurrence: { every: 'week', start: '2026-11-16T09:00', count: 3 } as never })
    const change = { event: e, occurrence: '2026-11-23T09:00', start: '2026-11-23T09:00' as never, end: '2026-11-23T10:00' as never, allDay: false, resourceId: 'b', fromResourceId: 'a' }
    expect(applyEventChange(e, { ...change, scope: 'all' }, 'UTC')[0]!.resourceId).toBe('b')
    const following = applyEventChange(e, { ...change, scope: 'following' }, 'UTC')
    expect(following.map((x) => x.resourceId)).toEqual(['a', 'b'])
    const one = applyEventChange(e, { ...change, scope: 'this', start: '2026-11-24T09:00' as never, end: '2026-11-24T10:00' as never }, 'UTC')
    expect(one).toHaveLength(1)
    expect(one[0]!.overrides).toEqual({ '2026-11-23T09:00': { start: '2026-11-24T09:00', end: '2026-11-24T10:00', resourceId: 'b' } })
    expect(one[0]!.resourceId).toBe('a')
    const shown = occ(one).map((o) => [o.start, resourcesOf(o)])
    expect(shown).toEqual([['2026-11-16T09:00', ['a']], ['2026-11-24T09:00', ['b']], ['2026-11-30T09:00', ['a']]])
    expect(JSON.parse(JSON.stringify(one))).toEqual(one)
    const single = ev('s', '2026-11-16T09:00', '2026-11-16T10:00', { resourceId: 'a' })
    expect(applyEventChange(single, { event: single, start: single.start, end: single.end, allDay: false, resourceId: 'b', fromResourceId: 'a' }, 'UTC')[0]!.resourceId).toBe('b')
  })
})
