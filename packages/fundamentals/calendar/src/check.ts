import { isTimeZone } from '@pyreon/time/core'
import type { Interval, PlainDate, TimeZone } from './types'

/** A short, safe rendering of a value for an error message. */
export function show(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value)
  if (Array.isArray(value)) return `an array of ${value.length}${value.length > 0 ? ` (first: ${show(value[0])})` : ''}`
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value)

    return `an object with the keys ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ', …' : ''}`
  }

  return String(value)
}

/** Throw `[Pyreon] <function>: <argument> must be <expected>, got <value>` plus how to fix it. */
export function bad(fn: string, argument: string, expected: string, got: unknown, fix?: string): never {
  throw new TypeError(`[Pyreon] ${fn}: ${argument} must be ${expected}, got ${show(got)}.${fix === undefined ? '' : ` ${fix}`}`)
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const isDateString = (v: unknown): v is PlainDate => typeof v === 'string' && DATE.test(v)

/** Does it look like the object `visibleRange()` returns? */
export function isShown(v: unknown): v is { range: Interval<PlainDate>; dates: readonly PlainDate[]; rows: readonly (readonly PlainDate[])[] } {
  return isObject(v) && isObject(v.range) && Array.isArray(v.dates) && Array.isArray(v.rows)
}

function sibling(got: unknown): string | undefined {
  if (isShown(got)) return 'That is the result of visibleRange(): its fields are range, dates and rows.'
  if (Array.isArray(got) && got.length > 0 && isObject(got[0]) && typeof got[0].key === 'string') return 'That is a list of occurrences (from expandOccurrences()).'

  return undefined
}

export function checkDate(fn: string, argument: string, v: unknown): PlainDate {
  if (!isDateString(v)) return bad(fn, argument, 'a date like "2026-11-18"', v, sibling(v))

  return v
}

export function checkZone(fn: string, argument: string, v: unknown): TimeZone {
  if (typeof v !== 'string' || !isTimeZone(v)) return bad(fn, argument, 'an IANA time zone name like "Europe/Prague"', v, sibling(v))

  return v
}

/** A window: `{ start, end }` of dates, or the object `visibleRange()` returns (its `range` is used). */
export function toRange(fn: string, argument: string, v: unknown): Interval<PlainDate> {
  const range = isShown(v) ? v.range : v
  if (!isObject(range) || !isDateString(range.start) || !isDateString(range.end)) {
    return bad(fn, argument, 'a window { start, end } of dates (end exclusive), or the result of visibleRange()', v, sibling(v) ?? 'Pass visibleRange(view, date).range, or the whole result.')
  }
  if (range.end < range.start) return bad(fn, argument, 'a window that ends after it starts', v)

  return range as unknown as Interval<PlainDate>
}

export function checkOccurrences(fn: string, argument: string, v: unknown): void {
  if (!Array.isArray(v)) return bad(fn, argument, 'an array of occurrences from expandOccurrences()', v, sibling(v))
  const first = v[0]
  if (first !== undefined && !(isObject(first) && typeof first.key === 'string' && typeof first.startMs === 'number' && typeof first.endMs === 'number')) {
    bad(fn, argument, 'an array of occurrences from expandOccurrences()', v, 'The first item is not an occurrence (it has no key, startMs and endMs).')
  }
}

/** Dates to show: an array of dates, or the `visibleRange()` result (its `dates`). */
export function toDates(fn: string, argument: string, v: unknown): readonly PlainDate[] {
  const dates = isShown(v) ? v.dates : v
  if (!Array.isArray(dates) || !dates.every(isDateString)) return bad(fn, argument, 'an array of dates, or the result of visibleRange()', v, sibling(v))

  return dates as PlainDate[]
}

/** Rows of dates: an array of arrays of dates, or the `visibleRange()` result (its `rows`). */
export function toRows(fn: string, argument: string, v: unknown): readonly (readonly PlainDate[])[] {
  const rows = isShown(v) ? v.rows : v
  if (!Array.isArray(rows) || !rows.every((r) => Array.isArray(r) && r.every(isDateString))) return bad(fn, argument, 'an array of rows of dates, or the result of visibleRange()', v, sibling(v))

  return rows as PlainDate[][]
}

export function checkOptions(fn: string, argument: string, v: unknown): void {
  if (v !== undefined && !isObject(v)) bad(fn, argument, 'an options object, or undefined', v)
}

export function checkCapacity(fn: string, argument: string, v: unknown): number {
  if (v === undefined) return Number.POSITIVE_INFINITY
  if (typeof v !== 'number' || Number.isNaN(v) || v < 0) return bad(fn, argument, 'a number of lanes (0 or more), or undefined', v)

  return v
}

export function checkNumber(fn: string, argument: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return bad(fn, argument, 'a number of milliseconds (an instant)', v)

  return v
}
