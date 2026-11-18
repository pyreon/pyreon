import { badRange, badValue } from './errors'
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

function put(fn: string, key: string, slot: number, v: number | undefined, sign: number): void {
  if (v === undefined) {
    dur[slot] = 0

    return
  }
  if (!Number.isInteger(v)) badRange(fn, `duration.${key} must be an integer, got ${v}. Whole units only: use milliseconds for a finer step.`)
  dur[slot] = v * sign + 0
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
  put(fn, 'years', Y, d.years, sign)
  put(fn, 'months', MO, d.months, sign)
  put(fn, 'weeks', W, d.weeks, sign)
  put(fn, 'days', D, d.days, sign)
  put(fn, 'hours', H, d.hours, sign)
  put(fn, 'minutes', MI, d.minutes, sign)
  put(fn, 'seconds', S, d.seconds, sign)
  put(fn, 'milliseconds', MS, d.milliseconds, sign)
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
      return badRange(fn, `unknown unit ${JSON.stringify(unit)}. Use year, month, week, day, hour, minute, second or millisecond (singular).`)
  }
}

/** Length of a fixed unit in milliseconds (`week` is seven 24-hour days; `year` and `month` are not fixed: 0). */
export function unitMs(slot: number): number {
  return MS_PER_UNIT[slot]!
}

/**
 * The length of a duration in milliseconds. Only fixed-length fields count: a week is seven 24-hour days and a day is
 * 24 hours. Months and years have no fixed length, so they throw.
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
