import { add, eachDay } from '@pyreon/time/core'
import { describe, expect, it } from 'vitest'
import { daySpan, expandOccurrences, layoutDay, layoutMonth, layoutRow, layoutTimeGrid, nowOffset, packColumns, slotTimes, visibleRange, dayBounds } from '../core'
import type { CalendarEvent, EventOccurrence, PlainDate } from '../core'
import { int, pick, rng } from './rng'
import type { Rand } from './rng'

const ev = (id: string, start: string, end: string, extra?: Partial<CalendarEvent>): CalendarEvent => ({ id, title: id, start: start as never, end: end as never, ...extra })
const occ = (events: CalendarEvent[], start: string, end: string, zone = 'UTC'): EventOccurrence[] => expandOccurrences(events, { start, end } as never, zone)

const shuffle = <T,>(r: Rand, list: readonly T[]): T[] => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, 0, i)
    ;[a[i], a[j]] = [a[j] as T, a[i] as T]
  }

  return a
}

describe('packColumns', () => {
  it('puts overlapping blocks side by side and lets a block grow into columns that are free', () => {
    const got = packColumns([
      { key: 'a', start: 0, end: 60 },
      { key: 'b', start: 30, end: 90 },
      { key: 'c', start: 60, end: 120 },
    ])
    expect(got.map((p) => [p.key, p.column, p.columns, p.span])).toEqual([
      ['a', 0, 2, 1],
      ['b', 1, 2, 1],
      ['c', 0, 2, 1],
    ])
    expect(packColumns([{ key: 'long', start: 0, end: 180 }, { key: 'x', start: 0, end: 60 }, { key: 'y', start: 60, end: 120 }]).map((p) => [p.key, p.column, p.span])).toEqual([
      ['long', 0, 1],
      ['x', 1, 1],
      ['y', 1, 1],
    ])
  })

  it('gives a block the width of the free columns to its right', () => {
    const got = packColumns([{ key: 'a', start: 0, end: 60 }, { key: 'b', start: 0, end: 30 }, { key: 'c', start: 0, end: 30 }, { key: 'd', start: 40, end: 60 }])
    const d = got.find((p) => p.key === 'd')!
    const a = got.find((p) => p.key === 'a')!
    expect(a.columns).toBe(3)
    expect(a.span).toBe(1)
    expect([d.column, d.span]).toEqual([1, 2])
  })

  it('does not group blocks that only touch, and gives a short block the minimum height', () => {
    expect(packColumns([{ key: 'a', start: 0, end: 60 }, { key: 'b', start: 60, end: 120 }]).map((p) => p.columns)).toEqual([1, 1])
    expect(packColumns([{ key: 'a', start: 0, end: 5 }, { key: 'b', start: 5, end: 10 }]).map((p) => p.columns)).toEqual([2, 2])
    expect(packColumns([{ key: 'a', start: 0, end: 5 }, { key: 'b', start: 5, end: 10 }], { minMinutes: 1 }).map((p) => p.columns)).toEqual([1, 1])
  })

  it('keeps a pinned block in its column when it is free', () => {
    const blocks = [{ key: 'a', start: 0, end: 60 }, { key: 'b', start: 0, end: 60 }, { key: 'c', start: 0, end: 60 }]
    expect(packColumns(blocks, { pinned: new Map([['c', 0]]) }).find((p) => p.key === 'c')!.column).toBe(0)
    expect(packColumns(blocks).find((p) => p.key === 'c')!.column).toBe(2)
  })

  it('handles 200 events in one hour without a quadratic blow-up', () => {
    const blocks = Array.from({ length: 200 }, (_, i) => ({ key: `e${i}`, start: 600 + (i % 7), end: 660 }))
    const t0 = performance.now()
    const got = packColumns(blocks)
    const ms = performance.now() - t0
    expect(got).toHaveLength(200)
    expect(new Set(got.map((p) => p.column)).size).toBe(200)
    expect(ms).toBeLessThan(250)
    console.info(`[measured] packing 200 events in one hour: ${ms.toFixed(1)} ms`)
  })

  it('property: no two blocks of a column overlap, all are placed once, widths fit, and the order of the input does not matter (2000 cases)', () => {
    const r = rng(11)
    for (let n = 0; n < 2000; n++) {
      const blocks = Array.from({ length: int(r, 0, 14) }, (_, i) => {
        const start = int(r, 0, 300)

        return { key: `k${i}`, start, end: start + int(r, 0, 120) }
      })
      const min = pick(r, [1, 15, 30])
      const got = packColumns(blocks, { minMinutes: min })
      expect(got.map((p) => p.key).sort()).toEqual(blocks.map((b) => b.key).sort())
      const byKey = new Map(blocks.map((b) => [b.key, { s: b.start, e: Math.max(b.end, b.start + min) }]))
      for (const p of got) {
        expect(p.column + p.span).toBeLessThanOrEqual(p.columns)
        expect(p.span).toBeGreaterThanOrEqual(1)
      }
      for (const a of got) {
        for (const b of got) {
          if (a.key >= b.key) continue
          const x = byKey.get(a.key)!
          const y = byKey.get(b.key)!
          const overlap = x.s < y.e && y.s < x.e
          if (overlap) {
            // overlapping blocks never share a column, and their widths never overlap on screen
            expect(a.column + a.span <= b.column || b.column + b.span <= a.column).toBe(true)
          }
        }
      }
      const again = packColumns(shuffle(r, blocks), { minMinutes: min })
      expect(new Map(again.map((p) => [p.key, p]))).toEqual(new Map(got.map((p) => [p.key, p])))
    }
  })
})

