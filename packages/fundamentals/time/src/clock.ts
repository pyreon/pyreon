import { toPlainDate } from './zone'
import { localZone } from './interop'
import type { Instant, PlainDate, TimeZone } from './types'

/** The pinned clock, or `null` for the system clock. One reference, never a collection. */
let source: (() => Instant) | null = null

/**
 * Pin the clock `now()` and `today()` read, for tests and previews; `null` restores the system clock. The source may read
 * signals, in which case a `now()` inside an effect tracks them. This is process-wide state: do not call it per request
 * on a server (a request-scoped clock comes with the clocks release).
 */
export function setClock(clock: (() => Instant) | null): void {
  source = clock
}

/** The current instant: `Date.now()`, or the pinned clock's value. */
export function now(): Instant {
  return source === null ? Date.now() : source()
}

/** Today's date in `zone` (default: the runtime's local zone), read from the pinned clock when one is set. */
export function today(zone?: TimeZone): PlainDate {
  return toPlainDate(now(), zone ?? localZone())
}
