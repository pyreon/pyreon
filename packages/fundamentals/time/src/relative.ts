import { badValue } from './errors'
import { diff } from './diff'
import { dateParts, isPlainDate, isPlainDateTime } from './text'
import { toInstant, toPlainDate } from './zone'
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

/** The unit of a structured relative distance. */
export type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

/** How far a moment is from another, as a signed whole number of one unit: negative is the past. */
export interface RelativeDistance {
  value: number
  unit: RelativeUnit
}

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/**
 * The structured distance from `base` to `target`, counted the way a person says it. Under a minute is seconds, under an hour
 * minutes, under 24 hours hours (elapsed time, truncated toward zero: 59 minutes 40 seconds is 59 minutes). From 24 hours on it
 * is counted by the calendar in `zone`, so yesterday is literally yesterday: under 7 calendar days it is days; otherwise weeks
 * (7-day blocks) while the calendar month differs by less than one or the distance is under 30 days; then calendar months (up to
 * 11), then calendar years. A PlainDate or PlainDateTime target is a wall-clock value in `zone` (a date is its midnight).
 * These are the thresholds of `formatRelativeTo` in `@pyreon/format`, so the same two moments give the same words.
 *
 * @example relativeDistance(Date.UTC(2026, 10, 18, 11, 58), Date.UTC(2026, 10, 18, 12), 'UTC') // => { value: -2, unit: 'minute' }
 * @example relativeDistance('2026-11-17', Date.UTC(2026, 10, 18, 23, 59), 'UTC') // => { value: -1, unit: 'day' }
 * @example relativeDistance('2026-12-20', Date.UTC(2026, 10, 18, 12), 'UTC') // => { value: 1, unit: 'month' }
 */
export function relativeDistance(target: Instant | PlainDate | PlainDateTime, base: Instant, zone: TimeZone): RelativeDistance {
  if (typeof base !== 'number' || !Number.isFinite(base)) return badValue('relativeDistance', 'a base Instant (epoch milliseconds)', base)
  if (typeof target === 'number' && !Number.isFinite(target)) return badValue('relativeDistance', 'a finite Instant, a PlainDate or a PlainDateTime', target)
  const t = typeof target === 'number' ? target : toInstant(target, zone)
  const diffMs = t - base
  const abs = Math.abs(diffMs)

  if (abs < MINUTE) return { value: Math.trunc(diffMs / 1000) + 0, unit: 'second' }
  if (abs < HOUR) return { value: Math.trunc(diffMs / MINUTE), unit: 'minute' }
  if (abs < DAY) return { value: Math.trunc(diffMs / HOUR), unit: 'hour' }
  const td = dateParts(toPlainDate(t, zone))
  const bd = dateParts(toPlainDate(base, zone))
  const days = diff(toPlainDate(base, zone), toPlainDate(t, zone), 'day')
  const months = td.year * 12 + td.month - (bd.year * 12 + bd.month)
  const absDays = Math.abs(days)

  if (absDays < 7) return { value: days, unit: 'day' }
  if (Math.abs(months) < 1 || absDays < 30) return { value: Math.trunc(days / 7), unit: 'week' }

  return Math.abs(months) < 12 ? { value: months, unit: 'month' } : { value: td.year - bd.year, unit: 'year' }
}
