import { now, timeZone, useNow } from '@pyreon/ambient'
import type { Every } from '@pyreon/ambient'
import { badValue } from './errors'
import { relativeDistance, type RelativeDistance } from './relative'
import { toInstant, toPlainDate } from './zone'
import type { Duration, Instant, PlainDate, PlainDateTime, TimeZone } from './types'

/** A moment a clock hook can aim at: an Instant, a `Date`, or a wall-clock value read in the zone. */
export type When = Instant | Date | PlainDate | PlainDateTime

/** Options shared by the clock hooks. */
export interface ClockOptions {
  /** The zone wall-clock targets are read in and day boundaries are counted in. Default: the active time zone, tracked. */
  zone?: TimeZone
}

/** Options of `useCountdown` and `useElapsed`. */
export interface TickOptions extends ClockOptions {
  /** How often to update. Default `'second'`. */
  every?: Every
}

function instantOf(fn: string, value: unknown, zone: TimeZone): Instant {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime()
  if (typeof value === 'string') return toInstant(value as PlainDate, zone)

  return badValue(fn, 'an Instant (epoch milliseconds), a Date, a PlainDate or a PlainDateTime', value)
}

const zoneOf = (zone: TimeZone | undefined): TimeZone => zone ?? timeZone()

/**
 * Today's date as a reactive accessor that flips at local midnight of the zone (default: the active zone), on one shared
 * ticker, correct on 23- and 25-hour days. Call it in a component's setup.
 *
 * @example typeof useToday('Europe/Prague') // => 'function'
 */
export function useToday(zone?: TimeZone): () => PlainDate {
  const n = useNow({ every: 'day', ...(zone === undefined ? {} : { zone }) })

  return () => toPlainDate(n(), zoneOf(zone))
}

/** `useCountdown`'s result. */
export interface Countdown {
  /** The time left as whole days, hours, minutes, seconds and milliseconds; all zero once the target has passed. */
  remaining: () => Duration
  /** The milliseconds left (0 once the target has passed). */
  totalMs: () => number
  /** True once the target has passed. */
  done: () => boolean
}

function parts(ms: number): Duration {
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
    milliseconds: ms % 1000,
  }
}

/**
 * A countdown to `target`: the time left in days to milliseconds, updating every second by default on a shared ticker (many
 * countdowns, one timer). A PlainDateTime target is a wall-clock time in the zone. Call it in a component's setup.
 *
 * @example typeof useCountdown(Date.UTC(2031, 0, 1)).done // => 'function'
 */
export function useCountdown(target: When | (() => When), options?: TickOptions): Countdown {
  const n = useNow({ every: options?.every ?? 'second', ...(options?.zone === undefined ? {} : { zone: options.zone }) })
  const left = (): number => Math.max(0, instantOf('useCountdown', typeof target === 'function' ? target() : target, zoneOf(options?.zone)) - n())

  return { remaining: () => parts(left()), totalMs: left, done: () => left() === 0 }
}

/**
 * The stopwatch counterpart: the time since `since` in days to milliseconds (zero before it), updating every second by
 * default.
 *
 * @example typeof useElapsed(Date.UTC(2020, 0, 1)) // => 'function'
 */
export function useElapsed(since: When | (() => When), options?: TickOptions): () => Duration {
  const n = useNow({ every: options?.every ?? 'second', ...(options?.zone === undefined ? {} : { zone: options.zone }) })

  return () => parts(Math.max(0, n() - instantOf('useElapsed', typeof since === 'function' ? since() : since, zoneOf(options?.zone))))
}

/**
 * The structured relative distance to `target`, self-updating: `{ value: -2, unit: 'minute' }`. Calendar-true from a day on
 * (yesterday is literally yesterday in the zone). The cadence adapts to the distance, on shared tickers: every second under a
 * minute, every minute under an hour, every hour under a day, then at local midnight; as the distance grows the reader moves
 * to the slower ticker, so an old timestamp never holds a per-second timer, and 200 labels share one ticker. A displayed
 * value can lag the true boundary by up to one tick of its ticker. Text is not produced here: `@pyreon/format` turns
 * `{ value, unit }` into words. Call it in a component's setup.
 *
 * @example typeof useRelative(Date.now() - 60_000) // => 'function'
 */
export function useRelative(target: When | (() => When), options?: ClockOptions): () => RelativeDistance {
  let read: (() => number) | undefined
  const targetNow = (zone: TimeZone): Instant => instantOf('useRelative', typeof target === 'function' ? target() : target, zone)
  const cadence = (): Every => {
    const away = Math.abs(targetNow(zoneOf(options?.zone)) - (read === undefined ? now() : read()))

    if (away < 60_000) return 'second'
    if (away < 3_600_000) return 'minute'

    return away < 86_400_000 ? 'hour' : 'day'
  }
  const n = useNow({ every: cadence, ...(options?.zone === undefined ? {} : { zone: options.zone }) })

  read = n

  return () => relativeDistance(targetNow(zoneOf(options?.zone)), n(), zoneOf(options?.zone))
}
