/** Availability: free slots of a given length inside working time, around busy intervals. */
import type { Duration } from '@pyreon/time/core'
import { openWindow } from './business'
import { timeMs } from './durations'
import { writeWall } from './civil'
import { badRange, badValue, guard } from './errors'
import { itemsOf, mergeItems, subtractItems, type Item } from './intervals'
import type { BusinessCalendar, Interval, PlainDateTime } from './types'

/** More slots than this is almost certainly a missing bound: `freeSlots` throws instead of building them. */
const DEFAULT_LIMIT = 100_000

/** Options of `freeSlots`. */
export interface FreeSlotsOptions<T extends PlainDateTime | number = PlainDateTime> {
  /** Where slots may be: one interval or several (a week of days, say). Half-open. */
  within: Interval<T> | readonly Interval<T>[]
  /** Taken time: meetings, bookings. Any order, overlapping or not. */
  busy: readonly Interval<T>[]
  /** Length of a slot: hours, minutes, seconds; must be positive. */
  duration: Duration
  /** Distance between slot starts. Default `duration`. Slot starts are anchored to the start of each stretch of working time. */
  step?: Duration
  /** Only offer slots inside these opening hours (date-times only). */
  calendar?: BusinessCalendar
  /** Free time wanted around a slot: `before` it and `after` it, counted from busy time (not from the edges of `within`). */
  buffer?: { before?: Duration; after?: Duration }
  /** Throw when more than this many slots would come back. Default 100000. */
  limit?: number
}

/**
 * The start times, as intervals of `duration`, at which something fits: inside `within`, inside the calendar's opening hours,
 * not touching busy time, and with the buffers around it. Slot starts sit on a grid of `step` from the start of each stretch
 * of working time, so "every 30 minutes from 09:00" stays at :00 and :30 whatever the meetings do. Intervals are half-open:
 * a slot may end exactly when a busy interval starts. Slots are sorted and never overlap busy time. A zero or negative
 * duration or step is a mistake and throws. Instants (numbers) work too, without a calendar.
 *
 * @example freeSlots({ within: { start: '2026-11-18T09:00', end: '2026-11-18T12:00' }, busy: [{ start: '2026-11-18T10:00', end: '2026-11-18T10:30' }], duration: { minutes: 60 } }).map((s) => s.start) // => ['2026-11-18T09:00', '2026-11-18T11:00']
 */
export const freeSlots = /* @__PURE__ */ guard('freeSlots', function freeSlots<T extends PlainDateTime | number>(options: FreeSlotsOptions<T>): Interval<T>[] {
  if (typeof options !== 'object' || options === null) return badValue('freeSlots', 'an options object { within, busy, duration }', options)
  const grid = {
    duration: timeMs('freeSlots', 'duration', options.duration, 'positive'),
    step: options.step === undefined ? 0 : timeMs('freeSlots', 'step', options.step, 'positive'),
    limit: options.limit ?? DEFAULT_LIMIT,
  }
  const before = timeMs('freeSlots', 'buffer.before', options.buffer?.before ?? {}, 'nonNegative')
  const after = timeMs('freeSlots', 'buffer.after', options.buffer?.after ?? {}, 'nonNegative')
  const within = Array.isArray(options.within) ? (options.within as readonly Interval<T>[]) : [options.within as Interval<T>]
  const stretches = mergeItems(itemsOf('freeSlots', 'within', within))
  const wallValues = stretches.length > 0 && typeof stretches[0]!.start === 'string'
  const busy = mergeItems(itemsOf('freeSlots', 'busy', options.busy).map((b) => ({ ...b, s: b.s - after, e: b.e + before })))

  if (options.calendar !== undefined && !wallValues && stretches.length > 0) return badRange('freeSlots', 'a calendar works on date-times ("2026-11-18T09:00"), not instants. Convert the instants with toPlainDateTime first.')
  const starts: number[] = []

  for (const stretch of stretches) {
    const pieces = options.calendar === undefined ? [[stretch.s, stretch.e] as [number, number]] : openWindow('freeSlots', options.calendar, stretch.s, stretch.e)

    for (const [a, b] of pieces) slotStarts(a, b, busy, { ...grid, step: grid.step === 0 ? grid.duration : grid.step }, starts)
  }
  const write = (n: number): T => (wallValues ? writeWall(n) : n) as T

  return starts.map((s) => ({ start: write(s), end: write(s + grid.duration) }))
})

interface Grid {
  duration: number
  step: number
  limit: number
}

/** Push the slot starts of one stretch `[a, b)` on the grid anchored at `a`, avoiding `busy` (already merged and widened). */
function slotStarts(a: number, b: number, busy: Item<string | number>[], grid: Grid, out: number[]): void {
  const free = subtractItems([{ s: a, e: b, start: a, end: b }], busy.map((x) => ({ ...x, start: x.s, end: x.e })))

  for (const f of free) {
    for (let s = a + Math.max(0, Math.ceil((f.s - a) / grid.step)) * grid.step; s + grid.duration <= f.e; s += grid.step) {
      if (out.length >= grid.limit) badRange('freeSlots', `more than ${grid.limit} slots. Narrow \`within\`, lengthen the step, or raise \`limit\`.`)
      out.push(s)
    }
  }
}
