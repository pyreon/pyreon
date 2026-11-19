import { add, timeParts, toInstant, toPlainTime } from '@pyreon/time/core'
import type { Duration, PlainTime } from '@pyreon/time/core'
import { packColumns } from './columns'
import { layoutRow } from './lanes'
import type { EventOccurrence, Instant, PlainDate, TimedBlock, TimeZone, WeekLayout } from './types'

export interface TimeGridOptions {
  /** First visible time of each day. Default `'00:00'`. */
  dayStart?: PlainTime
  /** End of the visible day, exclusive; `'24:00'` is the end of the day. Default `'24:00'`. */
  dayEnd?: PlainTime | '24:00'
  /** The height of one row of the grid. Default 30 minutes. */
  slot?: Duration
  /** A block is drawn at least this many minutes tall, and a short event gets its own column for it. Default 15. */
  minBlockMinutes?: number
  /** Columns to keep for some blocks (key to column) while another is being dragged. */
  pinned?: ReadonlyMap<string, number>
}

export interface DayBounds {
  startMs: Instant
  endMs: Instant
  /** The real length of the day in minutes: 1440, except 1380 or 1500 on the day a zone changes its clock. */
  elapsedMinutes: number
}

/** The instants a calendar day starts and ends at in a zone. On the day a zone moves its clock the day is 23 or 25 hours. */
export function dayBounds(date: PlainDate, zone: TimeZone): DayBounds {
  const startMs = toInstant(date, zone)
  const endMs = toInstant(add(date, { days: 1 }), zone)

  return { startMs, endMs, elapsedMinutes: (endMs - startMs) / 60_000 }
}

/** The wall-clock minute (from midnight, with fractions) an instant shows at in a zone. */
export function wallMinute(ms: Instant, zone: TimeZone): number {
  const t = timeParts(toPlainTime(ms, zone))

  return t.hour * 60 + t.minute + t.second / 60 + t.millisecond / 60_000
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':')

  return Number(h) * 60 + Number(m)
}

