/** `expandEvents`: single and recurring events turned into the instances that fall in a window. */
import { DAY, readWall, writeDate, writeWall } from './civil'
import { badRange, badValue, guard, show } from './errors'
import { walk } from './expand'
import { compile } from './plan'
import type { Interval, PlainValue, Recurrence } from './types'

/** Changes to one occurrence of a recurring event, found by its `occurrence` key. */
export interface EventOverride<T extends PlainValue = PlainValue> {
  /** The `occurrence` of the instance this changes: its original start as returned by `expandEvents`. */
  occurrence: number
  /** Remove this instance. */
  cancelled?: boolean
  /** Move the instance. Without `end`, it keeps its length. */
  start?: T
  /** Change where the instance ends. */
  end?: T
}

/** An event: one-off, or repeating when it has a `rule`. `start` and `end` are both dates (an all-day event; `end` is the day after) or both date-times. */
export interface CalendarEvent<T extends PlainValue = PlainValue> {
  /** Names the event in the keys of its instances. Without one, its position in the list is used. */
  id?: string | number
  start: T
  end: T
  /** Its `start` must equal the event's `start`. */
  rule?: Recurrence
  overrides?: readonly EventOverride<T>[]
}

/** One instance of an event inside the window. */
export interface EventInstance<T extends PlainValue = PlainValue> {
  id?: string | number
  /** `"<id>:<occurrence>"`: the same instance has the same key whatever the window, so a view can key its rows by it. */
  key: string
  /**
   * The instance's original start as a number (the milliseconds of that wall-clock time counted from 1970-01-01T00:00 as if it
   * were UTC). It does not change when the instance is moved, and it does not depend on the window, so it identifies the instance.
   */
  occurrence: number
  start: T
  end: T
}

function eventWalls(fn: string, ev: CalendarEvent, at: string): { s: number; e: number; dateOnly: boolean } {
  if (typeof ev !== 'object' || ev === null) return badValue(fn, `${at} to be an event { start, end }`, ev)
  const s = readWall(fn, `${at}.start`, ev.start)
  const e = readWall(fn, `${at}.end`, ev.end)

  if (s.dateOnly !== e.dateOnly) return badRange(fn, `${at} mixes a date and a date-time (${show(ev.start)}, ${show(ev.end)}). Use two dates for an all-day event or two date-times.`)
  if (e.wall < s.wall) return badRange(fn, `${at} ends before it starts (${show(ev.start)} to ${show(ev.end)}).`)

  return { s: s.wall, e: e.wall, dateOnly: s.dateOnly }
}

const write = (dateOnly: boolean, wall: number): PlainValue => (dateOnly ? writeDate(Math.floor(wall / DAY)) : writeWall(wall))

/**
 * What a calendar view needs: the instances of single and recurring events that overlap `range` (half-open), sorted by start.
 * An instance overlaps when `start < range.end` and `end > range.start`. Each carries a stable `key` and `occurrence`, so a view
 * can keep its rows across navigation. A recurring event's rule must start at the event's start; its instances last as long as
 * the event does, measured on the wall clock. `overrides` cancel or move single instances (found by `occurrence`); a moved
 * instance appears where it was moved to, even when its original time is outside the window. The cost depends on the window,
 * not on how long ago the event started.
 *
 * @example expandEvents([{ id: 'standup', start: '2026-11-16T09:00', end: '2026-11-16T09:15', rule: { every: 'day', start: '2026-11-16T09:00' } }], { start: '2026-11-18T00:00', end: '2026-11-20T00:00' }).map((i) => i.start) // => ['2026-11-18T09:00', '2026-11-19T09:00']
 */
export const expandEvents = /* @__PURE__ */ guard('expandEvents', function expandEvents<T extends PlainValue>(events: readonly CalendarEvent<T>[], range: Interval<T>): EventInstance<T>[] {
  if (!Array.isArray(events)) return badValue('expandEvents', 'an array of events', events)
  const from = readWall('expandEvents', 'range.start', range?.start)
  const to = readWall('expandEvents', 'range.end', range?.end)

  if (to.wall < from.wall) return badRange('expandEvents', `the range ends before it starts (${show(range.start)} to ${show(range.end)}).`)
  const out: (EventInstance<T> & { wall: number })[] = []

  if (to.wall === from.wall) return []

  events.forEach((ev, index) => {
    const w = eventWalls('expandEvents', ev as CalendarEvent, `events[${index}]`)
    const name = ev.id ?? `#${index}`
    const length = w.e - w.s
    const overridden = new Map<number, EventOverride<T>>((ev.overrides ?? []).map((o: EventOverride<T>): [number, EventOverride<T>] => [o.occurrence, o]))
    const push = (occurrence: number, s: number, e: number): void => {
      if (!(s < to.wall && (e > from.wall || (e === s && s >= from.wall)))) return
      out.push({ ...(ev.id === undefined ? {} : { id: ev.id }), key: `${name}:${occurrence}`, occurrence, start: write(w.dateOnly, s) as T, end: write(w.dateOnly, e) as T, wall: s })
    }
    let originals: Iterable<number> = [w.s]

    if (ev.rule !== undefined) {
      const plan = compile('expandEvents', ev.rule)

      if (plan.startWall !== w.s || plan.dateOnly !== w.dateOnly) return badRange('expandEvents', `events[${index}].rule.start (${show(ev.rule.start)}) differs from the event's start (${show(ev.start)}). Build the rule with start set to the event's start.`)
      originals = walk(plan, from.wall - length, to.wall - 1)
    }
    for (const o of originals) {
      if (overridden.has(o)) continue
      push(o, o, o + length)
    }
    for (const o of overridden.values()) {
      if (o.cancelled === true) continue
      if (o.start === undefined && o.end === undefined) continue
      const s = o.start === undefined ? o.occurrence : readWall('expandEvents', 'override.start', o.start).wall
      const e = o.end === undefined ? s + length : readWall('expandEvents', 'override.end', o.end).wall

      push(o.occurrence, s, e)
    }
  })
  out.sort((a, b) => a.wall - b.wall || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  return out.map(({ wall: _wall, ...rest }) => rest as EventInstance<T>)
})
