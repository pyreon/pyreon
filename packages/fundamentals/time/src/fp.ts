import {
  add as coreAdd,
  endOf as coreEndOf,
  startOf as coreStartOf,
  subtract as coreSubtract,
  type WeekOptions,
} from './arith'
import { show } from './errors'
import { monthGrid as coreMonthGrid, type MonthGridOptions } from './calendar'
import { compare, isAfter as coreIsAfter, isBefore as coreIsBefore, isSame as coreIsSame } from './compare'
import { between as coreBetween, diff as coreDiff, type DiffOptions } from './diff'
import { fromDate as coreFromDate, toDate as coreToDate } from './interop'
import {
  addInstant as coreAddInstant,
  offsetAt as coreOffsetAt,
  toInstant as coreToInstant,
  toPlainDate as coreToPlainDate,
  toPlainDateTime as coreToPlainDateTime,
  toPlainTime as coreToPlainTime,
  type ToInstantOptions,
} from './zone'
import type {
  Comparable,
  Duration,
  Instant,
  PlainDate,
  PlainDateTime,
  PlainTime,
  PlainValue,
  PlainYearMonth,
  ShapeOf,
  TimeZone,
  Unit,
} from './types'

/**
 * Value-last forms of the core operations: each call takes the configuration and returns a plain unary function that takes
 * the value, so an operation can be built once, named, passed to `map` / `filter` / `groupBy` and chained with `pipe`.
 * These are thin wrappers over `@pyreon/time/core` (no second implementation). Build an adjuster once and reuse it: the
 * wrapper allocates one closure when it is built, and a call costs one extra function call over the core function.
 */

function needFunction(fn: string, expected: string, value: unknown): void {
  if (typeof value !== 'function') throw new TypeError(`[Pyreon] ${fn}: expected ${expected}, got ${show(value)}.`)
}

/**
 * Value-last `add`: `add({ months: 1 })` is a function you can name, pass to `map` and chain with `pipe`. The result keeps the input's shape.
 *
 * @example add({ months: 1 })('2026-01-31') // => '2026-02-28'
 */
export function add(duration: Duration): <T extends PlainValue>(value: T) => ShapeOf<T> {
  return (value) => coreAdd(value, duration)
}

/**
 * Value-last `subtract`.
 *
 * @example subtract({ days: 1 })('2026-03-01') // => '2026-02-28'
 */
export function subtract(duration: Duration): <T extends PlainValue>(value: T) => ShapeOf<T> {
  return (value) => coreSubtract(value, duration)
}

/**
 * Value-last `startOf`. Weeks start on `options.weekStart` (ISO weekday, 1 Monday ... 7 Sunday).
 *
 * @example startOf('week')('2026-11-18') // => '2026-11-16'
 * @example startOf('week', { weekStart: 7 })('2026-11-18') // => '2026-11-15'
 */
export function startOf(unit: Unit, options?: WeekOptions): <T extends PlainValue>(value: T) => ShapeOf<T> {
  return (value) => coreStartOf(value, unit, options)
}

/**
 * Value-last `endOf`.
 *
 * @example endOf('month')('2026-11-18') // => '2026-11-30'
 */
export function endOf(unit: Unit, options?: WeekOptions): <T extends PlainValue>(value: T) => ShapeOf<T> {
  return (value) => coreEndOf(value, unit, options)
}

/**
 * A predicate: `isBefore(limit)(value)` is true for values before `limit`, so it reads correctly in `filter`.
 *
 * @example isBefore('2026-03-01')('2026-01-01') // => true
 */
export function isBefore<T extends Comparable>(limit: T): (value: ShapeOf<T>) => boolean {
  return (value) => coreIsBefore<Comparable>(value, limit)
}

/**
 * A predicate: true for values after `limit`.
 *
 * @example isAfter('2026-03-01')('2026-06-01') // => true
 */
export function isAfter<T extends Comparable>(limit: T): (value: ShapeOf<T>) => boolean {
  return (value) => coreIsAfter<Comparable>(value, limit)
}

/**
 * A predicate: true for values in the same unit as `other` (or the same moment without a unit). For Instants and a calendar unit, pass `options.zone`.
 *
 * @example isSame('2026-11-18', 'month')('2026-11-02') // => true
 */
