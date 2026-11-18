import { now, setClock as ambientSetClock, timeZone } from '@pyreon/ambient'
import { daysFromToday as coreDaysFromToday } from './relative'
import { toPlainDate } from './zone'
import type { Instant, PlainDate, PlainDateTime, TimeZone } from './types'

/**
 * The clock of the whole app: this is `@pyreon/ambient`'s, so `@pyreon/format`, `@pyreon/i18n` and every component read the
 * same pin. Pin it for tests and previews; `null` restores the system clock. Process-wide: on a server use `provideClock`
 * from `@pyreon/ambient` per request.
 *
 * @example setClock(() => Date.UTC(2031, 5, 18, 16, 0)); today('Asia/Tokyo') // => '2031-06-19'
 */
export const setClock: (clock: (() => Instant) | null) => void = ambientSetClock

/**
 * The current instant from the ambient clock: `Date.now()`, the pin, the request's provided instant, or the server's
 * hand-over on a hydrating page.
 *
 * @example typeof now() // => 'number'
 */
export { now }

/**
 * Today's date in `zone` (default: the active time zone of `@pyreon/ambient`), by the ambient clock.
 *
 * @example isPlainDate(today('UTC')) // => true
 */
export function today(zone?: TimeZone): PlainDate {
  return toPlainDate(now(), zone ?? timeZone())
}

/**
 * Calendar days from today to the day `value` falls on, in `zone` (default: the active zone), by the ambient clock: 0 today, -1
 * yesterday, 1 tomorrow. Pass `at` to override the clock.
 *
 * @example daysFromToday('2026-11-17', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => -1
 */
export function daysFromToday(value: Instant | PlainDate | PlainDateTime, zone?: TimeZone, at?: Instant): number {
  return coreDaysFromToday(value, zone ?? timeZone(), at ?? now())
}

/**
 * Whether `value` falls on today's date in `zone` (default: the active zone), by the ambient clock.
 *
 * @example isToday('2026-11-18', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => true
 */
export function isToday(value: Instant | PlainDate | PlainDateTime, zone?: TimeZone, at?: Instant): boolean {
  return daysFromToday(value, zone, at) === 0
}

/**
 * Whether `value` falls on yesterday's date in `zone` (default: the active zone), by the ambient clock.
 *
 * @example isYesterday('2026-11-17', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => true
 */
export function isYesterday(value: Instant | PlainDate | PlainDateTime, zone?: TimeZone, at?: Instant): boolean {
  return daysFromToday(value, zone, at) === -1
}

/**
 * Whether `value` falls on tomorrow's date in `zone` (default: the active zone), by the ambient clock.
 *
 * @example isTomorrow('2026-11-19', 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // => true
 */
export function isTomorrow(value: Instant | PlainDate | PlainDateTime, zone?: TimeZone, at?: Instant): boolean {
  return daysFromToday(value, zone, at) === 1
}