describe('month lanes', () => {
  const dates = eachDay('2026-11-16', '2026-11-22') as PlainDate[]

  it('places longer events first, splits at the week edges with continuation flags, and counts what a capacity hides', () => {
    const list = occ(
      [
        ev('conf', '2026-11-14', '2026-11-18'),
        ev('mon', '2026-11-16T09:00', '2026-11-16T10:00'),
        ev('two', '2026-11-16', '2026-11-18'),
        ev('lead', '2026-11-20', '2026-11-26'),
      ],
      '2026-11-09',
      '2026-11-30',
    )
    const row = layoutRow(list, dates)
    expect(row.lanes.map((l) => l.map((s) => [s.occurrenceKey.split(':')[0], s.startColumn, s.endColumn, s.continuesBefore, s.continuesAfter]))).toEqual([
      [['lead', 4, 6, false, true], ['conf', 0, 1, true, false]],
      [['two', 0, 1, false, false]],
      [['mon', 0, 0, false, false]],
    ])
    const capped = layoutRow(list, dates, 1)
    expect(capped.lanes).toHaveLength(1)
    expect(capped.more).toEqual([2, 1, 0, 0, 0, 0, 0])
  })

  it('an end exactly at midnight does not touch the next day, and a zero-length event sits on its day', () => {
    const list = occ([ev('a', '2026-11-16T22:00', '2026-11-17T00:00'), ev('z', '2026-11-18T12:00', '2026-11-18T12:00')], '2026-11-16', '2026-11-23')
    expect(list.map((o) => daySpan(o))).toEqual([{ first: '2026-11-16', last: '2026-11-16' }, { first: '2026-11-18', last: '2026-11-18' }])
  })

  it('hidden days leave their columns out and an event across them is one segment', () => {
    const visible = dates.filter((d) => d !== '2026-11-18')
    const list = occ([ev('x', '2026-11-17', '2026-11-20')], '2026-11-16', '2026-11-23')
    const row = layoutRow(list, visible)
    expect(row.lanes[0]![0]).toMatchObject({ startColumn: 1, endColumn: 2 })
  })

  it('property: segments cover exactly the span of each event inside the row, lanes do not overlap, and shuffling the input changes nothing (1500 cases)', () => {
    const r = rng(21)
    for (let n = 0; n < 1500; n++) {
      const events = Array.from({ length: int(r, 0, 12) }, (_, i) => {
        const start = add('2026-11-10', { days: int(r, 0, 20) })
        const timed = r() < 0.4

        return timed ? ev(`t${i}`, `${start}T${String(int(r, 0, 22)).padStart(2, '0')}:00`, `${add(start, { days: int(r, 0, 3) })}T23:00`) : ev(`d${i}`, start, add(start, { days: int(r, 1, 9) }))
      })
      const list = occ(events, '2026-11-02', '2026-12-14')
      const month = visibleRange('month', '2026-11-18')
      const layout = layoutMonth(list, month.rows)
      const again = layoutMonth(shuffle(r, list), month.rows)
      expect(JSON.stringify(again)).toBe(JSON.stringify(layout))
      for (const row of layout) {
        const seen = new Map<string, number[]>()
        row.lanes.forEach((lane) => {
          const used = new Set<number>()
          for (const s of lane) {
            for (let c = s.startColumn; c <= s.endColumn; c++) {
              expect(used.has(c)).toBe(false)
              used.add(c)
            }
            seen.set(s.occurrenceKey, [...(seen.get(s.occurrenceKey) ?? []), ...Array.from({ length: s.endColumn - s.startColumn + 1 }, (_, i) => s.startColumn + i)])
          }
        })
        for (const o of list) {
          const { first, last } = daySpan(o)
          const expected = row.dates.map((d, i) => (d >= first && d <= last ? i : -1)).filter((i) => i >= 0)
          expect(seen.get(o.key)?.sort((a, b) => a - b) ?? []).toEqual(expected)
        }
      }
    }
  })

  it('lays out 1,000 events of a month within a generous bound', () => {
    const r = rng(5)
    const events = Array.from({ length: 1000 }, (_, i) => {
      const start = add('2026-11-01', { days: int(r, 0, 29) })

      return r() < 0.3 ? ev(`e${i}`, start, add(start, { days: int(r, 1, 5) })) : ev(`e${i}`, `${start}T${String(int(r, 6, 20)).padStart(2, '0')}:00`, `${start}T${String(int(r, 21, 22)).padStart(2, '0')}:00`)
    })
    const month = visibleRange('month', '2026-11-18')
    const t0 = performance.now()
    const list = expandOccurrences(events, month.range, 'Europe/Prague')
    const layout = layoutMonth(list, month.rows, 4)
    const ms = performance.now() - t0
    expect(list).toHaveLength(1000)
    expect(layout).toHaveLength(6)
    expect(ms).toBeLessThan(1500)
    console.info(`[measured] expand and lay out 1,000 events in a month: ${ms.toFixed(1)} ms`)
  })
})

