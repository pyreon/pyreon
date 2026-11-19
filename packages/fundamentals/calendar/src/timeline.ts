import { bad } from './check'
import type { EventOccurrence, PlainDate } from './types'

/** A row of the timeline: a room, a person, a machine. */
export interface Resource {
  id: string
  title: string
}

/** One piece of an occurrence in a resource's row. Positions are fractions of the whole axis (the shown days side by side). */
export interface TimelineBlock {
  key: string
  occurrenceKey: string
  resourceId: string
  left: number
  width: number
  lane: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface TimelineRow {
  resource: Resource
  /** How many lanes the row needs (overlapping events stack): its height is `lanes` lanes. */
  lanes: number
  blocks: TimelineBlock[]
}

export interface TimelineOptions {
  /** The visible minutes of each day, as the time grid has them. */
  from: number
  to: number
  /** Rows for events without a resource, or with one that is not in `resources`: its title. Default none (such events are not drawn). */
  unassigned?: Resource
}

const minutesOf = (wall: string): number => Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16))

/** The resource ids of an event: its `resourceId` as a list. */
export const resourcesOf = (o: EventOccurrence): readonly string[] => {
  if (o.resourceIds !== undefined) return o.resourceIds
  const id = o.event.resourceId
  if (id === undefined) return []

  return typeof id === 'string' ? [id] : id
}

interface Span {
  o: EventOccurrence
  start: number
  end: number
  before: boolean
  after: boolean
}

interface Axis {
  index: Map<PlainDate, number>
  days: number
  from: number
  size: number
  firstDate: string
  lastDate: string
}

/** The position of a point on the axis: a day, and a minute of it (clipped to the visible hours). A day outside the axis is its edge. */
function position(axis: Axis, date: string, minute: number | null): number {
  const day = axis.index.get(date as PlainDate)
  if (day === undefined) return date < axis.firstDate ? 0 : axis.days * axis.size

  return day * axis.size + (minute === null ? 0 : Math.min(axis.size, Math.max(0, minute - axis.from)))
}

function spanOf(o: EventOccurrence, axis: Axis): Span | null {
  const startMinute = o.allDay ? null : minutesOf(o.start)
  const endMinute = o.allDay ? null : minutesOf(o.end)
  const start = position(axis, o.start.slice(0, 10), startMinute)
  const end = position(axis, o.end.slice(0, 10), endMinute)
  if (end <= start) return null

  return { o, start, end, before: o.start.slice(0, 10) < axis.firstDate, after: o.end.slice(0, 10) > axis.lastDate }
}

/** The axis of a timeline: the shown days side by side, each its visible minutes. */
function axisOf(dates: readonly PlainDate[], options: { from: number; to: number }): Axis {
  const size = options.to - options.from

  return { index: new Map<PlainDate, number>(dates.map((d, i) => [d, i])), days: dates.length, from: options.from, size, firstDate: dates[0] ?? '', lastDate: dates.at(-1) ?? '' }
}

function checkTimeline(fn: string, resources: unknown, dates: unknown, options: TimelineOptions): void {
  if (!Array.isArray(resources)) bad(fn, 'resources', 'an array of { id, title }', resources)
  if (!Array.isArray(dates)) bad(fn, 'dates', 'an array of dates', dates)
  if (typeof options !== 'object' || options === null || !(options.to > options.from)) bad(fn, 'options', '{ from, to } minutes with to after from', options)
}

/**
 * The occurrences of each row: an event is in the row of each of its resources that exists; an event with none (or none that
 * exists) is in the `unassigned` row when one is asked for, and nowhere otherwise.
 */
export function assignToRows(occurrences: readonly EventOccurrence[], resources: readonly Resource[], unassigned?: Resource): Map<string, EventOccurrence[]> {
  const rows = new Map<string, EventOccurrence[]>([...resources, ...(unassigned === undefined ? [] : [unassigned])].map((r) => [r.id, []]))
  for (const o of occurrences) {
    const ids = resourcesOf(o).filter((id) => rows.has(id))
    const targets = ids.length === 0 && unassigned !== undefined ? [unassigned.id] : ids
    for (const id of targets) rows.get(id)?.push(o)
  }

  return rows
}

/** One row of the timeline: the blocks of the occurrences given (they are the row's own), overlapping ones in lanes. */
export function layoutTimelineRow(occurrences: readonly EventOccurrence[], resource: Resource, dates: readonly PlainDate[], options: { from: number; to: number }): TimelineRow {
  const axis = axisOf(dates, options)
  const total = axis.days * axis.size
  const row: TimelineRow = { resource, lanes: 1, blocks: [] }
  const spans = occurrences.map((o) => spanOf(o, axis)).filter((x): x is Span => x !== null)
  spans.sort((x, y) => x.start - y.start || y.end - x.end || (x.o.key < y.o.key ? -1 : Number(x.o.key > y.o.key)))
  const ends: number[] = []
  for (const s of spans) {
    let lane = ends.findIndex((e) => e <= s.start)
    if (lane === -1) lane = ends.length
    ends[lane] = s.end
    row.blocks.push({ key: `${s.o.key}@${resource.id}`, occurrenceKey: s.o.key, resourceId: resource.id, left: s.start / total, width: (s.end - s.start) / total, lane, continuesBefore: s.before, continuesAfter: s.after })
  }
  row.lanes = Math.max(1, ends.length)

  return row
}

/**
 * Resources by time: one row per resource, the shown days side by side along the axis (each day is its visible hours), events
 * as blocks in the rows of their resources (an event with several resources is in each row), overlapping events in lanes. Pure,
 * and ordered totally, so the lanes do not depend on the order of the occurrences.
 */
export function layoutTimeline(occurrences: readonly EventOccurrence[], resources: readonly Resource[], dates: readonly PlainDate[], options: TimelineOptions): TimelineRow[] {
  checkTimeline('layoutTimeline', resources, dates, options)
  const rows = assignToRows(occurrences, resources, options.unassigned)

  return [...resources, ...(options.unassigned === undefined ? [] : [options.unassigned])].map((r) => layoutTimelineRow(rows.get(r.id) ?? [], r, dates, options))
}
