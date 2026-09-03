// The web-facing half of the calendar family: epoch-ms date helpers, the
// record → datum-list adapter, and the nullable hit. The geometry in
// calendar.ts is crossed into the native engine and speaks in day counts and
// `{ date, value }` lists — the shapes that have a native form.

import { formatIsoDays, hitCalendarIndex, parseIsoDays } from './calendar'
import type { CalendarCell, CalendarLayout, CalendarValue } from './calendar'
import type { Double } from './types'

const DAY_MS = 86400000

/** `YYYY-MM-DD` → UTC epoch ms, or null. */
export function parseIsoDate(s: string): number | null {
  const p = parseIsoDays(s)
  return p.ok ? p.days * DAY_MS : null
}

/** UTC epoch ms → `YYYY-MM-DD`. */
export function formatIsoDate(t: number): string {
  return formatIsoDays(Math.floor(t / DAY_MS))
}

/** A `{ 'YYYY-MM-DD': value }` record as the datum list the engine takes. */
export function calendarValues(values: Record<string, Double>): CalendarValue[] {
  const out: CalendarValue[] = []
  for (const date of Object.keys(values)) out.push({ date, value: values[date]! })
  return out
}

/** The cell under a point, or null. */
export function hitCalendar(layout: CalendarLayout, px: Double, py: Double): CalendarCell | null {
  const i = hitCalendarIndex(layout, px, py)
  return i < 0 ? null : layout.cells[i]!
}
