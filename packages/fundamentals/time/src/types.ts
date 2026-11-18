/**
 * Epoch milliseconds, the same number as `Date.now()`. Natively (PMTC) a date is also epoch milliseconds, so an
 * `Instant` crosses the web/native line unchanged.
 */
export type Instant = number

/** `2026-11-18`: zero-padded, proleptic Gregorian, years 0001-9999. */
export type PlainDate = `${number}-${number}-${number}`

/** `2026-11`. */
export type PlainYearMonth = `${number}-${number}`

/** `14:30`, `14:30:05` or `14:30:05.250` (one to three fraction digits). */
export type PlainTime = `${number}:${number}` | `${number}:${number}:${number}` | `${number}:${number}:${number}.${number}`

/** A PlainDate and a PlainTime joined by an upper-case `T`: `2026-11-18T14:30`. No offset and no zone name. */
export type PlainDateTime = `${PlainDate}T${PlainTime}`

/** An IANA zone name (`Europe/Prague`) or `UTC`. */
export type TimeZone = string

/** ISO weekday: 1 is Monday, 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type DateUnit = 'year' | 'month' | 'week' | 'day'

export type TimeUnit = 'hour' | 'minute' | 'second' | 'millisecond'

export type Unit = DateUnit | TimeUnit

/**
 * A span of time. Every field is an integer, and every non-zero field shares one sign (`{ days: 1, hours: -2 }` is
 * rejected, as in Temporal). Use `subtract` to go backwards rather than negating by hand.
 */
export interface Duration {
  years?: number
  months?: number
  weeks?: number
  days?: number
  hours?: number
  minutes?: number
  seconds?: number
  milliseconds?: number
}

/** How a wall-clock time that falls in a DST gap or overlap picks an instant (Temporal's `disambiguation`). */
export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject'

/** Any value `add`, `startOf`, `endOf` and `eachDay`-style helpers work on. */
export type PlainValue = PlainDate | PlainDateTime | PlainYearMonth

/** Every string shape `compare`, `min`, `max` and `clamp` order. */
export type Comparable = PlainDate | PlainDateTime | PlainYearMonth | PlainTime | Instant

/** The shape a polymorphic function hands back: a literal input still yields the shape, not the literal. */
export type ShapeOf<T> = T extends PlainDateTime
  ? PlainDateTime
  : T extends PlainDate
    ? PlainDate
    : T extends PlainYearMonth
      ? PlainYearMonth
      : T extends PlainTime
        ? PlainTime
        : T extends number
          ? Instant
          : never