describe('the time grid', () => {
  it('splits an event across midnight into one block per day, and places each occurrence once per day it touches', () => {
    const list = occ([ev('night', '2026-11-18T22:00', '2026-11-19T02:00'), ev('long', '2026-11-18T12:00', '2026-11-20T12:00')], '2026-11-16', '2026-11-23')
    const dates = visibleRange('week', '2026-11-18').dates
    const grid = layoutTimeGrid(list, dates, 'UTC')
    const placed = grid.days.map((d) => [d.date, d.blocks.map((b) => b.occurrenceKey.split(':')[0]).sort()]).filter(([, blocks]) => (blocks as string[]).length > 0)
    expect(placed).toEqual([
      ['2026-11-18', ['long', 'night']],
      ['2026-11-19', ['long', 'night']],
      ['2026-11-20', ['long']],
    ])
    const night18 = grid.days[2]!.blocks.find((b) => b.occurrenceKey.startsWith('night'))!
    expect([night18.top, night18.continuesBefore, night18.continuesAfter]).toEqual([22 / 24, false, true])
    expect(night18.top + night18.height).toBeCloseTo(1, 10)
    const night19 = grid.days[3]!.blocks.find((b) => b.occurrenceKey.startsWith('night'))!
    expect([night19.top, night19.height, night19.continuesBefore]).toEqual([0, 2 / 24, true])
  })

  it('an event that ends exactly at midnight is not on the next day', () => {
    const list = occ([ev('a', '2026-11-18T20:00', '2026-11-19T00:00')], '2026-11-16', '2026-11-23')
    const grid = layoutTimeGrid(list, ['2026-11-18', '2026-11-19'] as never, 'UTC')
    expect(grid.days.map((d) => d.blocks.length)).toEqual([1, 0])
    const [block] = grid.days[0]!.blocks
    expect([block!.endMinute, block!.continuesAfter]).toEqual([1440, false])
    expect(block!.top + block!.height).toBeCloseTo(1, 10)
  })

  it('cuts at dayStart and dayEnd, drops what is outside, and gives a short event its minimum height', () => {
    const list = occ([ev('early', '2026-11-18T06:00', '2026-11-18T09:00'), ev('out', '2026-11-18T01:00', '2026-11-18T02:00'), ev('late', '2026-11-18T17:30', '2026-11-18T19:00'), ev('tiny', '2026-11-18T12:00', '2026-11-18T12:05')], '2026-11-18', '2026-11-19')
    const blocks = layoutDay('2026-11-18', list, 'UTC', { dayStart: '08:00', dayEnd: '18:00', minBlockMinutes: 20 })
    expect(blocks.map((b) => b.occurrenceKey.split(':')[0])).toEqual(['early', 'tiny', 'late'])
    expect(blocks[0]).toMatchObject({ top: 0, continuesBefore: true, continuesAfter: false })
    expect(blocks[0]!.height).toBeCloseTo(1 / 10, 10)
    expect(blocks[1]!.height).toBeCloseTo(20 / 600, 10)
    expect(blocks[2]).toMatchObject({ continuesAfter: true })
    expect(slotTimes({ dayStart: '08:00', dayEnd: '10:00', slot: { minutes: 45 } })).toEqual(['08:00', '08:45', '09:30'])
    expect(() => layoutDay('2026-11-18', list, 'UTC', { dayStart: '10:00', dayEnd: '09:00' })).toThrow('[Pyreon] calendar: dayStart and dayEnd')
  })

  it('shows the same slots every day and a now line only on its own day', () => {
    const now = Date.UTC(2026, 10, 18, 15, 30)
    expect(nowOffset('2026-11-18', now, 'UTC')).toBeCloseTo(15.5 / 24, 10)
    expect(nowOffset('2026-11-19', now, 'UTC')).toBeNull()
    expect(nowOffset('2026-11-18', now, 'UTC', { dayStart: '16:00' })).toBeNull()
    expect(nowOffset('2026-11-18', now, 'Asia/Tokyo')).toBeNull()
    expect(nowOffset('2026-11-19', now, 'Asia/Tokyo')).toBeCloseTo(0.5 / 24, 10)
  })
})

