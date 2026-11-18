import { add } from './arith'
import { isTimeZone, toInstant, toPlainDate, toPlainDateTime, toPlainTime, addInstant, offsetAt } from './zone'
import { badRange } from './errors'
import type { Disambiguation, Duration, Instant, PlainDate, PlainDateTime, PlainTime, TimeZone } from './types'

/** The zone-taking functions with one zone applied. Every member is a plain function created once by `inZone`. */
export interface ZonedToolkit {
  readonly zone: TimeZone
  /** Today's date in the zone (`Date.now()`). */
  today: () => PlainDate
  toInstant: (value: PlainDate | PlainDateTime, options?: { disambiguation?: Disambiguation }) => Instant
  toPlainDate: (instant: Instant) => PlainDate
  toPlainTime: (instant: Instant) => PlainTime
  toPlainDateTime: (instant: Instant) => PlainDateTime
  addInstant: (instant: Instant, duration: Duration) => Instant
  offsetAt: (instant: Instant) => number
  /** The instant of local midnight at the start of the day containing `instant`. */
  startOfDay: (instant: Instant) => Instant
  /** The last millisecond of the local day containing `instant`. */
  endOfDay: (instant: Instant) => Instant
}

/**
 * The zone-taking functions bound to `zone`, for code that works in one zone. Create it once (module scope or a setup
 * function) and call the members; a call does no more work than the unbound function. The zone is validated here, so a typo
 * fails at the `inZone` call and not at some later conversion. Importing it pulls every zone function into the bundle.
 */
export function inZone(zone: TimeZone): ZonedToolkit {
  if (!isTimeZone(zone)) {
    return badRange('inZone', `unknown time zone ${JSON.stringify(zone)}. Use an IANA name such as "Europe/Prague" or "UTC"; check user input with isTimeZone().`)
  }
  const startOfDay = (instant: Instant): Instant => toInstant(toPlainDate(instant, zone), zone)

  return {
    zone,
    today: () => toPlainDate(Date.now(), zone),
    toInstant: (value, options) => toInstant(value, zone, options),
    toPlainDate: (instant) => toPlainDate(instant, zone),
    toPlainTime: (instant) => toPlainTime(instant, zone),
    toPlainDateTime: (instant) => toPlainDateTime(instant, zone),
    addInstant: (instant, duration) => addInstant(instant, duration, zone),
    offsetAt: (instant) => offsetAt(instant, zone),
    startOfDay,
    endOfDay: (instant) => toInstant(add(toPlainDate(instant, zone), { days: 1 }), zone) - 1,
  }
}

