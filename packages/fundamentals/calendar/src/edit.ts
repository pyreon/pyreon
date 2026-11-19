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
  /** The resource the event is now on, and the one it was on (the row it was dragged from): only when a resource is involved. */
  resourceId?: string
  fromResourceId?: string
  /** For a recurring event: what the user chose. */
  scope?: EditScope
}

export interface Target {
  start: PlainDate | PlainDateTime
  end: PlainDate | PlainDateTime
  allDay: boolean
  /** In the timeline: the row the event lands on, and the row it came from. */
  resourceId?: string
  fromResourceId?: string
}

/** The `resourceId` of an event after moving it from one resource to another (an event on several resources keeps the others). */
export function movedResource(current: string | readonly string[] | undefined, from: string | undefined, to: string): string | string[] {
  if (current === undefined || typeof current === 'string' || from === undefined) return typeof current === 'object' && from === undefined ? [...current, to] : to
  const next = current.map((id) => (id === from ? to : id))

  return [...new Set(next)]
}

function withResource<Meta>(event: CalendarEvent<Meta>, change: EventChange<Meta>): CalendarEvent<Meta> {
  if (change.resourceId === undefined) return event

  return { ...event, resourceId: movedResource(event.resourceId, change.fromResourceId, change.resourceId) }
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
  const next: CalendarEvent<Meta> = { ...withResource(event, change), start: change.start, end: change.end }
  if (change.allDay) next.allDay = true
  else if (event.allDay === true) next.allDay = false

  return [next]
}

function thisOne<Meta>(event: CalendarEvent<Meta>, change: EventChange<Meta>): CalendarEvent<Meta>[] {
  if (change.allDay !== (typeof event.start === 'string' && event.start.length === 10)) bad('applyEventChange', 'change', 'a change that keeps the occurrence all-day or timed like its event (a single occurrence cannot switch)', change.allDay ? 'an all-day change for a timed event' : 'a timed change for an all-day event')

  const key = change.occurrence as string
  const own = event.overrides?.[key] as { resourceId?: string | readonly string[] } | undefined
  // the resource of this one occurrence is kept in the override (the calendar's own field; `@pyreon/schedule` only sees start, end and cancelled)
  const resource = change.resourceId === undefined ? {} : { resourceId: movedResource(own?.resourceId ?? event.resourceId, change.fromResourceId, change.resourceId) }

  return [{ ...event, overrides: { ...event.overrides, [key]: { ...own, start: change.start, end: change.end, ...resource } } }]
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
  const next: CalendarEvent<Meta> = { ...withResource(event, change), start: asKind(masterStart), end: asKind(masterEnd), recurrence: { ...(event.recurrence as NonNullable<CalendarEvent['recurrence']>), start: masterStart } }
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
  const withMoved = withResource(event, change)
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
  const created: CalendarEvent<Meta> = { ...withMoved, id: `${event.id}~${occurrence}`, start: asKind(newStart), end: asKind(fromWallMs(wallMs(newStart) + duration, allDay)), recurrence: createdRule }
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
    const endMinute = end.slice(11) === '00:00' ? 1440 : Number(end.slice(11, 13)) * 60 + Number(end.slice(14, 16))
    const to = d === last ? endMinute : 1440
    if (!windows.some((w) => w.from <= from && w.to >= to)) return false
  }

  return true
}


/** Where the pointer is: a day, and a minute of it in a time grid (`null` over a day cell or the all-day row). */
export interface Hit {
  date: PlainDate
  minute: number | null
}

const MINUTE = 60_000
const DAY_MINUTES = 1440
const minutesOf = (value: string): number => Math.floor(wallMs(value) / MINUTE)
const fromMinutes = (minutes: number, allDay: boolean): PlainDate | PlainDateTime => fromWallMs(minutes * MINUTE, allDay)
const dayOf = (date: string): number => Math.floor(wallMs(date.slice(0, 10)) / (DAY_MINUTES * MINUTE))
const absolute = (hit: Hit): number => dayOf(hit.date) * DAY_MINUTES + (hit.minute ?? 0)
const plusDays = (value: PlainDate | PlainDateTime, days: number): PlainDate | PlainDateTime => fromMinutes(minutesOf(value) + days * DAY_MINUTES, value.length === 10)

function shifted(o: EventOccurrence, days: number): Target {
  return { start: plusDays(o.start, days), end: plusDays(o.end, days), allDay: o.allDay }
}

/**
 * The target of moving an occurrence: where the pointer is now (`hit`) against where it took hold (`grab`). Over the time grid
 * the start snaps to `snap` minutes and the duration is kept; over a day cell or the all-day row only the day changes (a timed
 * event keeps its time of day); dragging a timed event onto the all-day row makes it all-day, and an all-day event dropped on a
 * slot becomes `defaultMinutes` long from there.
 */
