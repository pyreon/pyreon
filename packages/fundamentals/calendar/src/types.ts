import type { Instant, PlainDate, PlainDateTime, TimeZone, Weekday } from '@pyreon/time/core'
import type { Interval, Recurrence } from '@pyreon/schedule/core'

export type { Instant, Interval, PlainDate, PlainDateTime, Recurrence, TimeZone, Weekday }

/** A point of an event: a date (all-day), a wall-clock date-time (floating, or in the event's own `timeZone`), or an instant. */
export type EventTime = PlainDate | PlainDateTime | Instant

/** What one occurrence of a recurring event is changed to, or that it is cancelled. Keyed by the occurrence's original start. */
export type EventOverrideValue = Partial<{ start: EventTime; end: EventTime; title: string; resourceId: string | readonly string[] }> | { cancelled: true }

/**
 * An event, as plain JSON-safe data. The app owns it; the calendar never changes it.
 *
 * - `PlainDate` start and end make an all-day event; `end` is exclusive (one day: the next date; see `allDay`).
 * - `PlainDateTime` is a wall clock: in `timeZone` when given ("9:00 in Prague"), else floating in the display zone.
 * - An `Instant` is shown in the display zone.
 */
export interface CalendarEvent<Meta = unknown> {
  id: string
  title: string
  start: EventTime
  end: EventTime
  allDay?: boolean
  timeZone?: TimeZone
  recurrence?: Recurrence
  /** Per occurrence, keyed by the original start of the occurrence (`'2026-11-18T09:00'`, or `'2026-11-18'` for an all-day event). */
  overrides?: Record<string, EventOverrideValue>
  resourceId?: string | readonly string[]
  editable?: boolean | { move?: boolean; resize?: boolean }
  color?: string
  meta?: Meta
}

/** One occurrence of an event, placed in the display zone. */
export interface EventOccurrence<Meta = unknown> {
  /** `"<id>:<occurrence>"`: the same occurrence has the same key whatever the window, so a view can key by it. */
  key: string
  event: CalendarEvent<Meta>
  /** The original start of this occurrence (the key of an override): a date for an all-day event, else a date-time. */
  occurrence: string
  title: string
  allDay: boolean
  /** Start in the display zone: a date for an all-day event, else a date-time. */
  start: PlainDate | PlainDateTime
  /** Exclusive end in the display zone. */
  end: PlainDate | PlainDateTime
  /** Start and end as instants (all-day: midnight of the dates in the display zone). */
  startMs: Instant
  endMs: Instant
  recurring: boolean
  /** The resources of this occurrence when an override gave it others than its event's (`overrides[key].resourceId`). */
  resourceIds?: readonly string[]
}

/** A piece of an occurrence in a row of days (a month week, or the all-day row of a time grid). */
export interface EventSegment {
  key: string
  /** The `EventOccurrence.key` it belongs to. */
  occurrenceKey: string
  /** First and last column (inclusive) of the row, counting the visible days only. */
  startColumn: number
  endColumn: number
  /** 0 is the top lane. */
  lane: number
  /** The occurrence started before this row's first day / goes on after its last day. */
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface WeekLayout {
  /** The visible dates of the row. */
  dates: readonly PlainDate[]
  /** Segments by lane (lane 0 first), within `capacity` when one was given. */
  lanes: readonly (readonly EventSegment[])[]
  /** Per column, how many segments touching the day are hidden by `capacity`. */
  more: readonly number[]
}

/** One block of a time grid column. Positions are fractions (0 to 1) of the visible day. */
export interface TimedBlock {
  key: string
  occurrenceKey: string
  /** 0 to 1 from the top of the visible day. */
  top: number
  height: number
  /** Column within the group of overlapping blocks, the number of columns of the group, and how many it spans. */
  column: number
  columns: number
  span: number
  /** `column / columns` and `span / columns`: the left edge and width as fractions of the day column. */
  left: number
  width: number
  /** The wall-clock minute (from midnight) it starts and ends at on this day, before the minimum height. */
  startMinute: number
  endMinute: number
  /** The occurrence started on an earlier day / goes on after this day / is cut by `dayStart` or `dayEnd`. */
  continuesBefore: boolean
  continuesAfter: boolean
}