export function isSame<T extends Comparable>(other: T, unit?: Unit, options?: WeekOptions): (value: ShapeOf<T>) => boolean {
  return (value) => coreIsSame<Comparable>(value, other, unit, options)
}

/**
 * A predicate: true for values from `start` to `end`, both included.
 *
 * @example isBetween('2026-02-01', '2026-03-01')('2026-02-10') // => true
 */
export function isBetween<T extends Comparable>(start: T, end: T): (value: ShapeOf<T>) => boolean {
  return (value) => compare<Comparable>(value, start) >= 0 && compare<Comparable>(value, end) <= 0
}

/**
 * Limit values to the range `lo` ... `hi`. Throws when `lo` is after `hi`.
 *
 * @example clamp('2026-01-01', '2026-03-01')('2027-01-01') // => '2026-03-01'
 */
export function clamp<T extends Comparable>(lo: T, hi: T): (value: ShapeOf<T>) => ShapeOf<T> {
  if (compare<Comparable>(lo, hi) > 0) throw new RangeError('[Pyreon] clamp: the lower bound is after the upper bound')

  return (value) => (compare<Comparable>(value, lo) < 0 ? lo : compare<Comparable>(value, hi) > 0 ? hi : value) as ShapeOf<T>
}

/**
 * Whole units from `base` to each value: `dates.map(diffFrom(today, 'day'))` reads left to right.
 *
 * @example diffFrom('2026-01-01', 'day')('2026-01-10') // => 9
 */
export function diffFrom<T extends Comparable>(base: T, unit: Unit, options?: DiffOptions): (value: ShapeOf<T>) => number {
  return (value) => coreDiff<Comparable>(base, value, unit, options)
}

/**
 * The Duration from `base` to each value.
 *
 * @example betweenFrom('2026-01-31')('2026-03-01') // => { years: 0, months: 1, days: 1 }
 */
export function betweenFrom<T extends PlainDate | PlainDateTime>(base: T): (value: ShapeOf<T>) => Duration {
  return (value) => coreBetween(base, value)
}

/**
 * A comparator that orders items by a mapped value: `items.sort(by(toDay))`.
 *
 * @example by((x: { d: PlainDate }) => x.d)({ d: '2026-01-01' }, { d: '2026-03-01' }) // => -1
 */
export function by<A, K extends Comparable>(mapper: (item: A) => K): (a: A, b: A) => -1 | 0 | 1 {
  needFunction('by', 'a function that maps an item to a date, time or Instant', mapper)
  return (a, b) => compare<K>(mapper(a), mapper(b))
}

/**
 * Value-last `toInstant`.
 *
 * @example toInstant('UTC')('2026-11-18T14:30') // => Date.UTC(2026, 10, 18, 14, 30)
 */
export function toInstant(zone: TimeZone, options?: ToInstantOptions): (value: PlainDate | PlainDateTime) => Instant {
  return (value) => coreToInstant(value, zone, options)
}

/**
 * Value-last `toPlainDate`: a groupBy key for bucketing instants by local day.
 *
 * @example toPlainDate('Asia/Tokyo')(Date.UTC(2026, 10, 18, 23, 30)) // => '2026-11-19'
 */
export function toPlainDate(zone: TimeZone): (instant: Instant) => PlainDate {
  return (instant) => coreToPlainDate(instant, zone)
}

/**
 * Value-last `toPlainTime`.
 *
 * @example toPlainTime('Europe/Prague')(Date.UTC(2026, 10, 18, 13, 30)) // => '14:30:00'
 */
export function toPlainTime(zone: TimeZone): (instant: Instant) => PlainTime {
  return (instant) => coreToPlainTime(instant, zone)
}

/**
 * Value-last `toPlainDateTime`.
 *
 * @example toPlainDateTime('Europe/Prague')(0) // => '1970-01-01T01:00:00'
 */
export function toPlainDateTime(zone: TimeZone): (instant: Instant) => PlainDateTime {
  return (instant) => coreToPlainDateTime(instant, zone)
}

/**
 * Value-last `offsetAt`: minutes east of UTC.
 *
 * @example offsetAt('Asia/Kathmandu')(Date.UTC(2026, 0, 1)) // => 345
 */
export function offsetAt(zone: TimeZone): (instant: Instant) => number {
  return (instant) => coreOffsetAt(instant, zone)
}