export function moveTarget(o: EventOccurrence, hit: Hit, grab: Hit, snap: number, defaultMinutes = 60): Target {
  const dayDelta = dayOf(hit.date) - dayOf(grab.date)
  if (hit.minute === null) {
    if (o.allDay || grab.minute === null) return shifted(o, dayDelta)

    return { start: hit.date, end: add(hit.date, { days: 1 }), allDay: true }
  }
  if (o.allDay) {
    const start = snapTo(hit.minute, snap)

    return { start: fromMinutes(dayOf(hit.date) * DAY_MINUTES + start, false) as PlainDateTime, end: fromMinutes(dayOf(hit.date) * DAY_MINUTES + start + defaultMinutes, false) as PlainDateTime, allDay: false }
  }
  const startM = minutesOf(o.start)
  const duration = minutesOf(o.end) - startM
  const next = snapTo(startM + absolute(hit) - absolute(grab), snap)

  return { start: fromMinutes(next, false), end: fromMinutes(next + duration, false), allDay: false }
}

/** The target of dragging one edge of an occurrence to the pointer: snapped, and never shorter than `minDuration` minutes (a day for dates). */
export function resizeTarget(o: EventOccurrence, edge: 'start' | 'end', hit: Hit, snap: number, minDuration: number): Target {
  const startM = minutesOf(o.start)
  const endM = minutesOf(o.end)
  if (hit.minute === null || o.allDay) {
    const days = dayOf(hit.date)
    if (o.allDay) {
      const first = dayOf(o.start)
      const last = dayOf(o.end)

      return edge === 'end' ? { start: o.start, end: fromMinutes(Math.max(days + 1, first + 1) * DAY_MINUTES, true), allDay: true } : { start: fromMinutes(Math.min(days, last - 1) * DAY_MINUTES, true), end: o.end, allDay: true }
    }
    const timeOf = edge === 'end' ? endM % DAY_MINUTES : startM % DAY_MINUTES
    const moved = days * DAY_MINUTES + timeOf

    return edge === 'end' ? { start: o.start, end: fromMinutes(Math.max(moved, startM + minDuration), false), allDay: false } : { start: fromMinutes(Math.min(moved, endM - minDuration), false), end: o.end, allDay: false }
  }
  const at = snapTo(absolute(hit), snap)

  return edge === 'end' ? { start: o.start, end: fromMinutes(Math.max(at, startM + minDuration), false), allDay: false } : { start: fromMinutes(Math.min(at, endM - minDuration), false), end: o.end, allDay: false }
}

/** The arrow keys as [sideways, vertical] steps. */
const ARROWS: Record<string, readonly [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** The key part of the keyboard: what an arrow does to a grabbed occurrence (`null` for a key that does nothing). Shift resizes the end. */
export interface NudgeOptions {
  shift?: boolean
  grid: 'month' | 'time'
  snap: number
  minDuration: number
  rtl?: boolean
}

export function nudgeTarget(o: EventOccurrence, key: string, options: NudgeOptions): Target | null {
  const { shift = false, grid, snap, minDuration, rtl = false } = options
  const sideways = (ARROWS[key]?.[0] ?? 0) * (rtl ? -1 : 1)
  const vertical = ARROWS[key]?.[1] ?? 0
  if (sideways === 0 && vertical === 0) return null
  const timed = grid === 'time' && !o.allDay
  // minutes for a slot-by-slot move in the time grid, else days (up and down is a week in the month)
  const rows = timed ? vertical * snap : vertical * (grid === 'month' || o.allDay ? 7 : 0) * DAY_MINUTES
  const move = shift ? resizeBy : moveBy

  return move(o, { timed, sideways, rows, minDuration })
}

interface Step {
  timed: boolean
  sideways: number
  rows: number
  minDuration: number
}

/** An arrow without Shift: the whole occurrence by a slot (time grid) or by days. */
function moveBy(o: EventOccurrence, step: Step): Target | null {
  if (step.timed && step.sideways === 0) return { start: fromMinutes(minutesOf(o.start) + step.rows, false), end: fromMinutes(minutesOf(o.end) + step.rows, false), allDay: false }
  const days = step.sideways + (step.timed ? 0 : step.rows / DAY_MINUTES)

  return days === 0 ? null : shifted(o, days)
}

/** An arrow with Shift: the end, by a slot (time grid) or by days, never before the start plus the minimum. */
function resizeBy(o: EventOccurrence, step: Step): Target | null {
  if (o.allDay) {
    const days = step.sideways + step.rows / DAY_MINUTES

    return days === 0 ? null : { start: o.start, end: fromMinutes(Math.max(dayOf(o.end) + days, dayOf(o.start) + 1) * DAY_MINUTES, true), allDay: true }
  }
  const delta = step.timed ? step.rows : step.sideways * DAY_MINUTES

  return delta === 0 ? null : { start: o.start, end: fromMinutes(Math.max(minutesOf(o.end) + delta, minutesOf(o.start) + step.minDuration), false), allDay: false }
}
