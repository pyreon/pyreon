/**
 * Epoch milliseconds, the same number as `Date.now()`.
 *
 * @example const t: Instant = Date.UTC(2026, 10, 18)
 */
export type Instant = number

/**
 * `2026-11-18`: zero-padded, proleptic Gregorian, years 0001-9999, month 01-12. Looser than the runtime check at the type level.
 *
 * @example const d: PlainDate = '2026-11-18'
 */
export type PlainDate = `${number}-${number}-${number}`

/**
 * `2026-11` (month 01-12).
 *
 * @example const ym: PlainYearMonth = '2026-11'
 */
export type PlainYearMonth = `${number}-${number}`

/**
 * `14:30`, `14:30:05` or `14:30:05.250` (one to three fraction digits).
 *
 * @example const t: PlainTime = '14:30'
 */
export type PlainTime = `${number}:${number}` | `${number}:${number}:${number}` | `${number}:${number}:${number}.${number}`

/**
 * A PlainDate and a PlainTime joined by an upper-case `T`. No offset and no zone name.
 *
 * @example const dt: PlainDateTime = '2026-11-18T14:30'
 */
export type PlainDateTime = `${PlainDate}T${PlainTime}`

/**
 * An IANA zone name (`Europe/Prague`) or `UTC`.
 *
 * @example const zone: TimeZone = 'Europe/Prague'
 */
export type TimeZone = string

/**
 * ISO weekday: 1 is Monday ... 7 is Sunday.
 *
 * @example const sunday: Weekday = 7
 */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * `'year' | 'month' | 'week' | 'day'`.
 *
 * @example const unit: DateUnit = 'week'
 */
export type DateUnit = 'year' | 'quarter' | 'month' | 'week' | 'day'

/**
 * `'hour' | 'minute' | 'second' | 'millisecond'`.
 *
 * @example const unit: TimeUnit = 'minute'
 */
export type TimeUnit = 'hour' | 'minute' | 'second' | 'millisecond'

/**
 * Singular unit names; a plural such as `'days'` is a programmer error and throws.
 *
 * @example const unit: Unit = 'day'
 */
export type Unit = DateUnit | TimeUnit

/**
 * A span of time. Years and months are whole numbers; weeks to seconds may be fractional and balance down; milliseconds are
 * whole. Every non-zero field shares one sign.
 *
 * @example const d: Duration = { months: 1, days: 2 }
 */
export interface Duration {
  years?: number | undefined
  months?: number | undefined
  weeks?: number | undefined
  days?: number | undefined
  hours?: number | undefined
  minutes?: number | undefined
  seconds?: number | undefined
  milliseconds?: number | undefined
}

/**
 * A value-to-same-value function, what `add({ months: 1 })` from `@pyreon/time/fp` returns.
 *
 * @example const month: Adjuster<PlainDate> = (d) => d
 */
export type Adjuster<T> = (value: T) => T

/**
 * A value-to-other-value function, such as `toPlainDate(zone)` from `@pyreon/time/fp`.
 *
 * @example const length: Mapper<string, number> = (s) => s.length
 */
export type Mapper<A, B> = (value: A) => B

/**
 * How a wall-clock time in a DST gap or overlap picks an instant (Temporal's modes).
 *
 * @example const mode: Disambiguation = 'reject'
 */
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
