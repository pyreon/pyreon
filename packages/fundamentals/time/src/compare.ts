import { startOf, weekStartOption, type WeekOptions } from './arith'
import { badRange, badValue, show } from './errors'
import { packedYearMonth, parseDateAt, parseTimeAt, parseWall, SHAPE_DATE, SHAPE_DT, SHAPE_TIME, SHAPE_YM, shapeOf } from './text'
import type { Comparable, TimeZone, Unit } from './types'
import { Q, unitMs, unitSlot } from './duration'
import { toPlainDateTime } from './zone'

const KINDS = 'a PlainDate, PlainDateTime, PlainYearMonth, PlainTime or Instant'

const SHAPE_NAMES = ['something that is not a date or time', 'a PlainDate', 'a PlainYearMonth', 'a PlainDateTime', 'a PlainTime']

function shapeName(v: unknown): string {
  if (typeof v === 'number') return 'an Instant'

  return typeof v === 'string' ? SHAPE_NAMES[shapeOf(v)]! : 'something that is not a date or time'
}

/** Two values of different shapes: say both, with their shapes, and how to bring them to one shape. */
export function mixedShapes(fn: string, a: unknown, b: unknown): never {
  throw new TypeError(
    `[Pyreon] ${fn}: cannot use ${show(a)} (${shapeName(a)}) together with ${show(b)} (${shapeName(b)}): the shapes differ. Bring both to one shape: add a time to the date (date + 'T00:00'), take the date of the date-time (dt.slice(0, 10)), or convert an Instant with toPlainDateTime(instant, zone).`,
  )
}

function order(a: number, b: number): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

function order2(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Strings of different lengths: only PlainDateTimes and PlainTimes written at different precision can be equal. */
function compareMixed(a: string, b: string): -1 | 0 | 1 {
  const shape = shapeOf(a)

  if (shape !== shapeOf(b)) return mixedShapes('compare', a, b)
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
 * -1, 0 or 1. Same-length strings compare as plain strings (every field is fixed-width and zero-padded); that fast path does
 * not validate, so validate at the boundary with `isPlainDate` and friends. Values written at different precision are parsed.
 *
 * @example compare('2026-11-18', '2026-11-19') // => -1
 * @example compare('14:30', '14:30:00') // => 0
 */
export function compare<T extends Comparable>(a: T, b: T): -1 | 0 | 1 {
  if (typeof a === 'number' && typeof b === 'number') return order(a, b)
  if (typeof a !== 'string' || typeof b !== 'string') return typeof a === typeof b ? badValue('compare', KINDS, a) : mixedShapes('compare', a, b)

  if (a.length !== b.length) return compareMixed(a, b)

  return order2(a, b)
}

/**
 * Whether `a` is strictly before `b`.
 *
 * @example isBefore('2026-01-01', '2026-01-02') // => true
 */
export function isBefore<T extends Comparable>(a: T, b: T): boolean {
  return compare(a, b) < 0
}

/**
 * Whether `a` is strictly after `b`.
 *
 * @example isAfter('2026-01-01', '2026-01-02') // => false
 */
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
 * Options of `isSame`: `weekStart` (ISO weekday) and `zone`, required to compare Instants by a calendar unit.
 *
 * @example const options: IsSameOptions = { zone: 'Europe/Prague' }
 */
export interface IsSameOptions extends WeekOptions {
  zone?: TimeZone
}

/** Instants fall in the same minute, second or millisecond in every zone; larger units depend on the zone. */
function isSameInstant(a: number, b: number, unit: Unit, options: IsSameOptions | undefined): boolean {
  const slot = unitSlot('isSame', unit)

  if (slot >= 5 && slot <= 7) return Math.floor(a / unitMs(slot)) === Math.floor(b / unitMs(slot))
  const zone = options?.zone

  if (zone === undefined) {
    return badRange('isSame', `comparing Instants by "${unit}" needs a time zone, because the calendar ${unit} depends on where you are: isSame(a, b, "${unit}", { zone: "Europe/Prague" }).`)
  }

  return isSame<Comparable>(toPlainDateTime(a, zone), toPlainDateTime(b, zone), unit, options)
}

/**
 * Whether `a` and `b` are the same moment, or, with a `unit`, fall in the same year, month, week, day (or hour, minute,
 * second, millisecond for a PlainDateTime). Two Instants compared by a calendar unit need `options.zone`.
 *
 * @example isSame('2026-11-18', '2026-11-30', 'month') // => true
 * @example isSame(Date.UTC(2026, 10, 18, 22, 30), Date.UTC(2026, 10, 18, 23, 30), 'day', { zone: 'Europe/Prague' }) // => false
 */
export function isSame<T extends Comparable>(a: T, b: T, unit?: Unit, options?: IsSameOptions): boolean {
  if (unit === undefined) return compare(a, b) === 0
  if (typeof a === 'number' && typeof b === 'number') return isSameInstant(a, b, unit, options)
  if (typeof a !== 'string' || typeof b !== 'string') return badValue('isSame', 'two values of the same shape', typeof a === 'string' ? b : a)
  const slot = unitSlot('isSame', unit)

  if (slot === 0 || slot === 1 || slot === Q) {
    const pa = civilOf('isSame', a)
    const pb = civilOf('isSame', b)

    if (slot === Q) return pa >> 9 === pb >> 9 && Math.floor((((pa >> 5) & 15) - 1) / 3) === Math.floor((((pb >> 5) & 15) - 1) / 3)

    return slot === 0 ? pa >> 9 === pb >> 9 : pa >> 5 === pb >> 5
  }
  if (slot === 2) {
    weekStartOption('isSame', options)

    return startOf(a as never, 'week', options) === startOf(b as never, 'week', options)
  }

  return compare(startOf(a as never, unit), startOf(b as never, unit)) === 0
}

/**
 * The earliest value. At least one is required.
 *
 * @example min('2026-03-01', '2026-01-01', '2026-02-01') // => '2026-01-01'
 */
export function min<T extends Comparable>(...values: [T, ...T[]]): T {
  return pick('min', values, -1)
}

/**
 * The latest value. At least one is required.
 *
 * @example max('2026-03-01', '2026-01-01', '2026-02-01') // => '2026-03-01'
 */
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

/**
 * `value` limited to `lo` ... `hi` inclusive. Throws when `lo` is after `hi`.
 *
 * @example clamp('2026-05-01', '2026-01-01', '2026-03-01') // => '2026-03-01'
 */
export function clamp<T extends Comparable>(value: T, lo: T, hi: T): T {
  if (compare(lo, hi) > 0) return badRange('clamp', 'the lower bound is after the upper bound')

  return compare(value, lo) < 0 ? lo : compare(value, hi) > 0 ? hi : value
}
