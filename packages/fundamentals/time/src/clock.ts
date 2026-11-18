import { show } from './errors'
import { daysFromToday as coreDaysFromToday } from './relative'
import { toPlainDate } from './zone'
import { localZone } from './interop'
import type { Instant, PlainDate, PlainDateTime, TimeZone } from './types'

/** The pinned clock, or `null` for the system clock. One reference, never a collection. */
let source: (() => Instant) | null = null

/**
 * Pin the clock `now()`, `today()` and the `is...` day helpers read, for tests and previews; `null` restores the system clock.
 * Process-wide: do not call it per request on a server.
 *
 * @example setClock(() => Date.UTC(2031, 5, 18, 16, 0)); today('Asia/Tokyo') // => '2031-06-19'
 */
export function setClock(clock: (() => Instant) | null): void {
  if (clock !== null && typeof clock !== 'function') {
    throw new TypeError(`[Pyreon] setClock: expected a function returning epoch milliseconds, or null to use the system clock, got ${show(clock)}.`)
  }
  source = clock
}

/**
 * The current instant, or the pinned clock's value.
 *
 * @example typeof now() // => 'number'
 */
export function now(): Instant {
  return source === null ? Date.now() : source()
}

/**
 * Today's date in `zone` (default: the runtime's local zone), by the pinned clock.
 *
 * @example isPlainDate(today('UTC')) // => true
 */
export function today(zone?: TimeZone): PlainDate {
  return toPlainDate(now(), zone ?? localZone())
}

/**
 * `daysFromToday` against the pinned clock (see `setClock`) instead of `Date.now()`; pass `at` to override both.
 *
 * @example daysFromToday('2026-11-17', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => -1
 */
export function daysFromToday(value: Instant | PlainDate | PlainDateTime, zone: TimeZone, at?: Instant): number {
  return coreDaysFromToday(value, zone, at ?? now())
}

/**
 * Whether `value` falls on today's date in `zone`, by the pinned clock.
 *
 * @example isToday('2026-11-18', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => true
 */
export function isToday(value: Instant | PlainDate | PlainDateTime, zone: TimeZone, at?: Instant): boolean {
  return daysFromToday(value, zone, at) === 0
}

/**
 * Whether `value` falls on yesterday's date in `zone`, by the pinned clock.
 *
 * @example isYesterday('2026-11-17', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => true
 */
export function isYesterday(value: Instant | PlainDate | PlainDateTime, zone: TimeZone, at?: Instant): boolean {
  return daysFromToday(value, zone, at) === -1
}

/**
 * Whether `value` falls on tomorrow's date in `zone`, by the pinned clock.
 *
 * @example isTomorrow('2026-11-19', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => true
 */
export function isTomorrow(value: Instant | PlainDate | PlainDateTime, zone: TimeZone, at?: Instant): boolean {
  return daysFromToday(value, zone, at) === 1
}
