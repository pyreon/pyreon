import { add, toInstant, toPlainDate, toPlainDateTime } from '@pyreon/time/core'
import { bad } from './check'
import { expandOccurrences } from './expand'
import type { CalendarEvent, EventOccurrence, EventOverrideValue, EventTime, PlainDate, PlainDateTime, TimeZone } from './types'

/** Which occurrences of a recurring event a change applies to. */
export type EditScope = 'this' | 'following' | 'all'

/** What the calendar proposes: the app decides (return `false`, throw or reject to refuse it). */
export interface EventChange<Meta = unknown> {
  event: CalendarEvent<Meta>
  /** The original start of the occurrence that was moved or resized (the key of an override): only for a recurring event. */
  occurrence?: string
  /** The new start and end, in the form the event uses (a date, a wall-clock date-time in its zone, or an instant). End is exclusive. */
  start: EventTime
  end: EventTime
  allDay: boolean
  resourceId?: string
  /** For a recurring event: what the user chose. */
  scope?: EditScope
}

export interface Target {
  start: PlainDate | PlainDateTime
  end: PlainDate | PlainDateTime
  allDay: boolean
}

const wallMs = (value: string): number => toInstant(value as PlainDate | PlainDateTime, 'UTC')
const fromWallMs = (ms: number, allDay: boolean): PlainDate | PlainDateTime => (allDay ? toPlainDate(ms, 'UTC') : toPlainDateTime(ms, 'UTC'))

/** Round `value` to a multiple of `step` (minutes). */
export function snapTo(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value
}

/** The new start and end of an occurrence, in the form its event uses. Moving between all-day and timed changes the shape. */
export function reposition(occurrence: EventOccurrence, target: Target, zone: TimeZone): { start: EventTime; end: EventTime; allDay: boolean } {
  if (target.allDay) return { start: target.start.slice(0, 10) as PlainDate, end: target.end.slice(0, 10) as PlainDate, allDay: true }
  const wallZone = occurrence.event.timeZone ?? zone
  const startMs = toInstant(target.start as PlainDateTime, zone)
  const endMs = toInstant(target.end as PlainDateTime, zone)
  if (typeof occurrence.event.start === 'number') return { start: startMs, end: endMs, allDay: false }

  return { start: toPlainDateTime(startMs, wallZone), end: toPlainDateTime(endMs, wallZone), allDay: false }
}

/** The wall clock of an event time in the event's own zone (`zone` when floating). */
function wallOf(value: EventTime, wallZone: TimeZone): PlainDate | PlainDateTime {
  return typeof value === 'number' ? toPlainDateTime(value, wallZone) : value
}

function shiftOverrides(overrides: CalendarEvent['overrides'], deltaMs: number, allDay: boolean, from?: string): Record<string, EventOverrideValue> | undefined {
  if (overrides === undefined) return undefined
  const out: Record<string, EventOverrideValue> = {}
  for (const [key, value] of Object.entries(overrides)) {
    if (from !== undefined && key < from) continue
    out[from === undefined && deltaMs === 0 ? key : fromWallMs(wallMs(key) + deltaMs, allDay)] = value
  }

  return out
}

function single<Meta>(event: CalendarEvent<Meta>, change: EventChange<Meta>): CalendarEvent<Meta>[] {
  const next: CalendarEvent<Meta> = { ...event, start: change.start, end: change.end }
  if (change.allDay) next.allDay = true
  else if (event.allDay === true) next.allDay = false

  return [next]
}

function thisOne<Meta>(event: CalendarEvent<Meta>, change: EventChange<Meta>): CalendarEvent<Meta>[] {
  if (change.allDay !== (typeof event.start === 'string' && event.start.length === 10)) bad('applyEventChange', 'change', 'a change that keeps the occurrence all-day or timed like its event (a single occurrence cannot switch)', change.allDay ? 'an all-day change for a timed event' : 'a timed change for an all-day event')

  return [{ ...event, overrides: { ...event.overrides, [change.occurrence as string]: { start: change.start, end: change.end } } }]
}

function allOfThem<Meta>(event: CalendarEvent<Meta>, change: EventChange<Meta>, wallZone: TimeZone): CalendarEvent<Meta>[] {
  const allDay = change.allDay
  const occurrence = change.occurrence as string
  const newStart = wallOf(change.start, wallZone)
  const delta = wallMs(newStart) - wallMs(occurrence)
  const duration = wallMs(wallOf(change.end, wallZone)) - wallMs(newStart)
  const masterStart = fromWallMs(wallMs(wallOf(event.start, wallZone)) + delta, allDay)
  const masterEnd = fromWallMs(wallMs(masterStart) + duration, allDay)
  const asKind = (wall: PlainDate | PlainDateTime): EventTime => (typeof event.start === 'number' ? toInstant(wall as PlainDateTime, wallZone) : wall)
  const overrides = shiftOverrides(event.overrides, delta, allDay)
  const next: CalendarEvent<Meta> = { ...event, start: asKind(masterStart), end: asKind(masterEnd), recurrence: { ...(event.recurrence as NonNullable<CalendarEvent['recurrence']>), start: masterStart } }
  if (overrides !== undefined) next.overrides = overrides

  return [next]
}