/** The visible window of a day in wall-clock minutes. */
export function visibleMinutes(options: TimeGridOptions = {}): { from: number; to: number } {
  const from = minutesOf(options.dayStart ?? '00:00')
  const to = minutesOf(options.dayEnd ?? '24:00')
  if (!(from >= 0 && to <= 1440 && to > from)) throw new Error(`[Pyreon] calendar: dayStart and dayEnd must be times of one day with dayEnd after dayStart (got ${String(options.dayStart)} and ${String(options.dayEnd)})`)

  return { from, to }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** The start times of the rows of the grid between `dayStart` and `dayEnd`. */
export function slotTimes(options: TimeGridOptions = {}): PlainTime[] {
  const { from, to } = visibleMinutes(options)
  const step = options.slot === undefined ? 30 : Math.round(((options.slot.hours ?? 0) * 60 + (options.slot.minutes ?? 0)) || 30)
  if (step < 1 || step > 1440) throw new Error(`[Pyreon] calendar: slot must be between 1 minute and 24 hours (got ${step} minutes)`)
  const out: PlainTime[] = []
  for (let m = from; m < to; m += step) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}` as PlainTime)

  return out
}

/** Does a timed occurrence touch the day? (A zero-length one touches the day it sits on.) */
function touches(o: EventOccurrence, bounds: DayBounds): boolean {
  return !o.allDay && o.startMs < bounds.endMs && (o.endMs > bounds.startMs || (o.endMs === o.startMs && o.startMs >= bounds.startMs))
}

interface Cut {
  o: EventOccurrence
  startMinute: number
  endMinute: number
  continuesBefore: boolean
  continuesAfter: boolean
}

/**
 * The part of an occurrence on one day, in wall-clock minutes. On a day with a repeated hour the second pass shows the same
 * minutes again, so an end that reads earlier than its start is held at the start (the block gets its minimum height).
 */
function cutOn(o: EventOccurrence, bounds: DayBounds, zone: TimeZone, window: { from: number; to: number }): Cut | null {
  const before = o.startMs < bounds.startMs
  const after = o.endMs > bounds.endMs
  const startMinute = before ? 0 : wallMinute(o.startMs, zone)
  const rawEnd = after ? 1440 : o.endMs === bounds.endMs ? 1440 : wallMinute(o.endMs, zone)
  const endMinute = Math.max(rawEnd, startMinute)
  if (endMinute <= window.from && !(endMinute === startMinute && startMinute >= window.from)) return null
  if (startMinute >= window.to) return null

  return { o, startMinute, endMinute, continuesBefore: before || startMinute < window.from, continuesAfter: after || endMinute > window.to }
}

/**
 * The blocks of one day of a time grid: the timed occurrences that touch the day, cut at its edges (an event across midnight
 * is one block on each day), clipped to `dayStart` to `dayEnd`, and packed into columns. Positions are fractions of the
 * visible day. The grid is a WALL-CLOCK grid: a row is the hour the clock shows, so on the day a zone skips an hour the
 * skipped hour is an empty row and an event across it is that much taller than it lasts; on the day a zone repeats an hour,
 * the second pass is drawn over the same rows as the first (the two share columns when they overlap on screen).
 */
export function layoutDay(date: PlainDate, occurrences: readonly EventOccurrence[], zone: TimeZone, options: TimeGridOptions = {}): TimedBlock[] {
  const bounds = dayBounds(date, zone)
  const window = visibleMinutes(options)
  const span = window.to - window.from
  const min = options.minBlockMinutes ?? 15
  const cuts = occurrences.filter((o) => touches(o, bounds)).map((o) => cutOn(o, bounds, zone, window)).filter((c): c is Cut => c !== null)
  const clipped = cuts.map((c) => ({ ...c, startMinute: Math.max(c.startMinute, window.from), endMinute: Math.min(c.endMinute, window.to) }))
  const packed = new Map(packColumns(clipped.map((c) => ({ key: c.o.key, start: c.startMinute, end: c.endMinute })), { minMinutes: min, ...(options.pinned === undefined ? {} : { pinned: options.pinned }) }).map((p) => [p.key, p]))

  return clipped
    .map((c): TimedBlock => {
      const p = packed.get(c.o.key) as { column: number; columns: number; span: number }
      const top = (c.startMinute - window.from) / span

      return {
        key: `${c.o.key}@${date}`,
        occurrenceKey: c.o.key,
        top,
        height: Math.min(Math.max(c.endMinute - c.startMinute, min) / span, 1 - top),
        column: p.column,
        columns: p.columns,
        span: p.span,
        left: p.column / p.columns,
        width: p.span / p.columns,
        startMinute: c.startMinute,
        endMinute: c.endMinute,
        continuesBefore: c.continuesBefore,
        continuesAfter: c.continuesAfter,
      }
    })
    .sort((a, b) => a.top - b.top || a.column - b.column || (a.key < b.key ? -1 : 1))
}

/** Where the "now" line is on a day, as a fraction of the visible day; `null` when `now` is not on that day or is outside the visible hours. */
export function nowOffset(date: PlainDate, now: Instant, zone: TimeZone, options: TimeGridOptions = {}): number | null {
  const bounds = dayBounds(date, zone)
  if (now < bounds.startMs || now >= bounds.endMs) return null
  const { from, to } = visibleMinutes(options)
  const minute = wallMinute(now, zone)

  return minute < from || minute >= to ? null : (minute - from) / (to - from)
}

/** A string that changes exactly when the blocks of a day would: use it to skip recomputing a day whose occurrences did not change. */
export function daySignature(date: PlainDate, occurrences: readonly EventOccurrence[], zone: TimeZone): string {
  const bounds = dayBounds(date, zone)

  return occurrences
    .filter((o) => touches(o, bounds))
    .map((o) => `${o.key}|${o.startMs}|${o.endMs}`)
    .sort()
    .join(';')
}

export interface TimeGridLayout {
  /** Events of whole days (and of more than a day, if you pass them) in lanes across the visible days. */
  allDay: WeekLayout
  days: readonly { date: PlainDate; blocks: readonly TimedBlock[]; signature: string }[]
  slots: readonly PlainTime[]
}

/** A whole time grid: the all-day row (lanes across the days), a column of blocks per day, and the slot times. */
export function layoutTimeGrid(occurrences: readonly EventOccurrence[], dates: readonly PlainDate[], zone: TimeZone, options: TimeGridOptions & { allDayCapacity?: number } = {}): TimeGridLayout {
  const allDayCapacity = options.allDayCapacity ?? Number.POSITIVE_INFINITY

  return {
    allDay: layoutRow(occurrences.filter((o) => o.allDay), dates, allDayCapacity),
    days: dates.map((date) => ({ date, blocks: layoutDay(date, occurrences, zone, options), signature: daySignature(date, occurrences, zone) })),
    slots: slotTimes(options),
  }
}
