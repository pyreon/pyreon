import { badValue } from './errors'
import { diff } from './diff'
import { isPlainDate, isPlainDateTime } from './text'
import { toPlainDate } from './zone'
import type { Instant, PlainDate, PlainDateTime, TimeZone } from './types'

/** The calendar date `value` falls on: an Instant in `zone`, or a PlainDate / PlainDateTime as written. */
function dayOf(fn: string, value: unknown, zone: TimeZone): PlainDate {
  if (typeof value === 'number') return toPlainDate(value, zone)
  if (isPlainDate(value)) return value

  return isPlainDateTime(value) ? (value.slice(0, 10) as PlainDate) : badValue(fn, 'an Instant, PlainDate or PlainDateTime', value)
}

/**
 * Calendar days from today to the day `value` falls on, in `zone`: 0 today, -1 yesterday, 1 tomorrow. It counts calendar days,
 * not 24-hour spans, so it is right on the 23- and 25-hour days of a DST change and around local midnight. An Instant is read
 * in `zone`; a PlainDate or PlainDateTime is taken as the local date already. `now` is for tests; in `@pyreon/time` it
 * defaults to the pinned clock.
 *
 * @example daysFromToday('2026-11-17', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => -1
 * @example daysFromToday(Date.UTC(2026, 10, 18, 23, 30), 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => 1
 */
export function daysFromToday(value: Instant | PlainDate | PlainDateTime, zone: TimeZone, now: Instant = Date.now()): number {
  return diff(toPlainDate(now, zone), dayOf('daysFromToday', value, zone), 'day')
}

/**
 * Whether `value` falls on today's date in `zone`. See `daysFromToday` for how instants and plain values are read.
 *
 * @example isToday(Date.UTC(2026, 10, 18, 23, 30), 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => false
 * @example isToday(Date.UTC(2026, 10, 18, 22, 30), 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => true
 */
export function isToday(value: Instant | PlainDate | PlainDateTime, zone: TimeZone, now: Instant = Date.now()): boolean {
  return daysFromToday(value, zone, now) === 0
}

/**
 * Whether `value` falls on yesterday's date in `zone`.
 *
 * @example isYesterday('2026-11-17', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => true
 */
export function isYesterday(value: Instant | PlainDate | PlainDateTime, zone: TimeZone, now: Instant = Date.now()): boolean {
  return daysFromToday(value, zone, now) === -1
}

/**
 * Whether `value` falls on tomorrow's date in `zone`.
 *
 * @example isTomorrow('2026-11-19', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => true
 */
export function isTomorrow(value: Instant | PlainDate | PlainDateTime, zone: TimeZone, now: Instant = Date.now()): boolean {
  return daysFromToday(value, zone, now) === 1
}
