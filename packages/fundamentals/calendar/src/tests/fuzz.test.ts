import { add } from '@pyreon/time/core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { allDay, dayBounds, expandOccurrences, layoutDay, layoutMonth, layoutTimeGrid, navigate, nowOffset, visibleRange } from '../core'
import type { CalendarEvent, EventOccurrence, TimedBlock, ViewName } from '../core'
import { int, pick, rng } from './rng'

const ZONES = ['UTC', 'Europe/Prague', 'America/New_York', 'Asia/Kolkata', 'Pacific/Apia', 'Australia/Lord_Howe']
const VIEWS: ViewName[] = ['month', 'week', 'workWeek', 'day', 'days', 'agenda', 'year']
const two = (n: number): string => String(n).padStart(2, '0')

function randomEvent(r: () => number, i: number): CalendarEvent {
  const day = add('2026-03-20', { days: int(r, 0, 40) })
  if (r() < 0.3) return { id: `e${i}`, title: `e${i}`, start: day, end: add(day, { days: int(r, 0, 8) }) }
  const start = `${day}T${two(int(r, 0, 23))}:${pick(r, ['00', '15', '30', '45'])}` as never as string
  const end = `${add(day, { days: int(r, 0, 2) })}T${two(int(r, 0, 23))}:${pick(r, ['00', '15', '30', '45'])}` as never as string
  const [a, b] = start <= end ? [start, end] : [end, start]
  const event: CalendarEvent = { id: r() < 0.1 ? 'dup' : `e${i}`, title: 'x', start: a as never, end: b as never }
  if (r() < 0.4) event.timeZone = pick(r, ZONES)
  if (r() < 0.2) event.recurrence = { every: pick(r, ['day', 'week'] as const), start: a as never, count: int(r, 1, 6) }

  return event
}

describe('fuzz: random events through every export', () => {
  it('never throws for valid events and keeps the invariants (300 windows)', () => {
    const r = rng(99)
    for (let n = 0; n < 300; n++) {
      const zone = pick(r, ZONES)
      const view = pick(r, VIEWS)
      const shown = visibleRange(view, add('2026-03-25', { days: int(r, 0, 30) }), { weekStart: int(r, 1, 7) as never, hiddenDays: r() < 0.3 ? [pick(r, [6, 7] as const)] : [] })
      const events = Array.from({ length: int(r, 0, 25) }, (_, i) => randomEvent(r, i))
      let list: EventOccurrence[] = []
      try {
        list = expandOccurrences(events, shown.range, zone)
      } catch (error) {
        throw new Error(`${String(error)} :: ${JSON.stringify({ zone, view, range: shown.range, events })}`)
      }
      expect(new Set(list.map((o) => o.key)).size).toBe(list.length)
      for (const o of list) expect(o.endMs).toBeGreaterThanOrEqual(o.startMs)
      layoutMonth(list, shown.rows, int(r, 1, 4))
      const grid = layoutTimeGrid(list, shown.dates, zone, { dayStart: pick(r, ['00:00', '07:00']), dayEnd: pick(r, ['24:00', '20:00']) })
      for (const day of grid.days) {
        for (const b of day.blocks as readonly TimedBlock[]) {
          expect(b.top).toBeGreaterThanOrEqual(0)
          expect(b.top + b.height).toBeLessThanOrEqual(1 + 1e-9)
          expect(b.left + b.width).toBeLessThanOrEqual(1 + 1e-9)
        }
        expect(Number.isFinite(dayBounds(day.date, zone).elapsedMinutes)).toBe(true)
      }
      expect(nowOffset(shown.dates[0] ?? shown.range.start, Date.UTC(2026, 3, 1), zone)).toSatisfy((v: number | null) => v === null || (v >= 0 && v < 1))
      expect(navigate(view, shown.date, 1)).toBeTypeOf('string')
    }
  })

  it('every timed occurrence is placed exactly once on each day it touches', () => {
    const r = rng(7)
    for (let n = 0; n < 200; n++) {
      const zone = pick(r, ZONES)
      const events = Array.from({ length: int(r, 1, 15) }, (_, i) => randomEvent(r, i)).filter((e) => e.start.toString().length > 10 || typeof e.start === 'number')
      const dates = visibleRange('days', '2026-03-24', { days: 14 }).dates
      const list = expandOccurrences(events, { start: dates[0]!, end: add(dates.at(-1)!, { days: 1 }) }, zone)
      const grid = layoutTimeGrid(list, dates, zone)
      for (const o of list.filter((x) => !x.allDay)) {
        const days = grid.days.filter((d) => {
          const b = dayBounds(d.date, zone)

          return o.startMs < b.endMs && (o.endMs > b.startMs || (o.endMs === o.startMs && o.startMs >= b.startMs))
        })
        for (const d of days) expect(d.blocks.filter((b) => b.occurrenceKey === o.key)).toHaveLength(1)
      }
    }
  })

  it('lays out 500 events in a week within a generous bound', () => {
    const r = rng(3)
    const events = Array.from({ length: 500 }, (_, i): CalendarEvent => {
      const day = add('2026-11-16', { days: int(r, 0, 6) })
      const h = int(r, 7, 18)

      return { id: `e${i}`, title: 'x', start: `${day}T${two(h)}:00` as never, end: `${day}T${two(h + int(r, 1, 3))}:30` as never }
    })
    const week = visibleRange('week', '2026-11-18')
    const t0 = performance.now()
    const grid = layoutTimeGrid(expandOccurrences(events, week.range, 'Europe/Prague'), week.dates, 'Europe/Prague')
    const ms = performance.now() - t0
    expect(grid.days.reduce((n, d) => n + d.blocks.length, 0)).toBe(500)
    expect(ms).toBeLessThan(1500)
    console.info(`[measured] expand and lay out 500 events in a week: ${ms.toFixed(1)} ms`)
  })
})