function following<Meta>(event: CalendarEvent<Meta>, change: EventChange<Meta>, wallZone: TimeZone, zone: TimeZone): CalendarEvent<Meta>[] {
  const rule = event.recurrence as NonNullable<CalendarEvent['recurrence']>
  const occurrence = change.occurrence as string
  const startWall = wallOf(event.start, wallZone)
  if (occurrence.slice(0, 10) <= startWall.slice(0, 10)) return allOfThem(event, change, wallZone)
  const allDay = change.allDay
  const delta = wallMs(wallOf(change.start, wallZone)) - wallMs(occurrence)
  const newStart = wallOf(change.start, wallZone)
  const duration = wallMs(wallOf(change.end, wallZone)) - wallMs(newStart)
  const before = add(occurrence.slice(0, 10) as PlainDate, { days: -1 })
  const ended: CalendarEvent<Meta> = { ...event, recurrence: { ...rule } }
  delete (ended.recurrence as { count?: number }).count
  ;(ended.recurrence as { until?: unknown }).until = before
  const kept = Object.fromEntries(Object.entries(event.overrides ?? {}).filter(([key]) => key < occurrence))
  if (Object.keys(kept).length > 0) ended.overrides = kept
  else delete ended.overrides
  const done = rule.count === undefined ? 0 : expandOccurrences([{ ...event, recurrence: { ...rule, start: startWall } } as CalendarEvent], { start: startWall.slice(0, 10) as PlainDate, end: occurrence.slice(0, 10) as PlainDate }, zone).filter((o) => o.occurrence < occurrence).length
  const moved = shiftOverrides(event.overrides, delta, allDay, occurrence)
  const createdRule: NonNullable<CalendarEvent['recurrence']> = { ...rule, start: newStart }
  if (rule.count !== undefined) createdRule.count = Math.max(1, rule.count - done)
  const asKind = (wall: PlainDate | PlainDateTime): EventTime => (typeof event.start === 'number' ? toInstant(wall as PlainDateTime, wallZone) : wall)
  const created: CalendarEvent<Meta> = { ...event, id: `${event.id}~${occurrence}`, start: asKind(newStart), end: asKind(fromWallMs(wallMs(newStart) + duration, allDay)), recurrence: createdRule }
  delete created.overrides
  if (moved !== undefined && Object.keys(moved).length > 0) created.overrides = moved

  return [ended, created]
}

/**
 * The events to store after a change: plain data, ready to persist. A single event is moved. For a recurring event the scope
 * decides: `'this'` adds an override for that occurrence (`overrides[occurrence] = { start, end }`); `'all'` moves the whole
 * series (the start of the event and of its rule shift by the same wall-clock amount, and so do the keys of its overrides);
 * `'following'` ends the series the day before the occurrence (`recurrence.until`) and returns a second event, with the id
 * `<id>~<occurrence>`, that carries on from the new start (with the remaining `count` and the later overrides). Replace the
 * original event with the returned list. Expanding the result with `expandOccurrences` shows the edit.
 */
export function applyEventChange<Meta>(event: CalendarEvent<Meta>, change: EventChange<Meta>, zone: TimeZone = 'UTC'): CalendarEvent<Meta>[] {
  if (event.recurrence === undefined || change.occurrence === undefined) return single(event, change)
  const scope = change.scope ?? 'this'
  const wallZone = event.timeZone ?? zone
  if (scope === 'this') return thisOne(event, change)
  if (scope === 'all') return allOfThem(event, change, wallZone)

  return following(event, change, wallZone, zone)
}

/** Does a candidate range fit the working hours of the days it touches? Windows are `{ from, to }` fractions in minutes per day. */
export function fitsWindows(start: PlainDate | PlainDateTime, end: PlainDate | PlainDateTime, windowsOf: (date: PlainDate) => readonly { from: number; to: number }[] | null): boolean {
  if (start.length === 10) return true
  const first = start.slice(0, 10) as PlainDate
  const last = (end.slice(11) === '00:00' ? add(end.slice(0, 10) as PlainDate, { days: -1 }) : end.slice(0, 10)) as PlainDate
  for (let d = first; d <= last; d = add(d, { days: 1 })) {
    const windows = windowsOf(d)
    if (windows === null) return true
    const from = d === first ? Number(start.slice(11, 13)) * 60 + Number(start.slice(14, 16)) : 0
    const to = d === last ? (end.slice(11) === '00:00' ? 1440 : Number(end.slice(11, 13)) * 60 + Number(end.slice(14, 16))) : 1440
    if (!windows.some((w) => w.from <= from && w.to >= to)) return false
  }

  return true
}

