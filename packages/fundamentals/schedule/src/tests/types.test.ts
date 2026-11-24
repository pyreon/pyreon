import type { Duration, PlainDate, PlainDateTime } from '@pyreon/time/core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { expandEvents, freeSlots, mergeIntervals, nextOccurrence, occurrences, occurrencesBetween, toInstants } from '../core'
import * as fp from '../fp'
import type { BusinessCalendar, CalendarEvent, EventInstance, Interval, PlainValue, Recurrence, WorkingHours } from '../core'

describe('types', () => {
  it('Recurrence accepts the shapes people write, and rejects mistakes', () => {
    const weekly: Recurrence = { every: 'week', interval: 2, on: { weekdays: [2, { weekday: 5, nth: -1 }] }, start: '2026-11-17' }
    const timed: Recurrence = { every: 'day', start: '2026-11-17T09:00', until: '2026-12-31', except: ['2026-12-25', '2026-12-26T09:00'], timeZone: 'Europe/Prague' }

    expectTypeOf(weekly).toMatchTypeOf<Recurrence>()
    expectTypeOf(timed.start).toEqualTypeOf<PlainValue>()
    // @ts-expect-error not a frequency
    const bad1: Recurrence = { every: 'decade', start: '2026-11-17' }
    // @ts-expect-error weekday 8 does not exist
    const bad2: Recurrence = { every: 'week', start: '2026-11-17', on: { weekdays: [8] } }
    // @ts-expect-error start is required
    const bad3: Recurrence = { every: 'week' }
    // @ts-expect-error a Date is not a plain value
    const bad4: Recurrence = { every: 'week', start: new Date() }
    // @ts-expect-error count is a number
    const bad5: Recurrence = { every: 'week', start: '2026-11-17', count: '3' }

    expect([bad1, bad2, bad3, bad4, bad5]).toHaveLength(5)
  })

  it('a rule is plain data: it survives JSON and structuredClone and is still a Recurrence', () => {
    const rule: Recurrence = { every: 'month', on: { monthDays: [-1] }, start: '2026-11-30T17:00', timeZone: 'Europe/Prague' }
    const copy = JSON.parse(JSON.stringify(rule)) as Recurrence

    expect(copy).toEqual(rule)
    expect(structuredClone(rule)).toEqual(rule)
    expect(occurrencesBetween(copy, '2026-11-01', '2027-02-28')).toEqual(occurrencesBetween(rule, '2026-11-01', '2027-02-28'))
  })

  it('the functions return the shapes the docs promise', () => {
    const rule: Recurrence = { every: 'day', start: '2026-11-17T09:00', timeZone: 'UTC' }

    expectTypeOf(occurrences(rule)).toEqualTypeOf<Generator<PlainValue, void, undefined>>()
    expectTypeOf(occurrencesBetween(rule, '2026-11-17', '2026-11-18')).toEqualTypeOf<PlainValue[]>()
    expectTypeOf(nextOccurrence(rule, '2026-11-17')).toEqualTypeOf<PlainValue | null>()
    expectTypeOf(toInstants(rule)).toEqualTypeOf<Generator<number, void, undefined>>()
  })

  it('intervals keep the type of their ends', () => {
    const dt: Interval = { start: '2026-11-18T09:00', end: '2026-11-18T10:00' }
    const ms: Interval<number> = { start: 1, end: 2 }

    expectTypeOf(mergeIntervals([dt])).toEqualTypeOf<Interval<`${number}-${number}-${number}T${number}:${number}` | `${number}-${number}-${number}T${number}:${number}:${number}` | `${number}-${number}-${number}T${number}:${number}:${number}.${number}`>[]>()
    expectTypeOf(mergeIntervals([ms])).toEqualTypeOf<Interval<number>[]>()
    expectTypeOf(freeSlots({ within: dt, busy: [], duration: { minutes: 30 } })).toEqualTypeOf<Interval<PlainDateTime>[]>()
  })

  it('a calendar package can build on the event types structurally', () => {
    const event: CalendarEvent<PlainDateTime> = { id: 'a', start: '2026-11-18T09:00', end: '2026-11-18T10:00', rule: { every: 'day', start: '2026-11-18T09:00' } }
    const out = expandEvents([event], { start: '2026-11-18T00:00', end: '2026-11-19T00:00' })

    expectTypeOf(out).toEqualTypeOf<EventInstance<PlainDateTime>[]>()
    // The instance is assignable to the plain shape a view component takes.
    const row: { key: string; start: PlainDateTime; end: PlainDateTime } = out[0]!

    expect(row.key).toBeTypeOf('string')
  })

  it('a calendar holds holidays as a list or a predicate, and hours by ISO weekday', () => {
    const hours: WorkingHours = { 1: [{ from: '09:00', to: '17:00' }], 7: [] }
    const a: BusinessCalendar = { holidays: ['2026-12-25'], hours }
    const b: BusinessCalendar = { holidays: (d: PlainDate) => d === '2026-12-25' }
    // @ts-expect-error weekday 0 is not a key
    const bad: WorkingHours = { 0: [] }

    expect([a, b, bad]).toHaveLength(3)
  })

  it('durations are the @pyreon/time Duration', () => {
    const d: Duration = { hours: 8 }

    expectTypeOf(freeSlots).parameter(0).toHaveProperty('duration')
    expect(d.hours).toBe(8)
  })

  it('the value-last forms compose in a local pipe', () => {
    const pipe = <A, B, C>(f: (a: A) => B, g: (b: B) => C) => (a: A): C => g(f(a))
    const days = pipe(fp.occurrencesBetween('2026-11-02', '2026-11-30'), (list: PlainValue[]) => list.length)

    expectTypeOf(days).toEqualTypeOf<(rule: Recurrence) => number>()
    expect(days({ every: 'week', start: '2026-11-02' })).toBe(5)
    // Literal intervals and events in a curried call do not narrow the type to the first literal.
    expect(fp.overlaps({ start: '2026-11-18T09:30', end: '2026-11-18T11:00' })({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' })).toBe(true)
    expect(fp.expandEvents({ start: '2026-11-18T00:00', end: '2026-11-19T00:00' })([{ id: 'a', start: '2026-11-18T09:00', end: '2026-11-18T10:00' }])).toHaveLength(1)
    expect(fp.overlaps({ start: 1, end: 5 })({ start: 4, end: 9 })).toBe(true)
    const isWorkday = fp.isBusinessDay({})

    expect((['2026-11-20', '2026-11-21'] as PlainDate[]).filter(isWorkday)).toEqual(['2026-11-20'])
  })
})