describe('edge cases', () => {
  const one = (e: CalendarEvent, zone = 'UTC'): EventOccurrence[] => expandOccurrences([e], { start: '2026-11-16', end: '2026-11-23' }, zone)

  it('identical events are two occurrences with their own keys, placed side by side', () => {
    const e = (id: string): CalendarEvent => ({ id, title: id, start: '2026-11-18T10:00', end: '2026-11-18T11:00' })
    const list = expandOccurrences([e('a'), e('b')], { start: '2026-11-16', end: '2026-11-23' }, 'UTC')
    expect(layoutDay('2026-11-18', list, 'UTC').map((b) => [b.column, b.columns])).toEqual([[0, 2], [1, 2]])
  })

  it('a zone that skips the displayed day has an empty day, and an event on the skipped date shows on the next', () => {
    // Pacific/Apia skipped 2011-12-30 entirely
    const day = dayBounds('2011-12-30', 'Pacific/Apia')
    expect(day.elapsedMinutes).toBeLessThanOrEqual(0)
    const [o] = expandOccurrences([{ id: 'x', title: 'x', start: '2011-12-30T10:00', end: '2011-12-30T11:00', timeZone: 'UTC' }], { start: '2011-12-29', end: '2012-01-02' }, 'Pacific/Apia')
    expect(o!.start.slice(0, 10)).toBe('2011-12-31')
    expect(layoutDay('2011-12-30', [o!], 'Pacific/Apia')).toEqual([])
  })

  it('a long event across a DST change keeps its dates; a leap-year range holds February 29', () => {
    expect(one({ id: 'l', title: 'l', start: '2026-11-16', end: '2026-11-22' }, 'America/New_York')).toHaveLength(1)
    expect(visibleRange('month', '2028-02-10').dates).toContain('2028-02-29')
  })

  it('types: the public shapes are what the docs say', () => {
    expectTypeOf(allDay('2026-11-18')).toMatchTypeOf<{ start: string; end: string; allDay: true }>()
    expectTypeOf(expandOccurrences).returns.toMatchTypeOf<EventOccurrence[]>()
    expectTypeOf(visibleRange('week', '2026-11-18').rows).toMatchTypeOf<readonly (readonly string[])[]>()
  })
})
