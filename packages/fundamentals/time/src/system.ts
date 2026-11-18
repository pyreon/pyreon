import { localZone } from './interop'
import type { Instant, PlainDate, TimeZone } from './types'
import { toPlainDate } from './zone'

/**
 * The current instant: `Date.now()`. (`@pyreon/time` exports a version that reads the pinned clock.)
 *
 * @example typeof now() // => 'number'
 */
export function now(): Instant {
  return Date.now()
}

/**
 * Today's date in `zone` (default: the runtime's local zone).
 *
 * @example isPlainDate(today('UTC')) // => true
 */
export function today(zone?: TimeZone): PlainDate {
  return toPlainDate(Date.now(), zone ?? localZone())
}
