import { describe, expect, it } from 'vitest'
import { freeSlots, intersection, mergeIntervals, overlaps, subtractIntervals } from '../core'
import { int, rng } from './rng'
import type { Interval } from '../types'

const at = (h: number, m = 0): string => `2026-11-18T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
const iv = (a: string, b: string): Interval => ({ start: a as never, end: b as never })
const span = (h1: number, h2: number): Interval => iv(at(h1), at(h2))

describe('intervals', () => {
  it('overlap is half-open and empty intervals overlap nothing', () => {
    expect(overlaps(span(9, 10), span(9, 11))).toBe(true)
    expect(overlaps(span(9, 10), span(10, 11))).toBe(false)
    expect(overlaps(span(9, 9), span(8, 10))).toBe(false)
    expect(overlaps(span(9, 17), span(10, 11))).toBe(true)
  })

  it('intersection returns the shared part or null', () => {
    expect(intersection(span(9, 11), span(10, 12))).toEqual(span(10, 11))
    expect(intersection(span(9, 10), span(10, 12))).toBeNull()
    expect(intersection(span(9, 17), span(10, 11))).toEqual(span(10, 11))
  })

  it('mergeIntervals sorts, merges overlapping and touching, drops empty ones, and leaves the input alone', () => {
    const input = [span(13, 14), span(9, 10), span(10, 11), span(12, 12), span(9, 9), span(13, 15)]
    const copy = JSON.stringify(input)

    expect(mergeIntervals(input)).toEqual([span(9, 11), span(13, 15)])
    expect(JSON.stringify(input)).toBe(copy)
    expect(mergeIntervals([])).toEqual([])
  })

  it('subtractIntervals handles unsorted, overlapping and out-of-range busy lists', () => {
    expect(subtractIntervals([span(9, 17)], [span(13, 14), span(10, 11), span(10, 12), span(6, 8), span(20, 22)])).toEqual([span(9, 10), span(12, 13), span(14, 17)])
    expect(subtractIntervals([span(9, 17)], [span(8, 18)])).toEqual([])
    expect(subtractIntervals([span(9, 17)], [])).toEqual([span(9, 17)])
    expect(subtractIntervals([span(9, 12), span(11, 14)], [span(10, 13)])).toEqual([span(9, 10), span(13, 14)])
  })

  it('works on instants (numbers) and dates as well', () => {
    expect(mergeIntervals([{ start: 5, end: 8 }, { start: 1, end: 5 }])).toEqual([{ start: 1, end: 8 }])
    expect(subtractIntervals([{ start: '2026-11-01', end: '2026-11-10' }], [{ start: '2026-11-03', end: '2026-11-04' }])).toEqual([{ start: '2026-11-01', end: '2026-11-03' }, { start: '2026-11-04', end: '2026-11-10' }])
  })

  it('a reversed or malformed interval says what is wrong', () => {
    expect(() => overlaps(span(10, 9), span(9, 10))).toThrow(/ends before it starts/)
    expect(() => mergeIntervals([{ start: 'x', end: 'y' } as never])).toThrow(/\[Pyreon\] mergeIntervals: expected list\[0\]\.start/)
    expect(() => mergeIntervals(5 as never)).toThrow(/array of intervals/)
    expect(() => intersection(null as never, span(9, 10))).toThrow(/interval/)
  })

  it('property: subtraction leaves no busy time, keeps the rest, and merge is idempotent', () => {
    const r = rng(21)
    const rand = (): Interval => {
      const a = int(r, 0, 1400)

      return { start: ((a * 60_000)) as never, end: ((a + int(r, 0, 300)) * 60_000) as never }
    }

    for (let i = 0; i < 300; i++) {
      const from = Array.from({ length: int(r, 1, 4) }, rand)
      const busy = Array.from({ length: int(r, 0, 6) }, rand)
      const free = subtractIntervals(from as unknown as Interval<number>[], busy as unknown as Interval<number>[])

      for (const f of free) {
        for (const b of busy) expect(overlaps(f as unknown as Interval<number>, b as unknown as Interval<number>)).toBe(false)
        expect(f.start < f.end).toBe(true)
      }
      for (let m = 0; m < 1700; m += 7) {
        const t = m * 60_000
        const inFrom = from.some((f) => (f.start as unknown as number) <= t && t < (f.end as unknown as number))
        const inBusy = busy.some((f) => (f.start as unknown as number) <= t && t < (f.end as unknown as number))
        const inFree = free.some((f) => (f.start as unknown as number) <= t && t < (f.end as unknown as number))

        expect(inFree).toBe(inFrom && !inBusy)
      }
      expect(mergeIntervals(mergeIntervals(from as unknown as Interval<number>[]))).toEqual(mergeIntervals(from as unknown as Interval<number>[]))
    }
  })
})

describe('freeSlots', () => {
  const day = iv(at(9), at(12))

  it('lists slots of the duration that fit around busy time, on the grid of the duration from the start (10:30 is not offered: it is off the grid)', () => {
    expect(freeSlots({ within: day, busy: [iv(at(10), at(10, 30))], duration: { minutes: 60 } })).toEqual([span(9, 10), span(11, 12)])
  })

  it('slots sit on a grid of step from the start of each stretch, whatever the meetings do', () => {
    const slots = freeSlots({ within: day, busy: [iv(at(9), at(9, 10))], duration: { minutes: 30 } })

    expect(slots.map((s) => s.start)).toEqual([at(9, 30), at(10), at(10, 30), at(11), at(11, 30)])
    const stepped = freeSlots({ within: day, busy: [], duration: { minutes: 30 }, step: { minutes: 15 } })

    expect(stepped.map((s) => s.start)).toEqual([at(9), at(9, 15), at(9, 30), at(9, 45), at(10), at(10, 15), at(10, 30), at(10, 45), at(11), at(11, 15), at(11, 30)])
  })

  it('a slot may end exactly when a busy interval starts and start exactly when one ends', () => {
    expect(freeSlots({ within: day, busy: [iv(at(10), at(11))], duration: { hours: 1 } })).toEqual([span(9, 10), span(11, 12)])
  })

  it('buffers keep free time before and after the slot, counted from busy time', () => {
    const slots = freeSlots({ within: iv(at(9), at(13)), busy: [iv(at(11), at(12))], duration: { minutes: 30 }, step: { minutes: 30 }, buffer: { before: { minutes: 15 }, after: { minutes: 15 } } })

    expect(slots.map((s) => s.start)).toEqual([at(9), at(9, 30), at(10), at(12, 30)])
    for (const s of slots) {
      const wall = (x: string): number => Date.parse(`${x}:00Z`)

      expect(wall(s.end) + 15 * 60_000 <= wall(at(11)) || wall(s.start) >= wall(at(12)) + 15 * 60_000).toBe(true)
    }
  })

  it('works inside business hours, across days, skipping weekends', () => {
    const office = { hours: { 4: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } } as const
    const slots = freeSlots({ within: iv('2026-11-19T00:00', '2026-11-23T00:00'), busy: [iv('2026-11-19T10:00', '2026-11-19T17:00'), iv('2026-11-20T09:00', '2026-11-20T16:00')], duration: { hours: 1 }, calendar: office })

    expect(slots.map((s) => s.start)).toEqual(['2026-11-19T09:00', '2026-11-20T16:00'])
  })

  it('several within intervals; busy lists that are unsorted, overlapping, or outside', () => {
    const slots = freeSlots({ within: [iv(at(14), at(16)), iv(at(9), at(11))], busy: [span(10, 11), span(9, 10), span(10, 10), iv('2026-12-01T09:00', '2026-12-01T10:00')], duration: { hours: 1 } })

    expect(slots).toEqual([span(14, 15), span(15, 16)])
  })

  it('works on instants', () => {
    expect(freeSlots({ within: { start: 0, end: 10_000 }, busy: [{ start: 4000, end: 5000 }], duration: { seconds: 2 } })).toEqual([{ start: 0, end: 2000 }, { start: 2000, end: 4000 }, { start: 6000, end: 8000 }, { start: 8000, end: 10_000 }])
  })

  it('a zero or negative duration or step, a calendar with instants, too many slots: errors with the fix', () => {
    expect(() => freeSlots({ within: day, busy: [], duration: { minutes: 0 } })).toThrow(/duration must be positive/)
    expect(() => freeSlots({ within: day, busy: [], duration: { minutes: -30 } })).toThrow(/duration must be positive/)
    expect(() => freeSlots({ within: day, busy: [], duration: { minutes: 30 }, step: { minutes: 0 } })).toThrow(/step must be positive/)
    expect(() => freeSlots({ within: day, busy: [], duration: { minutes: 30 }, buffer: { before: { minutes: -1 } } })).toThrow(/buffer.before must be zero or positive/)
    expect(() => freeSlots({ within: day, busy: [], duration: { days: 1 } })).toThrow(/calendar units/)
    expect(() => freeSlots({ within: { start: 0, end: 10 }, busy: [], duration: { seconds: 1 }, calendar: {} })).toThrow(/works on date-times/)
    expect(() => freeSlots({ within: iv(at(0), '2026-12-18T00:00'), busy: [], duration: { minutes: 1 }, limit: 100 })).toThrow(/more than 100 slots/)
    expect(() => freeSlots(undefined as never)).toThrow(/options object/)
  })

  it('property: slots never overlap busy time, respect buffers, stay inside within, and are sorted', () => {
    const r = rng(77)
    const w = (m: number): string => new Date(Date.UTC(2026, 10, 18, 0, m)).toISOString().slice(0, 16)

    for (let i = 0; i < 400; i++) {
      const within = iv(w(0), w(int(r, 200, 1400)))
      const busy = Array.from({ length: int(r, 0, 8) }, () => {
        const a = int(r, 0, 1400)

        return iv(w(a), w(a + int(r, 0, 120)))
      })
      const duration = int(r, 5, 90)
      const before = int(r, 0, 30)
      const after = int(r, 0, 30)
      const slots = freeSlots({ within, busy, duration: { minutes: duration }, step: { minutes: int(r, 5, 60) }, buffer: { before: { minutes: before }, after: { minutes: after } } })
      const t = (x: string): number => Date.parse(`${x}:00Z`) / 60_000

      slots.forEach((s, k) => {
        expect(t(s.end) - t(s.start)).toBe(duration)
        expect(t(s.start) >= t(within.start) && t(s.end) <= t(within.end)).toBe(true)
        if (k > 0) expect(t(s.start) > t(slots[k - 1]!.start)).toBe(true)
        for (const b of busy) {
          if (t(b.end) === t(b.start)) continue
          expect(t(s.start) >= t(b.end) + before || t(s.end) + after <= t(b.start), `${JSON.stringify(s)} against ${JSON.stringify(b)}`).toBe(true)
        }
      })
    }
  })
})
