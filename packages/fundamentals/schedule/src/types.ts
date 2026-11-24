import type { Disambiguation, Duration, Instant, PlainDate, PlainDateTime, PlainTime, TimeZone, Weekday } from '@pyreon/time/core'

export type { Disambiguation, Duration, Instant, PlainDate, PlainDateTime, PlainTime, TimeZone, Weekday }

/** A date (the rule produces dates) or a date-time (the rule produces date-times). */
export type PlainValue = PlainDate | PlainDateTime

/** A weekday, or the n-th such weekday of the month (or year): `{ weekday: 5, nth: -1 }` is the last Friday. */
export type WeekdaySpec = Weekday | { readonly weekday: Weekday; readonly nth: number }

/** The BY* parts of a rule, all optional and combined as in RFC 5545. */
export interface RecurrenceParts {
  /** ISO weekdays 1 to 7, or `{ weekday, nth }` (nth 1 to 5 or -1 to -5 within the month; up to 53 within a year). */
  weekdays?: readonly WeekdaySpec[]
  /** 1 to 31 or -1 to -31 (counted from the end of the month). */
  monthDays?: readonly number[]
  /** 1 to 12. */
  months?: readonly number[]
  /** 1 to 366 or -1 to -366. */
  yearDays?: readonly number[]
  /** Week numbers 1 to 53 or -1 to -53, with the rule's `weekStart` (yearly rules only). */
  weeks?: readonly number[]
  /** 0 to 23. */
  hours?: readonly number[]
  /** 0 to 59. */
  minutes?: readonly number[]
  /** BYSETPOS: keep only these positions (1-based, or negative from the end) of each period's occurrences. */
  position?: readonly number[]
}

/**
 * A repeating rule as plain data. Field names follow iCalendar RRULE (RFC 5545); values follow `@pyreon/time` (ISO weekday
 * 1 to 7, month 1 to 12). Times are wall-clock times; a zone is needed only to turn occurrences into instants.
 */
export interface Recurrence {
  /** FREQ. */
  every: 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute'
  /** Every N periods. Default 1. */
  interval?: number
  /** The BY* parts. */
  on?: RecurrenceParts
  /** DTSTART. A date makes the rule produce dates; a date-time makes it produce date-times. */
  start: PlainValue
  /** Inclusive end. A date means the whole of that day. Exclusive with `count`. */
  until?: PlainValue
  /** Total number of occurrences of the rule (dates in `except` still count). Exclusive with `until`. */
  count?: number
  /** WKST, the first day of the week. Default 1 (Monday). */
  weekStart?: Weekday
  /** EXDATE: occurrences to leave out. */
  except?: readonly PlainValue[]
  /** RDATE: extra occurrences. */
  also?: readonly PlainValue[]
  /** The zone the wall clock is in. */
  timeZone?: TimeZone
}

/** Bounds of an expansion. A date bound means the whole day. */
export interface OccurrenceRange {
  /** First occurrence wanted (inclusive). */
  from?: PlainValue
  /** Last occurrence wanted (inclusive). */
  to?: PlainValue
  /** At most this many occurrences. */
  limit?: number
}

/** A half-open interval `[start, end)`. */
export interface Interval<T = PlainDateTime> {
  start: T
  end: T
}

/** An opening window. A window whose `to` is not after its `from` runs overnight into the next day. */
export interface OpeningWindow {
  readonly from: PlainTime
  readonly to: PlainTime
}

/** Opening windows by ISO weekday. A window whose `to` is not after its `from` runs overnight into the next day. */
export type WorkingHours = { readonly [W in Weekday]?: readonly OpeningWindow[] }

/**
 * Opening windows of particular dates: a map from date to windows, or a function that returns a date's windows (or
 * `undefined` for the usual hours). An empty list closes the date.
 */
export type SpecialHours = { readonly [date: PlainDate]: readonly OpeningWindow[] } | ((date: PlainDate) => readonly OpeningWindow[] | undefined)

/** Business days and opening hours. No holiday data is shipped. */
export interface BusinessCalendar {
  /** Weekdays that are not business days. Default `[6, 7]`. */
  weekend?: readonly Weekday[]
  /** Opening windows; required by the business-time functions, ignored by the business-day ones. */
  hours?: WorkingHours
  /** A list of dates, or a predicate that says whether a date is a holiday. */
  holidays?: readonly PlainDate[] | ((date: PlainDate) => boolean)
  /**
   * A date's own opening windows (a shortened day before a holiday, a Sunday opening). They replace that weekday's
   * `hours` and decide the date over `weekend` and `holidays`: a date with windows here is open even on a weekend or a
   * holiday, and an empty list closes it. Business-day functions treat a date with windows as a business day.
   */
  specialHours?: SpecialHours
  /** Informational: the zone the wall clock is in. */
  timeZone?: TimeZone
}
