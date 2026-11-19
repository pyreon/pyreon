import { add, isPlainDate, isPlainDateTime, isTimeZone, toInstant, toPlainDateTime } from '@pyreon/time/core'
import { bad } from './check'
import type { CalendarEvent, EventTime, Instant, PlainDate, PlainDateTime, TimeZone } from './types'

export const DAY_MS = 86_400_000

const fail = (message: string, fn = 'expandOccurrences'): never => {
  throw new Error(`[Pyreon] ${fn}: ${message}`)
}

const label = (event: { id?: unknown }): string => `event ${JSON.stringify(event.id)}`

/**
 * The end of an all-day event on `date`: the next day, or `days` days later. Events end exclusively, so a one-day event on
 * the 18th ends on the 19th.
 *
 * @example allDay('2026-11-18').end // => '2026-11-19'
 * @example allDay('2026-11-18', 3).end // => '2026-11-21'
 */
export function allDay(date: PlainDate, days = 1): { start: PlainDate; end: PlainDate; allDay: true } {
  if (!isPlainDate(date)) return bad('allDay', 'date', 'a date like "2026-11-18"', date)
  if (!Number.isInteger(days) || days < 1) return bad('allDay', 'days', 'a whole number of at least 1', days)

  return { start: date, end: add(date, { days }), allDay: true }
}

export type TimeKind = 'date' | 'datetime' | 'instant'

export function kindOf(value: unknown): TimeKind | null {
  if (typeof value === 'number' && Number.isFinite(value)) return 'instant'
  if (isPlainDate(value)) return 'date'
  if (isPlainDateTime(value)) return 'datetime'

  return null
}

/** What an event is, checked: all-day or timed, with its two points in a common shape. Throws a `[Pyreon]` error for a malformed event. */
export interface Checked {
  allDay: boolean
  zone: TimeZone | undefined
}

export function checkEvent(event: CalendarEvent): Checked {
  if (typeof event !== 'object' || event === null) return fail(`an event must be an object, got ${String(event)}`)
  if (typeof event.id !== 'string' || event.id === '') return fail(`an event needs a non-empty string id, got ${JSON.stringify(event.id)}`)
  if (typeof event.title !== 'string') return fail(`${label(event)} needs a string title`)
  const from = kindOf(event.start)
  const to = kindOf(event.end)
  if (from === null || to === null) return fail(`${label(event)} needs a start and an end that are dates ("2026-11-18"), date-times ("2026-11-18T14:00") or instants (milliseconds): got ${JSON.stringify(event.start)} and ${JSON.stringify(event.end)}`)
  if ((from === 'date') !== (to === 'date')) return fail(`${label(event)} mixes a date and a time: start ${JSON.stringify(event.start)}, end ${JSON.stringify(event.end)}. Use two dates for an all-day event.`)
  const isAllDay = from === 'date'
  if (event.allDay === true && !isAllDay) return fail(`${label(event)} is marked allDay but its start and end are not dates`)
  if (event.allDay === false && isAllDay) return fail(`${label(event)} has dates for a start and an end, which makes it an all-day event, but allDay is false`)
  if (event.timeZone !== undefined && !isTimeZone(event.timeZone)) return fail(`${label(event)} has an unknown timeZone ${JSON.stringify(event.timeZone)}`)

  return { allDay: isAllDay, zone: event.timeZone }
}

/** Order two all-day dates or two wall values of the same shape. */
const wallBefore = (a: string, b: string): boolean => a < b

/**
 * A point as a wall-clock string in `wallZone`, and as an instant. An instant is read in `wallZone`; a wall value is placed in
 * it (a time in a gap moves forward, a time in an overlap takes the first).
 */
export function resolvePoint(value: EventTime, wallZone: TimeZone): { wall: PlainDateTime; ms: Instant } {
  if (typeof value === 'number') return { wall: toPlainDateTime(value, wallZone), ms: value }

  return { wall: value as PlainDateTime, ms: toInstant(value as PlainDateTime, wallZone) }
}

/** The end must not come before the start. Equal is fine for a timed event (an instant); an all-day event equal is one day. */
export function checkOrder(event: CalendarEvent, allDayEvent: boolean, wallZone: TimeZone): void {
  const a = resolvePoint(event.start, wallZone)
  const b = resolvePoint(event.end, wallZone)
  const before = allDayEvent ? wallBefore(event.end as string, event.start as string) : b.ms < a.ms
  if (before) fail(`${label(event)} ends before it starts (${String(event.start)} to ${String(event.end)})`)
}

export function dateOf(value: PlainDate | PlainDateTime): PlainDate {
  return (value.length === 10 ? value : value.slice(0, 10)) as PlainDate
}