describe('days that change length (a wall-clock grid)', () => {
  const near = (a: number, b: number): void => expect(a).toBeCloseTo(b, 6)

  it('Prague, spring forward (2026-03-29): 23 hours, the skipped hour is an empty row, an event across it is taller than it lasts', () => {
    expect(dayBounds('2026-03-29', 'Europe/Prague').elapsedMinutes).toBe(1380)
    const list = occ([ev('across', '2026-03-29T01:30', '2026-03-29T03:30', { timeZone: 'Europe/Prague' }), ev('after', '2026-03-29T03:00', '2026-03-29T04:00', { timeZone: 'Europe/Prague' })], '2026-03-29', '2026-03-30', 'Europe/Prague')
    const [across, after] = layoutDay('2026-03-29', list, 'Europe/Prague')
    near(across!.top, 90 / 1440)
    near(across!.height, 120 / 1440)
    near(after!.top, 180 / 1440)
    expect(across!.columns).toBe(2)
    near(nowOffset('2026-03-29', Date.UTC(2026, 2, 29, 1, 30), 'Europe/Prague')!, 210 / 1440)
    near(nowOffset('2026-03-29', Date.UTC(2026, 2, 29, 0, 30), 'Europe/Prague')!, 90 / 1440)
  })

  it('Prague, fall back (2026-10-25): 25 hours, the second pass of the repeated hour is drawn over the first and shares its columns', () => {
    expect(dayBounds('2026-10-25', 'Europe/Prague').elapsedMinutes).toBe(1500)
    const first = Date.UTC(2026, 9, 25, 0, 15)
    const second = Date.UTC(2026, 9, 25, 1, 15)
    const list = occ([{ id: 'one', title: 'one', start: first, end: first + 1_800_000 }, { id: 'two', title: 'two', start: second, end: second + 1_800_000 }], '2026-10-25', '2026-10-26', 'Europe/Prague')
    const blocks = layoutDay('2026-10-25', list, 'Europe/Prague')
    expect(blocks.map((b) => [b.startMinute, b.endMinute])).toEqual([[135, 165], [135, 165]])
    expect(blocks.map((b) => b.columns)).toEqual([2, 2])
    near(nowOffset('2026-10-25', second, 'Europe/Prague')!, 135 / 1440)
    near(nowOffset('2026-10-25', first, 'Europe/Prague')!, 135 / 1440)
  })

  it('an event that reads as ending before it starts across the repeated hour gets its minimum height, not a negative one', () => {
    const start = Date.UTC(2026, 9, 25, 0, 40)
    const end = Date.UTC(2026, 9, 25, 1, 10)
    const [b] = layoutDay('2026-10-25', occ([{ id: 'x', title: 'x', start, end }], '2026-10-25', '2026-10-26', 'Europe/Prague'), 'Europe/Prague')
    expect(b!.height).toBeGreaterThan(0)
    expect(b!.endMinute).toBeGreaterThanOrEqual(b!.startMinute)
  })

  it('New York, spring forward (2026-03-08) and fall back (2026-11-01)', () => {
    expect(dayBounds('2026-03-08', 'America/New_York').elapsedMinutes).toBe(1380)
    expect(dayBounds('2026-11-01', 'America/New_York').elapsedMinutes).toBe(1500)
    near(nowOffset('2026-03-08', Date.UTC(2026, 2, 8, 6, 30), 'America/New_York')!, 90 / 1440)
    near(nowOffset('2026-03-08', Date.UTC(2026, 2, 8, 7, 30), 'America/New_York')!, 210 / 1440)
    near(nowOffset('2026-11-01', Date.UTC(2026, 10, 1, 5, 30), 'America/New_York')!, 90 / 1440)
    near(nowOffset('2026-11-01', Date.UTC(2026, 10, 1, 6, 30), 'America/New_York')!, 90 / 1440)
    near(nowOffset('2026-11-01', Date.UTC(2026, 10, 1, 7, 30), 'America/New_York')!, 150 / 1440)
  })

  it('an all-day event over a DST change stays on its dates, and a week that holds the change lists every day once', () => {
    const e = ev('trip', '2026-03-27', '2026-04-01')
    expect(occ([e], '2026-03-23', '2026-03-30', 'Europe/Prague')[0]).toMatchObject({ start: '2026-03-27', end: '2026-04-01' })
    const week = visibleRange('week', '2026-03-29', { weekStart: 1 })
    expect(week.dates).toHaveLength(7)
  })
})

