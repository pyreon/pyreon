import {
  add as coreAdd,
  endOf as coreEndOf,
  startOf as coreStartOf,
  subtract as coreSubtract,
  type WeekOptions,
} from './arith'
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

/** `add({ months: 1 })` is a function that adds one month to a PlainDate, PlainDateTime or PlainYearMonth. */
export function add(duration: Duration): <T extends PlainValue>(value: T) => ShapeOf<T> {
  return (value) => coreAdd(value, duration)
}

export function subtract(duration: Duration): <T extends PlainValue>(value: T) => ShapeOf<T> {
  return (value) => coreSubtract(value, duration)
}

export function startOf(unit: Unit, options?: WeekOptions): <T extends PlainValue>(value: T) => ShapeOf<T> {
  return (value) => coreStartOf(value, unit, options)
}

export function endOf(unit: Unit, options?: WeekOptions): <T extends PlainValue>(value: T) => ShapeOf<T> {
  return (value) => coreEndOf(value, unit, options)
}

/** `isBefore(limit)` is a predicate: true for values before `limit`. */
export function isBefore<T extends Comparable>(limit: T): (value: ShapeOf<T>) => boolean {
  return (value) => coreIsBefore<Comparable>(value, limit)
}

export function isAfter<T extends Comparable>(limit: T): (value: ShapeOf<T>) => boolean {
  return (value) => coreIsAfter<Comparable>(value, limit)
}

/** `isSame(other, 'month')` is true for values in the same month as `other` (or the same moment without a unit). */
export function isSame<T extends Comparable>(other: T, unit?: Unit, options?: WeekOptions): (value: ShapeOf<T>) => boolean {
  return (value) => coreIsSame<Comparable>(value, other, unit, options)
}

/** `isBetween(start, end)` is true for values from `start` to `end`, both included. */
export function isBetween<T extends Comparable>(start: T, end: T): (value: ShapeOf<T>) => boolean {
  return (value) => compare<Comparable>(value, start) >= 0 && compare<Comparable>(value, end) <= 0
}

/** `clamp(lo, hi)` limits a value to the range. */
export function clamp<T extends Comparable>(lo: T, hi: T): (value: ShapeOf<T>) => ShapeOf<T> {
  if (compare<Comparable>(lo, hi) > 0) throw new RangeError('[Pyreon] clamp: the lower bound is after the upper bound')

  return (value) => (compare<Comparable>(value, lo) < 0 ? lo : compare<Comparable>(value, hi) > 0 ? hi : value) as ShapeOf<T>
}

/** `diffFrom(base, 'day')` counts whole days from `base` to the value, so `dates.map(diffFrom(today, 'day'))` reads left to right. */
export function diffFrom<T extends Comparable>(base: T, unit: Unit, options?: DiffOptions): (value: ShapeOf<T>) => number {
  return (value) => coreDiff<Comparable>(base, value, unit, options)
}

/** `betweenFrom(base)` is the Duration from `base` to the value. */
export function betweenFrom<T extends PlainDate | PlainDateTime>(base: T): (value: ShapeOf<T>) => Duration {
  return (value) => coreBetween(base, value)
}

/** A comparator that orders items by a mapped value: `items.sort(by(toDay))`. */
export function by<A, K extends Comparable>(mapper: (item: A) => K): (a: A, b: A) => -1 | 0 | 1 {
  return (a, b) => compare<K>(mapper(a), mapper(b))
}

export function toInstant(zone: TimeZone, options?: ToInstantOptions): (value: PlainDate | PlainDateTime) => Instant {
  return (value) => coreToInstant(value, zone, options)
}

export function toPlainDate(zone: TimeZone): (instant: Instant) => PlainDate {
  return (instant) => coreToPlainDate(instant, zone)
}

export function toPlainTime(zone: TimeZone): (instant: Instant) => PlainTime {
  return (instant) => coreToPlainTime(instant, zone)
}

export function toPlainDateTime(zone: TimeZone): (instant: Instant) => PlainDateTime {
  return (instant) => coreToPlainDateTime(instant, zone)
}

export function offsetAt(zone: TimeZone): (instant: Instant) => number {
  return (instant) => coreOffsetAt(instant, zone)
}

export function addInstant(duration: Duration, zone?: TimeZone): (instant: Instant) => Instant {
  return (instant) => coreAddInstant(instant, duration, zone)
}

export function monthGrid(options?: MonthGridOptions): (month: PlainDate | PlainYearMonth) => PlainDate[][] {
  return (month) => coreMonthGrid(month, options)
}

export function fromDate(zone?: TimeZone): (date: Date) => PlainDateTime {
  return (date) => coreFromDate(date, zone)
}

export function toDate(zone?: TimeZone): (value: PlainDate | PlainDateTime | Instant) => Date {
  return (value) => coreToDate(value, zone)
}

// Operations that already take one value are the same function in both entries.
export { compare } from './compare'
export { dayOfWeek, dayOfYear, daysInMonth, isLeapYear, weekOfYear, yearOfWeek } from './calendar'
export { toMilliseconds } from './duration'
export { dateParts, isPlainDate, isPlainDateTime, isPlainTime, isPlainYearMonth, timeParts } from './text'

/**
 * Left-to-right composition of unary functions, up to eight steps: `pipe(add({ months: 1 }), startOf('month'))` is a
 * function that goes to the first of next month. The result is a plain function (use it with `map`, `filter`, `groupBy`).
 * With one to three steps it is a direct closure; more steps loop.
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

export const pipe: Pipe = (...fns: ReadonlyArray<(value: unknown) => unknown>): ((value: unknown) => unknown) => {
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
