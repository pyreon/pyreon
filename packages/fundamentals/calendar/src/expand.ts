import { expandEvents } from '@pyreon/schedule/core'
import type { CalendarEvent as ScheduleEvent, EventOverride } from '@pyreon/schedule/core'
import { add, toInstant, toPlainDate, toPlainDateTime } from '@pyreon/time/core'
import type { PlainDate, PlainDateTime } from '@pyreon/time/core'
import { bad, checkZone, toRange } from './check'
import { checkEvent, checkOrder, DAY_MS, resolvePoint } from './model'
import type { VisibleRange } from './views'
import type { CalendarEvent, EventOccurrence, EventOverrideValue, EventTime, Instant, Interval, TimeZone } from './types'

type Wall = PlainDate | PlainDateTime

/** The wall-clock string of a point of an event, in the zone its wall clock is in. */
function wallOf(value: EventTime, allDayEvent: boolean, wallZone: TimeZone): Wall {
  if (allDayEvent) return value as PlainDate

  return resolvePoint(value, wallZone).wall
}

/** An override key (an original start) as the number `expandEvents` identifies an occurrence by. */
function occurrenceNumber(key: string): number {
  return toInstant(key as PlainDate | PlainDateTime, 'UTC')
}

function overrideFor(key: string, value: EventOverrideValue, allDayEvent: boolean, wallZone: TimeZone): EventOverride<Wall> {
  const occurrence = occurrenceNumber(key)
  if ('cancelled' in value) return { occurrence, cancelled: true }
  const out: EventOverride<Wall> = { occurrence }
  if (value.start !== undefined) out.start = wallOf(value.start, allDayEvent, wallZone)
  if (value.end !== undefined) out.end = wallOf(value.end, allDayEvent, wallZone)

  return out
}

/**
 * The overrides `expandEvents` has to know about: cancellations and moves. An override that only renames an occurrence is left
 * out, because `expandEvents` drops an instance whose override has neither a start nor an end; `place` reads its title.
 */
function overridesOf(event: CalendarEvent, allDayEvent: boolean, wallZone: TimeZone): EventOverride<Wall>[] {
  return Object.entries(event.overrides ?? {})
    .filter(([, value]) => 'cancelled' in value || value.start !== undefined || value.end !== undefined)
    .map(([key, value]) => overrideFor(key, value, allDayEvent, wallZone))
}

interface Placed {
  occurrence: string
  title: string
  start: Wall
  end: Wall
  recurring: boolean
}

/** One occurrence, or the occurrences of a recurring event, in the event's own wall clock, around `window`. */
function place(event: CalendarEvent, allDayEvent: boolean, wallZone: TimeZone, window: Interval<Wall>): Placed[] {
  const start = wallOf(event.start, allDayEvent, wallZone)
  const end = wallOf(event.end, allDayEvent, wallZone)
  // An instant keeps its own number as its key, so the key survives a change of the display zone.
  if (event.recurrence === undefined) return [{ occurrence: typeof event.start === 'number' ? String(event.start) : start, title: event.title, start, end, recurring: false }]
  const scheduled: ScheduleEvent<Wall> = { id: event.id, start, end, rule: { ...event.recurrence, start }, overrides: overridesOf(event, allDayEvent, wallZone) }

  return expandEvents([scheduled], window).map((instance) => {
    const occurrence = allDayEvent ? toPlainDate(instance.occurrence, 'UTC') : toPlainDateTime(instance.occurrence, 'UTC')
    const title = (event.overrides?.[occurrence] as { title?: string } | undefined)?.title ?? event.title

    return { occurrence, title, start: instance.start, end: instance.end, recurring: true }
  })
}

/** The window of a view in an event's wall clock, with a day of margin each side (the zones differ, and so does the DST offset). */
function windowIn(range: Interval<PlainDate>, zone: TimeZone, wallZone: TimeZone, allDayEvent: boolean): Interval<Wall> {
  if (allDayEvent) return { start: range.start, end: range.end }
  const from = toInstant(range.start, zone) - DAY_MS
  const to = toInstant(range.end, zone) + DAY_MS

  return { start: toPlainDateTime(from, wallZone), end: toPlainDateTime(to, wallZone) }
}

