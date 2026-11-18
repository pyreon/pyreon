import { badRange, badValue, show } from './errors'
import type { Duration, Unit } from './types'

/** Slots of the normalised duration in `dur`. */
export const Y = 0
export const MO = 1
export const W = 2
export const D = 3
export const H = 4
export const MI = 5
export const S = 6
export const MS = 7

/**
 * The most recently loaded duration, signed. A module-level scratch buffer of fixed size (not a cache: nothing grows,
 * nothing is evicted) so a hot `add` neither allocates a normalised copy nor spreads the caller's object. It is only
 * read synchronously after `loadDuration`, and nothing between the two calls can re-enter.
 */
export const dur = new Float64Array(8)

const MS_PER_UNIT = [0, 0, 604_800_000, 86_400_000, 3_600_000, 60_000, 1000, 1]

/** Milliseconds carried by the fractional part of weeks, days, hours, minutes and seconds in the duration being loaded. */
let fractionMs = 0

/**
 * One field of the duration. Years and months must be whole (a fractional month has no fixed length). Weeks, days, hours,
 * minutes and seconds may be fractional: the whole part stays in its field and the fraction becomes milliseconds
 * (`{ days: 1.5 }` is one day and twelve hours), rounded to the nearest millisecond once all fields are read. Milliseconds
 * must be whole.
 */
function put(fn: string, key: string, slot: number, v: number | undefined, sign: number): void {
  if (v === undefined) {
    dur[slot] = 0

    return
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    badRange(fn, `duration.${key} must be a finite number, got ${show(v)}. Use whole numbers such as { ${key}: 2 }.`)
  }
  const whole = Math.trunc(v)

  if (whole !== v) {
    if (slot === Y || slot === MO) {
      badRange(fn, `duration.${key} must be a whole number, got ${v}: a fractional ${key === 'years' ? 'year' : 'month'} has no fixed length (months are 28 to 31 days). Use { days } or { weeks } for a fraction of a month, or { months: 1, days: 15 }.`)
    }
    if (slot === MS) badRange(fn, `duration.milliseconds must be a whole number, got ${v}: the finest unit is one millisecond.`)
    fractionMs += (v - whole) * unitMs(slot) * sign
  }
  dur[slot] = whole * sign + 0
}

const DURATION_KEYS = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds']

function warnUnknownKeys(fn: string, d: Duration): void {
  for (const key in d) {
    if (!DURATION_KEYS.includes(key) && process.env.NODE_ENV !== 'production') {
      console.warn(`[Pyreon] ${fn}: unknown duration field "${key}" is ignored. Use ${DURATION_KEYS.join(', ')}.`)
    }
  }
}

/**
 * Validate `d` and load it, multiplied by `sign`, into `dur`. Every field must be an integer and all non-zero fields must
 * share one sign (Temporal's rule), otherwise `{ months: 1, days: -1 }` would have no single meaning. Returns the
 * duration's sign: -1, 0 or 1.
 */
export function loadDuration(fn: string, d: Duration, sign: number): number {
  if (d === null || typeof d !== 'object') return badValue(fn, 'a Duration such as { days: 1 }', d)
  fractionMs = 0
  put(fn, 'years', Y, d.years, sign)
  put(fn, 'months', MO, d.months, sign)
  put(fn, 'weeks', W, d.weeks, sign)
  put(fn, 'days', D, d.days, sign)
  put(fn, 'hours', H, d.hours, sign)
  put(fn, 'minutes', MI, d.minutes, sign)
  put(fn, 'seconds', S, d.seconds, sign)
  put(fn, 'milliseconds', MS, d.milliseconds, sign)
  if (fractionMs !== 0) dur[MS] = dur[MS]! + Math.round(fractionMs)
  if (process.env.NODE_ENV !== 'production') warnUnknownKeys(fn, d)

  return durationSign(fn)
}

function durationSign(fn: string): number {
  let pos = false
  let neg = false

  for (let i = 0; i < 8; i++) {
    const v = dur[i]!

    if (v > 0) pos = true
    else if (v < 0) neg = true
  }
  if (pos && neg) {
    badRange(fn, 'a duration cannot mix positive and negative fields ({ months: 1, days: -1 }). Pass one sign, or call add and subtract separately.')
  }

  return pos ? 1 : neg ? -1 : 0
}

/** Total of the loaded time fields (hours down to milliseconds) in milliseconds. */
export function loadedTimeMs(): number {
  return dur[H]! * 3_600_000 + dur[MI]! * 60_000 + dur[S]! * 1000 + dur[MS]!
}

export function hasLoadedTime(): boolean {
  return dur[H]! !== 0 || dur[MI]! !== 0 || dur[S]! !== 0 || dur[MS]! !== 0
}

/** The unit slot (0 year ... 7 millisecond) of a unit name; unknown names are a programmer error. */
export function unitSlot(fn: string, unit: Unit): number {
  switch (unit) {
    case 'year':
      return Y
    case 'month':
      return MO
    case 'week':
      return W
    case 'day':
      return D
    case 'hour':
      return H
    case 'minute':
      return MI
    case 'second':
      return S
    case 'millisecond':
      return MS
    default:
      return badRange(fn, `unknown unit ${show(unit)}. Use year, month, week, day, hour, minute, second or millisecond (singular).`)
  }
}

/** Length of a fixed unit in milliseconds (`week` is seven 24-hour days; `year` and `month` are not fixed: 0). */
export function unitMs(slot: number): number {
  return MS_PER_UNIT[slot]!
}

/**
 * The length of a duration in milliseconds. A week is seven 24-hour days and a day is 24 hours; years and months have no
 * fixed length and throw.
 *
 * @example toMilliseconds({ hours: 1, minutes: 30 }) // => 5400000
 * @example toMilliseconds({ days: 1.5 }) // => 129600000
 */
export function toMilliseconds(duration: Duration): number {
  loadDuration('toMilliseconds', duration, 1)
  if (dur[Y] !== 0 || dur[MO] !== 0) {
    badRange(
      'toMilliseconds',
      'years and months have no fixed length (a month is 28 to 31 days). Use diff(a, b, unit) between two dates, or addInstant(instant, duration, zone) to move an instant.',
    )
  }

  return dur[W]! * 604_800_000 + dur[D]! * 86_400_000 + loadedTimeMs()
}
