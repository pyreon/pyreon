import { computed } from '@pyreon/reactivity'
import type { Computed } from '@pyreon/reactivity'
import type { BusinessCalendar, WorkingHours } from '@pyreon/schedule/core'
import { dayOfWeek } from '@pyreon/time/core'
import type { DayCell, MonthWeek, TimeGridDay, TimeGridModel } from './calendar-types'
import { layoutRow } from './lanes'
import type { CalState } from './state'
import { layoutDay, nowOffset, slotTimes, visibleMinutes } from './timegrid'
import type { TimeGridOptions } from './timegrid'
import type { EventOccurrence, PlainDate, TimedBlock, Weekday, WeekLayout } from './types'

/** Computeds kept by key while the key is on screen: a new layout of the same day or week reuses its computed (and so its memo). */
class Memo<V extends { dispose(): void }> {
  private readonly map = new Map<string, V>()

  get(key: string, make: () => V): V {
    let v = this.map.get(key)
    if (v === undefined) {
      v = make()
      this.map.set(key, v)
    }

    return v
  }

  /** Forget (and dispose) everything that is not in `keep`. */
  sweep(keep: ReadonlySet<string>): void {
    for (const [key, v] of this.map) {
      if (!keep.has(key)) {
        v.dispose()
        this.map.delete(key)
      }
    }
  }
}

/** A string that changes exactly when the layout of these occurrences would (their keys, instants and shown times). */
function signatureOf(list: readonly EventOccurrence[]): string {
  return list
    .map((o) => `${o.key}|${o.startMs}|${o.endMs}|${o.start}|${o.end}`)
    .sort()
    .join(';')
}

/** The occurrences that touch any of `dates`, each once. */
function touching<Meta>(s: CalState<Meta>, dates: readonly PlainDate[]): EventOccurrence<Meta>[] {
  const seen = new Set<string>()
  const out: EventOccurrence<Meta>[] = []
  for (const date of dates) {
    for (const o of s.byDay().get(date) ?? []) {
      if (!seen.has(o.key)) {
        seen.add(o.key)
        out.push(o)
      }
    }
  }

  return out
}

function gridOptions<Meta>(s: CalState<Meta>): TimeGridOptions {
  const o = s.options

  return {
    ...(o.dayStart === undefined ? {} : { dayStart: o.dayStart }),
    ...(o.dayEnd === undefined ? {} : { dayEnd: o.dayEnd }),
    ...(o.slot === undefined ? {} : { slot: o.slot }),
    ...(o.minBlockMinutes === undefined ? {} : { minBlockMinutes: o.minBlockMinutes }),
  }
}

const gridKey = (g: TimeGridOptions): string => `${g.dayStart ?? ''}|${g.dayEnd ?? ''}|${g.minBlockMinutes ?? ''}`

/**
 * One layout that is recomputed only when its signature changes. The signature and the data it describes are read in one
 * computed that is gated by the signature (an explicit `equals`), so a change elsewhere in the events leaves the layout alone.
 */
function memoLayout<T, R>(signature: () => string, data: () => T, compute: (data: T) => R): Computed<R> {
  const input = computed(() => ({ sig: signature(), data: data() }), { equals: (a, b) => a.sig === b.sig })

  return computed(() => compute(input().data))
}

/** The weeks of the month on show; each week's layout is recomputed only when that week's events change. */
export function createMonthModel<Meta>(s: CalState<Meta>): Computed<{ key: string; weeks: readonly MonthWeek[]; weekdays: readonly Weekday[]; capacity: number }> {
  const memo = new Memo<Computed<WeekLayout>>()
  const capacity = (): number => s.options.monthCapacity ?? 3

  return computed(() => {
    const shown = s.shown()
    const monthKey = s.date().slice(0, 7)
    const keep = new Set<string>()
    const weeks = shown.rows.map((row): MonthWeek => {
      const key = `${row[0]}|${row.length}`
      keep.add(key)
      const layout = memo.get(key, () =>
        memoLayout(
          () => `${capacity()}|${s.zone()}|${signatureOf(touching(s, row))}`,
          () => ({ list: touching(s, row), capacity: capacity() }),
          (input) => {
            s.options.instrument?.layoutRow?.(row[0] as PlainDate)

            return layoutRow(input.list, row, input.capacity)
          },
        ),
      )
      const days = row.map((date): DayCell => ({ date, key: date, inMonth: date.slice(0, 7) === monthKey, weekend: (s.options.weekend ?? [6, 7]).includes(dayOfWeek(date)) }))

      return { key, days, layout }
    })
    memo.sweep(keep)

    return { key: monthKey, weeks, weekdays: (shown.rows[0] ?? []).map((d) => dayOfWeek(d)), capacity: capacity() }
  })
}

