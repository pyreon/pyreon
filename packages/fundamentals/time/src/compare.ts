import { startOf, weekStartOption, type WeekOptions } from './arith'
import { badRange, badValue } from './errors'
import { packedYearMonth, parseDateAt, parseTimeAt, parseWall, SHAPE_DATE, SHAPE_DT, SHAPE_TIME, SHAPE_YM, shapeOf } from './text'
import type { Comparable, Unit } from './types'
import { unitSlot } from './duration'

const KINDS = 'a PlainDate, PlainDateTime, PlainYearMonth, PlainTime or Instant'

function order(a: number, b: number): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

function order2(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Strings of different lengths: only PlainDateTimes and PlainTimes written at different precision can be equal. */
function compareMixed(a: string, b: string): -1 | 0 | 1 {
  const shape = shapeOf(a)

  if (shape !== shapeOf(b)) return badValue('compare', 'two values of the same shape', b)
  if (shape === SHAPE_DT) {
    const wa = parseWall(a)
    const wb = parseWall(b)

    return Number.isNaN(wa) || Number.isNaN(wb) ? badValue('compare', 'two PlainDateTimes', Number.isNaN(wa) ? a : b) : order(wa, wb)
  }
  if (shape === SHAPE_TIME) {
    const ta = parseTimeAt(a, 0)
    const tb = parseTimeAt(b, 0)

    return ta < 0 || tb < 0 ? badValue('compare', 'two PlainTimes', ta < 0 ? a : b) : order(ta, tb)
  }

  return badValue('compare', KINDS, a)
}

/**
 * -1, 0 or 1. Two values of the same shape and the same length (the common case) compare as plain strings, which is
 * correct because every field is fixed-width and zero-padded; that fast path does not validate, so validate at the
 * boundary with `isPlainDate` and friends. Values written at different precision (`'14:30'` and `'14:30:00'`) are parsed.
 */
export function compare<T extends Comparable>(a: T, b: T): -1 | 0 | 1 {
  if (typeof a === 'number' && typeof b === 'number') return order(a, b)
  if (typeof a !== 'string' || typeof b !== 'string') return badValue('compare', KINDS, typeof a === 'string' ? b : a)

  if (a.length !== b.length) return compareMixed(a, b)

  return order2(a, b)
}

export function isBefore<T extends Comparable>(a: T, b: T): boolean {
  return compare(a, b) < 0
}

export function isAfter<T extends Comparable>(a: T, b: T): boolean {
  return compare(a, b) > 0
}

/** Epoch day of a date-ish string for the unit comparison in `isSame`. */
function civilOf(fn: string, v: string): number {
  const shape = shapeOf(v)

  if (shape === SHAPE_YM) return packedYearMonth(fn, v)
  if ((shape === SHAPE_DATE || shape === SHAPE_DT) && parseDateAt(v) >= 0) return parseDateAt(v)

  return badValue(fn, 'a PlainDate, PlainDateTime or PlainYearMonth when a unit is given', v)
}

/**
 * Whether `a` and `b` are the same moment, or, with a `unit`, fall in the same year, month, week or day (or hour, minute,
 * second, millisecond for a PlainDateTime).
 */
export function isSame<T extends Comparable>(a: T, b: T, unit?: Unit, options?: WeekOptions): boolean {
  if (unit === undefined) return compare(a, b) === 0
  if (typeof a !== 'string' || typeof b !== 'string') return badRange('isSame', 'a unit needs PlainDate, PlainDateTime or PlainYearMonth values, not Instants')
  const slot = unitSlot('isSame', unit)

  if (slot === 0 || slot === 1) {
    const pa = civilOf('isSame', a)
    const pb = civilOf('isSame', b)

    return slot === 0 ? pa >> 9 === pb >> 9 : pa >> 5 === pb >> 5
  }
  if (slot === 2) {
    weekStartOption('isSame', options)

    return startOf(a as never, 'week', options) === startOf(b as never, 'week', options)
  }

  return compare(startOf(a as never, unit), startOf(b as never, unit)) === 0
}

/** The earliest value. At least one is required. */
export function min<T extends Comparable>(...values: [T, ...T[]]): T {
  return pick('min', values, -1)
}

/** The latest value. At least one is required. */
export function max<T extends Comparable>(...values: [T, ...T[]]): T {
  return pick('max', values, 1)
}

function pick<T extends Comparable>(fn: string, values: readonly T[], direction: -1 | 1): T {
  if (values.length === 0) return badRange(fn, 'needs at least one value')
  let best = values[0]!

  for (let i = 1; i < values.length; i++) {
    if (compare(values[i]!, best) === direction) best = values[i]!
  }

  return best
}

/** `value` limited to the range `lo` ... `hi` (inclusive). */
export function clamp<T extends Comparable>(value: T, lo: T, hi: T): T {
  if (compare(lo, hi) > 0) return badRange('clamp', 'the lower bound is after the upper bound')

  return compare(value, lo) < 0 ? lo : compare(value, hi) > 0 ? hi : value
}
