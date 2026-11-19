import { add, dayOfWeek, eachDay, monthGrid, startOf, weekendOf } from '@pyreon/time/core'
import type { Interval, PlainDate, Weekday } from './types'

export type ViewName = 'month' | 'week' | 'workWeek' | 'day' | 'days' | 'agenda' | 'timeline' | 'year'

export interface ViewOptions {
  /** First day of the week, an ISO weekday (1 Monday ... 7 Sunday). Default 1. */
  weekStart?: Weekday
  /** Weekdays that are never shown (a week view without them has fewer columns). */
  hiddenDays?: readonly Weekday[]
  /** The weekend, hidden by `workWeek`. Default Saturday and Sunday. */
  weekend?: readonly Weekday[]
  /** How many days `days` shows. Default 3. */
  days?: number
  /** How many days `agenda` lists. Default 30. */
  agendaDays?: number
}

export interface VisibleRange {
  view: ViewName
  /** The anchor date as given. */
  date: PlainDate
  /** The window: `start` inclusive, `end` exclusive. A month includes the leading and trailing days of its grid. */
  range: Interval<PlainDate>
  /** Every date of the range that is shown (hidden weekdays removed), in order. */
  dates: readonly PlainDate[]
  /** `dates` in rows: the weeks of a month, a single row for the other views. */
  rows: readonly (readonly PlainDate[])[]
}

const DEFAULT_WEEKEND: readonly Weekday[] = [6, 7]

function hiddenSet(view: ViewName, options: ViewOptions): ReadonlySet<Weekday> {
  const hidden = new Set<Weekday>(options.hiddenDays ?? [])
  if (view === 'workWeek') for (const w of options.weekend ?? DEFAULT_WEEKEND) hidden.add(w)

  return hidden
}

function count(name: string, value: number | undefined, fallback: number): number {
  const n = value ?? fallback
  if (!Number.isInteger(n) || n < 1 || n > 366) throw new Error(`[Pyreon] calendar: ${name} must be a whole number from 1 to 366, got ${String(value)}`)

  return n
}

/** The window of a view around `date`, before hidden days are removed. */
function window(view: ViewName, date: PlainDate, options: ViewOptions): Interval<PlainDate> {
  const weekStart = options.weekStart ?? 1
  switch (view) {
    case 'month': {
      const grid = monthGrid(date, { weekStart })

      return { start: grid[0]![0]!, end: add(grid.at(-1)!.at(-1)!, { days: 1 }) }
    }
    case 'week':
    case 'workWeek': {
      const start = startOf(date, 'week', { weekStart })

      return { start, end: add(start, { days: 7 }) }
    }
    case 'days':
      return { start: date, end: add(date, { days: count('days', options.days, 3) }) }
    case 'agenda':
      return { start: date, end: add(date, { days: count('agendaDays', options.agendaDays, 30) }) }
    case 'year': {
      const start = startOf(date, 'year')

      return { start, end: add(start, { years: 1 }) }
    }
    default:
      return { start: date, end: add(date, { days: 1 }) }
  }
}

function rowsOf(view: ViewName, dates: readonly PlainDate[], columns: number): (readonly PlainDate[])[] {
  if (view !== 'month') return [dates]
  const rows: PlainDate[][] = []
  for (let i = 0; i < dates.length; i += columns) rows.push(dates.slice(i, i + columns))

  return rows
}

/**
 * The window a view shows around `date`: the grid of a month (with its leading and trailing days), a week from `weekStart`, a
 * work week, a day, `days` days, an agenda of `agendaDays` days, or a year. Hidden weekdays are left out of `dates` and `rows`.
 *
 * @example visibleRange('week', '2026-11-18').range // => { start: '2026-11-16', end: '2026-11-23' }
 * @example visibleRange('workWeek', '2026-11-18').dates.length // => 5
 */
export function visibleRange(view: ViewName, date: PlainDate, options: ViewOptions = {}): VisibleRange {
  const range = window(view, date, options)
  const hidden = hiddenSet(view, options)
  const dates = eachDay(range.start, add(range.end, { days: -1 })).filter((d) => !hidden.has(dayOfWeek(d)))
  const columns = 7 - [...hidden].length

  return { view, date, range, dates, rows: rowsOf(view, dates, Math.max(1, columns)) }
}

/** The anchor date after moving `steps` views forward (negative: back): a month, a week, a day, `days` days, an agenda, a year. */
export function navigate(view: ViewName, date: PlainDate, steps: number, options: ViewOptions = {}): PlainDate {
  switch (view) {
    case 'month':
      return add(date, { months: steps })
    case 'week':
    case 'workWeek':
      return add(date, { weeks: steps })
    case 'days':
      return add(date, { days: steps * count('days', options.days, 3) })
    case 'agenda':
      return add(date, { days: steps * count('agendaDays', options.agendaDays, 30) })
    case 'year':
      return add(date, { years: steps })
    default:
      return add(date, { days: steps })
  }
}

/** What a title formatter is told. `last` is the last shown day (inclusive). */
export interface TitleInfo {
  view: ViewName
  date: PlainDate
  first: PlainDate
  last: PlainDate
}

export type TitleFormatter = (info: TitleInfo) => string

/** A title that needs no locale: `2026-11`, `2026-11-16 to 2026-11-22`, `2026`. The reactive calendar passes the real formatter. */
export const plainTitle: TitleFormatter = ({ view, date, first, last }) => {
  if (view === 'month') return date.slice(0, 7)
  if (view === 'year') return date.slice(0, 4)

  return first === last ? first : `${first} to ${last}`
}

/** The title of a view: the month for a month, the first and last day for a week or a range, the date for a day, the year for a year. */
export function viewTitle(shown: VisibleRange, format: TitleFormatter = plainTitle): string {
  const first = shown.dates[0] ?? shown.range.start
  const last = shown.dates.at(-1) ?? shown.range.start

  return format({ view: shown.view, date: shown.date, first, last })
}

/** The weekend of a locale, for `hiddenDays` and `workWeek`. */
export { weekendOf }
