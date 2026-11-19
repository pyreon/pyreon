import { add, dateParts } from '@pyreon/time/core'
import { bad, checkCapacity, checkOccurrences, isShown, toDates, toRows } from './check'
import { dateOf } from './model'
import type { EventOccurrence, EventSegment, PlainDate, WeekLayout } from './types'
import type { VisibleRange } from './views'

/** The first and last date (inclusive) an occurrence touches. An end exactly at midnight does not touch that day. */
export function daySpan(o: EventOccurrence): { first: PlainDate; last: PlainDate } {
  checkOccurrences('daySpan', 'occurrence', [o])
  return spanOf(o)
}

function spanOf(o: EventOccurrence): { first: PlainDate; last: PlainDate } {
  const first = dateOf(o.start)
  if (o.allDay) return { first, last: add(o.end as PlainDate, { days: -1 }) < first ? first : add(o.end as PlainDate, { days: -1 }) }
  const endDate = dateOf(o.end)
  const endsAtMidnight = o.end.length > 10 && o.end.slice(11) === '00:00' && o.endMs > o.startMs

  return { first, last: endsAtMidnight ? add(endDate, { days: -1 }) : endDate }
}

/** Days from `a` to `b` (both dates, `b` not before `a`), counted on the calendar. */
function daysBetween(a: PlainDate, b: PlainDate): number {
  const x = dateParts(a)
  const y = dateParts(b)

  return Math.round((Date.UTC(y.year, y.month - 1, y.day) - Date.UTC(x.year, x.month - 1, x.day)) / 86_400_000)
}

interface Candidate {
  o: EventOccurrence
  startColumn: number
  endColumn: number
  length: number
  continuesBefore: boolean
  continuesAfter: boolean
}

/** Columns of `dates` an occurrence covers: from the first shown day on or after its start to the last on or before its end. */
function columnsOf(o: EventOccurrence, dates: readonly PlainDate[]): Candidate | null {
  const { first, last } = spanOf(o)
  let startColumn = -1
  let endColumn = -1
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i] as PlainDate
    if (d >= first && d <= last) {
      if (startColumn < 0) startColumn = i
      endColumn = i
    }
  }
  if (startColumn < 0) return null

  return { o, startColumn, endColumn, length: daysBetween(first, last) + 1, continuesBefore: first < (dates[0] as PlainDate), continuesAfter: last > (dates.at(-1) as PlainDate) }
}

/** Longer first, then all-day before timed, then earlier, then by key: a total order, so the result does not depend on input order. */
function order(a: Candidate, b: Candidate): number {
  if (a.length !== b.length) return b.length - a.length
  if (a.o.allDay !== b.o.allDay) return a.o.allDay ? -1 : 1
  if (a.o.startMs !== b.o.startMs) return a.o.startMs - b.o.startMs
  if (a.o.endMs !== b.o.endMs) return b.o.endMs - a.o.endMs

  return a.o.key < b.o.key ? -1 : a.o.key > b.o.key ? 1 : 0
}

/** The first lane with all of the columns free. */
function freeLane(busy: boolean[][], from: number, to: number): number {
  for (let lane = 0; lane < busy.length; lane++) {
    const taken = busy[lane] as boolean[]
    let free = true
    for (let c = from; c <= to && free; c++) free = taken[c] !== true
    if (free) return lane
  }
  busy.push([])

  return busy.length - 1
}

/**
 * Multi-day, all-day and timed events as segments in lanes across one row of days (a week of a month grid, or the all-day row
 * of a time grid). Each occurrence becomes one segment per row, cut at the row's edges with continuation flags. Longer events
 * go first, so they get the top lanes; the order is total, so the lanes do not depend on the order of `occurrences`. With a
 * `capacity`, lanes beyond it are dropped and counted per day in `more`.
 */
export function layoutRow(occurrences: readonly EventOccurrence[], dates: readonly PlainDate[] | VisibleRange, capacityInput?: number): WeekLayout {
  checkOccurrences('layoutRow', 'occurrences', occurrences)
  const row = toDates('layoutRow', 'dates', dates)
  const capacity = checkCapacity('layoutRow', 'capacity', capacityInput)

  return layoutChecked(occurrences, row, capacity)
}

function layoutChecked(occurrences: readonly EventOccurrence[], dates: readonly PlainDate[], capacity: number): WeekLayout {
  const placed = occurrences.map((o) => columnsOf(o, dates)).filter((c): c is Candidate => c !== null).sort(order)
  const busy: boolean[][] = []
  const lanes: EventSegment[][] = []
  const more = dates.map(() => 0)
  const rowKey = dates[0] ?? ''
  for (const c of placed) {
    const lane = freeLane(busy, c.startColumn, c.endColumn)
    for (let col = c.startColumn; col <= c.endColumn; col++) (busy[lane] as boolean[])[col] = true
    if (lane >= capacity) {
      for (let col = c.startColumn; col <= c.endColumn; col++) more[col] = (more[col] as number) + 1
      continue
    }
    const segment: EventSegment = { key: `${c.o.key}@${rowKey}`, occurrenceKey: c.o.key, startColumn: c.startColumn, endColumn: c.endColumn, lane, continuesBefore: c.continuesBefore, continuesAfter: c.continuesAfter }
    ;(lanes[lane] ??= []).push(segment)
  }
  for (let i = 0; i < Math.min(busy.length, Number.isFinite(capacity) ? capacity : busy.length); i++) lanes[i] ??= []

  return { dates, lanes, more }
}

/** The rows of a month grid (or any rows of dates), laid out. Each occurrence is placed in every row it touches. */
export function layoutMonth(occurrences: readonly EventOccurrence[], rowsInput: readonly (readonly PlainDate[])[] | VisibleRange, capacityInput?: number | { capacity?: number }): WeekLayout[] {
  checkOccurrences('layoutMonth', 'occurrences', occurrences)
  const rows = toRows('layoutMonth', 'rows', rowsInput)
  if (typeof capacityInput === 'object' && capacityInput !== null && Array.isArray(capacityInput)) bad('layoutMonth', 'the third argument', 'a number of lanes or { capacity }', capacityInput)
  const capacity = checkCapacity('layoutMonth', 'capacity', typeof capacityInput === 'object' && capacityInput !== null ? capacityInput.capacity : capacityInput)
  void isShown

  return rows.map((row) => {
    const first = row[0]
    const last = row.at(-1)
    const touching = occurrences.filter((o) => {
      const span = spanOf(o)

      return first !== undefined && last !== undefined && span.first <= last && span.last >= first
    })

    return layoutChecked(touching, row, capacity)
  })
}
