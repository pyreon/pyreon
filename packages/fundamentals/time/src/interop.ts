import { badValue } from './errors'
import { strictInstantText } from './lenient'
import { parseDateAt, parseWall, SHAPE_DATE, SHAPE_DT, shapeOf } from './text'
import { toInstant, toPlainDateTime } from './zone'
import type { Instant, PlainDate, PlainDateTime, TimeZone } from './types'

/**
 * The runtime's own time zone name (`'UTC'` when the platform cannot say).
 *
 * @example typeof localZone() // => 'string'
 */
export function localZone(): TimeZone {
  return new Intl.DateTimeFormat('en-US').resolvedOptions().timeZone || 'UTC'
}

/**
 * The wall-clock date and time of a `Date` in `zone` (default: the runtime's local zone).
 *
 * @example fromDate(new Date(Date.UTC(2026, 10, 18, 13, 30)), 'Europe/Prague') // => '2026-11-18T14:30'
 */
export function fromDate(date: Date, zone?: TimeZone): PlainDateTime {
  const t = date instanceof Date ? date.getTime() : Number.NaN

  if (Number.isNaN(t)) return badValue('fromDate', 'a valid Date', date)

  return toPlainDateTime(t, zone ?? localZone())
}

/**
 * A `Date` for an Instant, or for a wall-clock value in `zone` (default: the runtime's local zone, like `new Date(y, m, d)`).
 *
 * @example toDate('2026-11-18T14:30', 'Europe/Prague').toISOString() // => '2026-11-18T13:30:00.000Z'
 */
export function toDate(value: PlainDate | PlainDateTime | Instant, zone?: TimeZone): Date {
  if (typeof value === 'number') return new Date(value)
  const shape = typeof value === 'string' ? shapeOf(value) : -1

  if ((shape === SHAPE_DATE && parseDateAt(value) >= 0) || (shape === SHAPE_DT && !Number.isNaN(parseWall(value)))) {
    return new Date(toInstant(value, zone ?? localZone()))
  }

  return badValue('toDate', 'a PlainDate, PlainDateTime or Instant', value)
}

/** ISO 8601 with a `Z` or `+hh:mm` offset (`2026-11-18T14:30:05.123Z`), fraction of 1 to 9 digits (truncated to milliseconds). */
const MS_FRACTION_MAX = 9

function digits(s: string, at: number, n: number): number {
  let v = 0

  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(at + i) - 48

    if (c >>> 0 > 9) return -1
    v = v * 10 + c
  }

  return v
}

/** Offset (`Z`, `+hh:mm`, `-hh:mm`) starting at `at`, in milliseconds east of UTC, or NaN. */
function parseOffset(s: string, at: number): number {
  if (s.length - at === 1) return s.charCodeAt(at) === 90 ? 0 : Number.NaN
  if (s.length - at !== 6 || s.charCodeAt(at + 3) !== 58) return Number.NaN
  const sign = s.charCodeAt(at) === 43 ? 1 : s.charCodeAt(at) === 45 ? -1 : 0
  const h = digits(s, at + 1, 2)
  const m = digits(s, at + 4, 2)

  return sign === 0 || h < 0 || m < 0 || h > 23 || m > 59 ? Number.NaN : sign * (h * 3_600_000 + m * 60_000)
}

/**
 * Parse an ISO 8601 timestamp that names its offset into an Instant, or `null`. Strict by default; `{ lenient: true }` also
 * accepts a space or lower-case `t` and `z`, `+0100` and `+01` offsets, missing seconds and unpadded fields. Never throws.
 *
 * @example parseInstant('2026-11-18T14:30:05Z') // => Date.UTC(2026, 10, 18, 14, 30, 5)
 * @example parseInstant('2026-11-18 14:30:05+0100', { lenient: true }) // => Date.UTC(2026, 10, 18, 13, 30, 5)
 */
export function parseInstant(text: string, options?: ParseInstantOptions): Instant | null {
  if (typeof text !== 'string') return null
  if (options?.lenient === true) return parseStrictInstant(strictInstantText(text) ?? text)

  return parseStrictInstant(text)
}

/**
 * Options of `parseInstant`: `lenient` (default false).
 *
 * @example const options: ParseInstantOptions = { lenient: true }
 */
export interface ParseInstantOptions {
  /** Also accept a space or lower-case `t`/`z`, `+0100` and `+01` offsets, missing seconds and unpadded fields. Default false. */
  lenient?: boolean
}

function parseStrictInstant(text: string): Instant | null {
  if (text.length < 20) return null
  const wall = parseWall(text.slice(0, 19))
  let at = 19
  let ms = 0

  if (Number.isNaN(wall) || text.length < 20) return null
  if (text.charCodeAt(at) === 46) {
    let n = 0

    while (n < MS_FRACTION_MAX && digits(text, at + 1 + n, 1) >= 0) n++
    if (n === 0) return null
    ms = digits(text, at + 1, Math.min(n, 3)) * 10 ** (3 - Math.min(n, 3))
    at += 1 + n
  }
  const offset = parseOffset(text, at)

  return Number.isNaN(offset) ? null : wall + ms - offset
}