const MIN = 60

/** The opening hours of a day in minutes from midnight (whatever the visible window), or `null` when none are given. */
export function businessMinutes<Meta>(s: CalState<Meta>, date: PlainDate): { from: number; to: number }[] | null {
  const found = businessFor(s.options.businessHours, date, { from: 0, to: 1440 })

  return found === null ? null : found.map((w) => ({ from: w.top * 1440, to: (w.top + w.height) * 1440 }))
}

/** Opening hours of a day as fractions of the visible window, or `null` when none are given. */
function businessFor(hours: WorkingHours | BusinessCalendar | undefined, date: PlainDate, window: { from: number; to: number }): { top: number; height: number }[] | null {
  if (hours === undefined) return null
  const calendar = 'hours' in hours || 'weekend' in hours || 'holidays' in hours ? (hours as BusinessCalendar) : { hours: hours as WorkingHours }
  const weekday = dayOfWeek(date)
  const weekend = calendar.weekend ?? []
  const holiday = typeof calendar.holidays === 'function' ? calendar.holidays(date) : (calendar.holidays ?? []).includes(date)
  const schedule = calendar.hours
  if (schedule === undefined) return null
  if (weekend.includes(weekday) || holiday) return []
  const minutes = (t: string): number => Number(t.slice(0, 2)) * MIN + Number(t.slice(3, 5))
  const own = (schedule[weekday] ?? []).map((w) => ({ from: minutes(w.from), to: minutes(w.to) <= minutes(w.from) ? 1440 : minutes(w.to) }))
  const previous = (((weekday + 5) % 7) + 1) as Weekday
  const tails = (schedule[previous] ?? []).filter((w) => minutes(w.to) <= minutes(w.from) && minutes(w.to) > 0).map((w) => ({ from: 0, to: minutes(w.to) }))
  const span = window.to - window.from

  return [...tails, ...own]
    .map((w) => ({ from: Math.max(w.from, window.from), to: Math.min(w.to, window.to) }))
    .filter((w) => w.to > w.from)
    .map((w) => ({ top: (w.from - window.from) / span, height: (w.to - w.from) / span }))
}

/** The days of a time grid: each day's blocks and now line are computeds that change only with that day. */
export function createTimeGridModel<Meta>(s: CalState<Meta>): Computed<TimeGridModel> {
  const blocks = new Memo<Computed<readonly TimedBlock[]>>()
  const nows = new Memo<Computed<number | null>>()
  const allDay = new Memo<Computed<WeekLayout>>()

  return computed((): TimeGridModel => {
    const dates = s.shown().dates
    const grid = gridOptions(s)
    const window = visibleMinutes(grid)
    const slot = Math.max(1, Math.round(((s.options.slot?.hours ?? 0) * 60 + (s.options.slot?.minutes ?? 0)) || 30))
    const keep = new Set<string>()
    const days = dates.map((date): TimeGridDay => {
      const key = `${date}|${gridKey(grid)}`
      keep.add(key)
      const day = blocks.get(key, () =>
        memoLayout(
          () => `${s.zone()}|${gridKey(grid)}|${signatureOf(s.byDay().get(date) ?? [])}`,
          () => ({ list: s.byDay().get(date) ?? [], zone: s.zone() }),
          (input) => {
            s.options.instrument?.layoutDay?.(date)

            return layoutDay(date, input.list, input.zone, grid)
          },
        ),
      )
      const now = nows.get(key, () => computed(() => nowOffset(date, s.now(), s.zone(), grid)))

      return { date, key: date, weekend: (s.options.weekend ?? [6, 7]).includes(dayOfWeek(date)), blocks: day, nowOffset: now, business: businessFor(s.options.businessHours, date, window) }
    })
    blocks.sweep(keep)
    nows.sweep(keep)
    const rowKey = `${dates[0] ?? ''}|${dates.length}`
    const row = allDay.get(rowKey, () =>
      memoLayout(
        () => `${s.zone()}|${signatureOf(touching(s, dates).filter((o) => o.allDay))}`,
        () => touching(s, dates).filter((o) => o.allDay),
        (list) => layoutRow(list, dates),
      ),
    )
    allDay.sweep(new Set([rowKey]))

    return { days, allDay: row, slots: slotTimes(grid), from: window.from, to: window.to, slot }
  })
}
