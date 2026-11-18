/** Half-open intervals `[start, end)` over plain date-times (or instants): overlap, merge, subtract. */
import { readWall } from './civil'
import { badRange, badValue, guard, show } from './errors'
import type { Interval } from './types'

type Point = string | number

interface Item<T extends Point> {
  s: number
  e: number
  start: T
  end: T
}

/** A point as a number: a date or date-time as its wall value, an instant as itself. */
function numberOf(fn: string, what: string, v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v

  return readWall(fn, what, v).wall
}

function item<T extends Point>(fn: string, what: string, iv: Interval<T>): Item<T> {
  if (typeof iv !== 'object' || iv === null) return badValue(fn, `${what} to be an interval { start, end }`, iv)
  const s = numberOf(fn, `${what}.start`, iv.start)
  const e = numberOf(fn, `${what}.end`, iv.end)

  if (e < s) return badRange(fn, `${what} ends before it starts (${show(iv.start)} to ${show(iv.end)}). Swap the two ends.`)

  return { s, e, start: iv.start, end: iv.end }
}

/** Validated, non-empty items sorted by start. */
export function itemsOf<T extends Point>(fn: string, what: string, list: readonly Interval<T>[]): Item<T>[] {
  if (!Array.isArray(list)) return badValue(fn, `${what} to be an array of intervals`, list)

  return list.map((iv, i) => item<T>(fn, `${what}[${i}]`, iv)).filter((x) => x.e > x.s).sort((a, b) => a.s - b.s || a.e - b.e)
}

export function mergeItems<T extends Point>(items: Item<T>[]): Item<T>[] {
  const out: Item<T>[] = []

  for (const it of items) {
    const last = out[out.length - 1]

    if (last !== undefined && it.s <= last.e) {
      if (it.e > last.e) {
        last.e = it.e
        last.end = it.end
      }
    } else out.push({ ...it })
  }

  return out
}

/** `a` minus `b`, both merged and sorted. */
export function subtractItems<T extends Point>(a: Item<T>[], b: Item<T>[]): Item<T>[] {
  const out: Item<T>[] = []
  let j = 0

  for (const piece of a) {
    let cursor = piece.s
    let cursorValue = piece.start

    while (j < b.length && b[j]!.e <= piece.s) j++
    for (let k = j; k < b.length && b[k]!.s < piece.e; k++) {
      const busy = b[k]!

      if (busy.e <= cursor) continue
      if (busy.s > cursor) out.push({ s: cursor, e: busy.s, start: cursorValue, end: busy.start })
      if (busy.e >= piece.e) {
        cursor = piece.e
        break
      }
      cursor = busy.e
      cursorValue = busy.end
    }
    if (cursor < piece.e) out.push({ s: cursor, e: piece.e, start: cursorValue, end: piece.end })
  }

  return out
}

const plain = <T extends Point>(x: Item<T>): Interval<T> => ({ start: x.start, end: x.end })

/**
 * Do two intervals share time? They are half-open, so `[9:00, 10:00)` and `[10:00, 11:00)` do not overlap, and an empty
 * interval overlaps nothing.
 *
 * @example overlaps({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' }, { start: '2026-11-18T09:30', end: '2026-11-18T11:00' }) // => true
 * @example overlaps({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' }, { start: '2026-11-18T10:00', end: '2026-11-18T11:00' }) // => false
 */
export const overlaps = guard('overlaps', function overlaps<T extends Point>(a: Interval<T>, b: Interval<T>): boolean {
  const x = item('overlaps', 'a', a)
  const y = item('overlaps', 'b', b)

  return x.s < y.e && y.s < x.e && x.e > x.s && y.e > y.s
})

/**
 * The shared part of two intervals, or `null` when they share no time.
 *
 * @example intersection({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' }, { start: '2026-11-18T09:30', end: '2026-11-18T11:00' }) // => { start: '2026-11-18T09:30', end: '2026-11-18T10:00' }
 */
export const intersection = guard('intersection', function intersection<T extends Point>(a: Interval<T>, b: Interval<T>): Interval<T> | null {
  const x = item('intersection', 'a', a)
  const y = item('intersection', 'b', b)
  const start = x.s >= y.s ? x : y
  const end = x.e <= y.e ? x : y

  return start.s < end.e ? { start: start.start, end: end.end } : null
})

/**
 * Sort and merge: overlapping and touching intervals become one; empty ones are dropped. The input is not changed.
 *
 * @example mergeIntervals([{ start: '2026-11-18T10:00', end: '2026-11-18T11:00' }, { start: '2026-11-18T09:00', end: '2026-11-18T10:00' }]) // => [{ start: '2026-11-18T09:00', end: '2026-11-18T11:00' }]
 */
export const mergeIntervals = guard('mergeIntervals', function mergeIntervals<T extends Point>(list: readonly Interval<T>[]): Interval<T>[] {
  return mergeItems(itemsOf('mergeIntervals', 'list', list)).map(plain)
})

/**
 * What is left of `from` once the `busy` intervals are taken out: sorted, not overlapping, no empty pieces.
 *
 * @example subtractIntervals([{ start: '2026-11-18T09:00', end: '2026-11-18T17:00' }], [{ start: '2026-11-18T12:00', end: '2026-11-18T13:00' }]) // => [{ start: '2026-11-18T09:00', end: '2026-11-18T12:00' }, { start: '2026-11-18T13:00', end: '2026-11-18T17:00' }]
 */
export const subtractIntervals = guard('subtractIntervals', function subtractIntervals<T extends Point>(from: readonly Interval<T>[], busy: readonly Interval<T>[]): Interval<T>[] {
  const a = mergeItems(itemsOf('subtractIntervals', 'from', from))
  const b = mergeItems(itemsOf('subtractIntervals', 'busy', busy))

  return subtractItems(a, b).map(plain)
})
