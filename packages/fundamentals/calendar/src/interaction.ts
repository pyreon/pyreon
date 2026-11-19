import { batch } from '@pyreon/reactivity'
import { add } from '@pyreon/time/core'
import type { Selection } from './calendar-types'
import { gridMove, slotMove } from './navigation'
import type { KeyInput } from './navigation'
import type { CalState } from './state'
import type { PlainDate, PlainDateTime } from './types'
import { visibleMinutes } from './timegrid'

const pad = (n: number): string => String(n).padStart(2, '0')

export const at = (date: PlainDate, minute: number): PlainDateTime => `${date}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}` as PlainDateTime

function slotMinutes<Meta>(s: CalState<Meta>): number {
  return Math.max(1, Math.round(((s.options.slot?.hours ?? 0) * 60 + (s.options.slot?.minutes ?? 0)) || 30))
}

/** The selection from two corners of a month grid (days) or a time grid (slots of one or more days). `end` is exclusive. */
export function rangeOf<Meta>(s: CalState<Meta>, grid: 'month' | 'time', a: { date: PlainDate; minute: number }, b: { date: PlainDate; minute: number }): Selection {
  const [first, last] = a.date < b.date || (a.date === b.date && a.minute <= b.minute) ? [a, b] : [b, a]
  if (grid === 'month') return { start: first.date, end: add(last.date, { days: 1 }), allDay: true }
  const size = slotMinutes(s)

  return { start: at(first.date, first.minute), end: at(last.date, last.minute + size), allDay: false }
}

export function selectRange<Meta>(s: CalState<Meta>, range: Selection | null): void {
  batch(() => s.selection.set(range))
  if (range !== null) s.options.onSelect?.(range)
}

/** Move the cursor; the view follows when the cursor leaves the shown window. */
export function moveCursor<Meta>(s: CalState<Meta>, date: PlainDate, minute: number): void {
  batch(() => {
    s.cursor.set({ date, minute })
    const dates = s.shown().dates
    if (dates.length > 0 && !dates.includes(date)) s.date.set(date)
  })
}

function applyMove<Meta>(s: CalState<Meta>, grid: 'month' | 'time', event: KeyInput, rtl: boolean): { date: PlainDate; minute: number } | null {
  const cursor = s.cursor.peek()
  if (grid === 'month') {
    const next = gridMove(cursor.date, event, { weekStart: s.weekStart(), hiddenDays: s.hiddenDays(), rtl })

    return next === null ? null : { date: next, minute: cursor.minute }
  }
  const window = visibleMinutes({ ...(s.options.dayStart === undefined ? {} : { dayStart: s.options.dayStart }), ...(s.options.dayEnd === undefined ? {} : { dayEnd: s.options.dayEnd }) })

  return slotMove(cursor, event, { from: window.from, to: window.to, slot: slotMinutes(s), dates: s.shown().dates, rtl })
}

/** Enter and Space select the focused cell, or confirm the range that Shift and the arrows made; Escape clears it. */
function commit<Meta>(s: CalState<Meta>, grid: 'month' | 'time'): void {
  const here = s.cursor.peek()
  const from = s.anchor ?? here
  s.anchor = null
  selectRange(s, rangeOf(s, grid, from, here))
}

/** The grid keyboard (WAI-ARIA grid pattern for the month; slot by slot in the time grid). Returns whether it handled the key. */
export function handleKey<Meta>(s: CalState<Meta>, event: KeyboardEvent, grid: 'month' | 'time', rtl: boolean): boolean {
  if (event.key === 'Escape') {
    if (s.selection.peek() === null && s.anchor === null) return false
    s.anchor = null
    s.selection.set(null)

    return true
  }
  if (event.key === 'Enter' || event.key === ' ') {
    if (s.options.selectable === false) return false
    commit(s, grid)

    return true
  }
  const next = applyMove(s, grid, event, rtl)
  if (next === null) return false
  if (event.shiftKey && (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') && s.options.selectable !== false) {
    s.anchor ??= s.cursor.peek()
    s.selection.set(rangeOf(s, grid, s.anchor, next))
  } else {
    s.anchor = null
  }
  moveCursor(s, next.date, next.minute)

  return true
}