function toOccurrence(event: CalendarEvent, placed: Placed, allDayEvent: boolean, wallZone: TimeZone, zone: TimeZone): EventOccurrence {
  const moved = (event.overrides?.[placed.occurrence] as { resourceId?: string | readonly string[] } | undefined)?.resourceId
  const base = { key: `${event.id}:${placed.occurrence}`, event, occurrence: placed.occurrence, title: placed.title, allDay: allDayEvent, recurring: placed.recurring, ...(moved === undefined ? {} : { resourceIds: typeof moved === 'string' ? [moved] : moved }) }
  if (allDayEvent) {
    const end = placed.end <= placed.start ? add(placed.start as PlainDate, { days: 1 }) : (placed.end as PlainDate)

    return { ...base, start: placed.start as PlainDate, end, startMs: toInstant(placed.start as PlainDate, zone), endMs: toInstant(end, zone) }
  }
  const startMs = resolvePoint(placed.start, wallZone).ms
  const endMs = resolvePoint(placed.end, wallZone).ms

  return { ...base, start: toPlainDateTime(startMs, zone), end: toPlainDateTime(endMs, zone), startMs, endMs }
}

function overlaps(o: EventOccurrence, from: Instant, to: Instant): boolean {
  return o.startMs < to && (o.endMs > from || (o.endMs === o.startMs && o.startMs >= from))
}

/** Occurrences later in the list that share a key get a numbered key, so a view can still key its rows. */
function disambiguate(list: EventOccurrence[]): EventOccurrence[] {
  const seen = new Map<string, number>()

  return list.map((o) => {
    const n = (seen.get(o.key) ?? 0) + 1
    seen.set(o.key, n)

    return n === 1 ? o : { ...o, key: `${o.key}~${n}` }
  })
}

function byStart(a: EventOccurrence, b: EventOccurrence): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs
  if (a.endMs !== b.endMs) return b.endMs - a.endMs

  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

/**
 * The occurrences of `events` that fall in `range` (a half-open window of dates in the display zone), placed in that zone and
 * sorted by start (longer first among equal starts, then by key). Single and recurring events (through `@pyreon/schedule`'s
 * `expandEvents`, with `overrides` and cancellations), events in their own zone, floating wall clocks and instants are
 * handled; an all-day event never moves with the zone. Malformed events throw a `[Pyreon] expandOccurrences:` error that names them; so does a window or a zone of the wrong shape. `range` may be the whole result of `visibleRange()`.
 *
 * @example expandOccurrences([{ id: 'a', title: 'A', start: '2026-11-18', end: '2026-11-19' }], { start: '2026-11-16', end: '2026-11-23' }, 'UTC').map((o) => o.key) // => ['a:2026-11-18']
 */
export function expandOccurrences<Meta>(events: readonly CalendarEvent<Meta>[], range: Interval<PlainDate> | VisibleRange, zone: TimeZone): EventOccurrence<Meta>[] {
  if (!Array.isArray(events)) bad('expandOccurrences', 'events', 'an array of events { id, title, start, end }', events)
  const window = toRange('expandOccurrences', 'range', range)
  checkZone('expandOccurrences', 'zone', zone)

  return expandChecked(events, window, zone)
}

function expandChecked<Meta>(events: readonly CalendarEvent<Meta>[], range: Interval<PlainDate>, zone: TimeZone): EventOccurrence<Meta>[] {
  const from = toInstant(range.start, zone)
  const to = toInstant(range.end, zone)
  const out: EventOccurrence[] = []
  for (const event of events) {
    const { allDay: allDayEvent, zone: own } = checkEvent(event as CalendarEvent)
    const wallZone = own ?? zone
    checkOrder(event as CalendarEvent, allDayEvent, wallZone)
    for (const placed of place(event as CalendarEvent, allDayEvent, wallZone, windowIn(range, zone, wallZone, allDayEvent))) {
      const occurrence = toOccurrence(event as CalendarEvent, placed, allDayEvent, wallZone, zone)
      if (overlaps(occurrence, from, to)) out.push(occurrence)
    }
  }
  out.sort(byStart)

  return disambiguate(out) as EventOccurrence<Meta>[]
}