/**
 * Value-last `addInstant`.
 *
 * @example addInstant({ days: 1 }, 'UTC')(Date.UTC(2026, 0, 31)) // => Date.UTC(2026, 1, 1)
 */
export function addInstant(duration: Duration, zone?: TimeZone): (instant: Instant) => Instant {
  return (instant) => coreAddInstant(instant, duration, zone)
}

/**
 * Value-last `monthGrid`. `weekStart` is an ISO weekday (1 Monday ... 7 Sunday).
 *
 * @example monthGrid({ weekStart: 7 })('2026-11').length // => 5
 */
export function monthGrid(options?: MonthGridOptions): (month: PlainDate | PlainYearMonth) => PlainDate[][] {
  return (month) => coreMonthGrid(month, options)
}

/**
 * Value-last `fromDate`.
 *
 * @example fromDate('UTC')(new Date(0)) // => '1970-01-01T00:00:00'
 */
export function fromDate(zone?: TimeZone): (date: Date) => PlainDateTime {
  return (date) => coreFromDate(date, zone)
}

/**
 * Value-last `toDate`.
 *
 * @example toDate('UTC')('1970-01-01').getTime() // => 0
 */
export function toDate(zone?: TimeZone): (value: PlainDate | PlainDateTime | Instant) => Date {
  return (value) => coreToDate(value, zone)
}

// Operations that already take one value are the same function in both entries.
export { compare } from './compare'
export { dayOfWeek, dayOfYear, daysInMonth, isLeapYear, weekOfYear, yearOfWeek } from './calendar'
export { toMilliseconds } from './duration'
export { dateParts, isPlainDate, isPlainDateTime, isPlainTime, isPlainYearMonth, timeParts } from './text'

/**
 * The type of `pipe`: one overload per step count, one to eight.
 *
 * @example const compose: Pipe = pipe
 */
export interface Pipe {
  <A, B>(f1: (value: A) => B): (value: A) => B
  <A, B, C>(f1: (value: A) => B, f2: (value: B) => C): (value: A) => C
  <A, B, C, D>(f1: (value: A) => B, f2: (value: B) => C, f3: (value: C) => D): (value: A) => D
  <A, B, C, D, E>(f1: (value: A) => B, f2: (value: B) => C, f3: (value: C) => D, f4: (value: D) => E): (value: A) => E
  <A, B, C, D, E, F>(f1: (value: A) => B, f2: (value: B) => C, f3: (value: C) => D, f4: (value: D) => E, f5: (value: E) => F): (value: A) => F
  <A, B, C, D, E, F, G>(f1: (value: A) => B, f2: (value: B) => C, f3: (value: C) => D, f4: (value: D) => E, f5: (value: E) => F, f6: (value: F) => G): (value: A) => G
  <A, B, C, D, E, F, G, H>(f1: (value: A) => B, f2: (value: B) => C, f3: (value: C) => D, f4: (value: D) => E, f5: (value: E) => F, f6: (value: F) => G, f7: (value: G) => H): (value: A) => H
  <A, B, C, D, E, F, G, H, I>(f1: (value: A) => B, f2: (value: B) => C, f3: (value: C) => D, f4: (value: D) => E, f5: (value: E) => F, f6: (value: F) => G, f7: (value: G) => H, f8: (value: H) => I): (value: A) => I
}

/**
 * Left-to-right composition of unary functions, typed for up to eight steps. The result is a plain function.
 *
 * @example pipe(add({ months: 1 }), startOf('month'))('2026-01-31') // => '2026-02-01'
 */
export const pipe: Pipe = (...fns: ReadonlyArray<(value: unknown) => unknown>): ((value: unknown) => unknown) => {
  if (fns.length === 0) throw new TypeError('[Pyreon] pipe: expected at least one function, got none. Example: pipe(add({ months: 1 }), startOf("month")).')
  for (const f of fns) needFunction('pipe', 'every step to be a function', f)
  const [f1, f2, f3] = fns

  if (fns.length === 1) return f1!
  if (fns.length === 2) return (value) => f2!(f1!(value))
  if (fns.length === 3) return (value) => f3!(f2!(f1!(value)))

  return (value) => {
    let out = value

    for (let i = 0; i < fns.length; i++) out = fns[i]!(out)

    return out
  }
}
