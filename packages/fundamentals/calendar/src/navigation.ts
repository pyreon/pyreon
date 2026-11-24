import { add, dayOfWeek } from '@pyreon/time/core'
import { bad, checkDate, checkOptions } from './check'
import type { PlainDate, Weekday } from './types'

function checkKey(fn: string, input: unknown): void {
  if (typeof input !== 'object' || input === null || typeof (input as { key?: unknown }).key !== 'string') bad(fn, 'input', 'a key event { key, shiftKey?, ... }', input, typeof input === 'string' ? `Pass { key: ${JSON.stringify(input)} }.` : undefined)
}

export interface GridMoveOptions {
  weekStart?: Weekday
  /** Weekdays that have no cell; moves skip them. */
  hiddenDays?: readonly Weekday[]
  /** Right-to-left: the arrow keys swap, so ArrowRight goes to the previous day. */
  rtl?: boolean
}

export interface KeyInput {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

/** Step over hidden weekdays in a direction (`1` or `-1`): the first date from `date` that is shown. */
function shown(date: PlainDate, direction: 1 | -1, hidden: ReadonlySet<Weekday>): PlainDate {
  let d = date
  for (let i = 0; i < 7 && hidden.has(dayOfWeek(d)); i++) d = add(d, { days: direction })

  return d
}

/** The first and last shown day of the week of `date`. */
function weekEdge(date: PlainDate, edge: 'first' | 'last', weekStart: Weekday, hidden: ReadonlySet<Weekday>): PlainDate {
  const back = (dayOfWeek(date) - weekStart + 7) % 7
  const first = add(date, { days: -back })

  return edge === 'first' ? shown(first, 1, hidden) : shown(add(first, { days: 6 }), -1, hidden)
}

/**
 * Where a key moves the focused date of a month grid (the WAI-ARIA grid pattern): the arrows move a day (Left and Right swap
 * in right-to-left text, and skip hidden weekdays) or a week (Up and Down), Home and End go to the first and last shown day of
 * the week, PageUp and PageDown to the same day of the previous and next month, and Shift with them a year. Returns `null` for a
 * key that does not move. This is the logic a date picker's grid shares with an event calendar's.
 *
 * @example gridMove('2026-11-18', { key: 'ArrowDown' }) // => '2026-11-25'
 * @example gridMove('2026-11-18', { key: 'PageDown', shiftKey: true }) // => '2027-11-18'
 */
export function gridMove(date: PlainDate, input: KeyInput, options: GridMoveOptions = {}): PlainDate | null {
  checkDate('gridMove', 'date', date)
  checkKey('gridMove', input)
  checkOptions('gridMove', 'options', options)
  if (input.ctrlKey === true || input.metaKey === true || input.altKey === true) return null
  const hidden = new Set(options.hiddenDays ?? [])
  const step = options.rtl === true ? -1 : 1
  switch (input.key) {
    case 'ArrowLeft':
      return shown(add(date, { days: -step }), -step as 1 | -1, hidden)
    case 'ArrowRight':
      return shown(add(date, { days: step }), step as 1 | -1, hidden)
    case 'ArrowUp':
      return shown(add(date, { weeks: -1 }), -1, hidden)
    case 'ArrowDown':
      return shown(add(date, { weeks: 1 }), 1, hidden)
    case 'Home':
      return weekEdge(date, 'first', options.weekStart ?? 1, hidden)
    case 'End':
      return weekEdge(date, 'last', options.weekStart ?? 1, hidden)
    case 'PageUp':
      return shown(add(date, input.shiftKey === true ? { years: -1 } : { months: -1 }), -1, hidden)
    case 'PageDown':
      return shown(add(date, input.shiftKey === true ? { years: 1 } : { months: 1 }), 1, hidden)
    default:
      return null
  }
}

/** A cell of a time grid: a date and a wall-clock minute (a multiple of the slot). */
export interface SlotCursor {
  date: PlainDate
  minute: number
}

export interface SlotMoveOptions {
  /** The visible minutes of the day and the size of a slot, in minutes. */
  from: number
  to: number
  slot: number
  /** The shown dates, in order (a hidden weekday is not in the list). */
  dates: readonly PlainDate[]
  rtl?: boolean
}

/**
 * Where a key moves the focused slot of a time grid: Up and Down a slot, Left and Right a day (swapped in right-to-left text),
 * Home and End the first and last slot of the day, PageUp and PageDown a week of columns (a page of slots in a one-day view).
 * It stays inside the grid. Returns `null` for a key that does not move.
 *
 * @example slotMove({ date: '2026-11-18', minute: 540 }, { key: 'ArrowDown' }, { from: 0, to: 1440, slot: 30, dates: ['2026-11-18'] }) // => { date: '2026-11-18', minute: 570 }
 */
export function slotMove(cursor: SlotCursor, input: KeyInput, options: SlotMoveOptions): SlotCursor | null {
  if (typeof cursor !== 'object' || cursor === null || typeof cursor.minute !== 'number') bad('slotMove', 'cursor', 'a cell { date, minute }', cursor)
  checkDate('slotMove', 'cursor.date', cursor.date)
  checkKey('slotMove', input)
  if (typeof options !== 'object' || options === null || !Array.isArray(options.dates) || typeof options.slot !== 'number') bad('slotMove', 'options', 'an object { from, to, slot, dates }', options)
  if (input.ctrlKey === true || input.metaKey === true || input.altKey === true) return null
  const last = Math.floor((options.to - options.from - 1) / options.slot) * options.slot + options.from
  const clamp = (m: number): number => Math.min(Math.max(m, options.from), last)
  const index = Math.max(0, options.dates.indexOf(cursor.date))
  const at = (i: number): PlainDate => options.dates[Math.min(Math.max(i, 0), options.dates.length - 1)] ?? cursor.date
  const step = options.rtl === true ? -1 : 1
  switch (input.key) {
    case 'ArrowUp':
      return { date: cursor.date, minute: clamp(cursor.minute - options.slot) }
    case 'ArrowDown':
      return { date: cursor.date, minute: clamp(cursor.minute + options.slot) }
    case 'ArrowLeft':
      return { date: at(index - step), minute: cursor.minute }
    case 'ArrowRight':
      return { date: at(index + step), minute: cursor.minute }
    case 'Home':
      return { date: cursor.date, minute: options.from }
    case 'End':
      return { date: cursor.date, minute: last }
    case 'PageUp':
      return { date: at(index - Math.min(7, options.dates.length)), minute: cursor.minute }
    case 'PageDown':
      return { date: at(index + Math.min(7, options.dates.length)), minute: cursor.minute }
    default:
      return null
  }
}