describe('a busy work week (golden)', () => {
  const week = visibleRange('workWeek', '2026-11-18')
  const events: CalendarEvent[] = [
    ev('standup', '2026-11-16T09:00', '2026-11-16T09:15', { recurrence: { every: 'day', start: '2026-11-16T09:00', until: '2026-11-20' } }),
    ev('design', '2026-11-18T14:00', '2026-11-18T15:00'),
    ev('review', '2026-11-18T14:30', '2026-11-18T16:00'),
    ev('retro', '2026-11-18T15:00', '2026-11-18T15:30'),
    ev('offsite', '2026-11-19', '2026-11-21'),
    ev('lunch', '2026-11-18T12:00', '2026-11-18T13:00'),
  ]

  it('lays the week out the way a person would draw it', () => {
    const list = occ(events, week.range.start, week.range.end)
    const grid = layoutTimeGrid(list, week.dates, 'UTC')
    const wed = grid.days[2]!.blocks.map((b) => [b.occurrenceKey.split(':')[0], b.column, b.columns, b.span])
    expect(wed).toEqual([
      ['standup', 0, 1, 1],
      ['lunch', 0, 1, 1],
      ['design', 0, 2, 1],
      ['review', 1, 2, 1],
      ['retro', 0, 2, 1],
    ])
    expect(grid.allDay.lanes.flat().map((s) => [s.occurrenceKey.split(':')[0], s.startColumn, s.endColumn])).toEqual([['offsite', 3, 4]])
    expect(grid.slots).toHaveLength(48)
  })
})
