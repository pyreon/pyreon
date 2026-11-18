import { add, dayOfWeek, daysInMonth, endOf, monthGrid, startOf } from '../core'
import type { PlainDate, Weekday } from '../core'
import { int, rng } from './rng'

/**
 * `packages/ui/primitives/src/CalendarBase.tsx` keeps private `Date`-based date math. This file re-states that math
 * verbatim (0-based months, `firstDay` 0 = Sunday) and proves `@pyreon/time` expresses everything it does: the month grid,
 * `addDays`, `addMonths` (day clamping), weekday, days in month, and the keyboard model's Home/End/PageUp/PageDown.
 */
interface CalendarDate {
  year: number
  month: number
  day: number
}

const getDaysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate()
const getDayOfWeek = (year: number, month: number, day: number): number => new Date(year, month, day).getDay()

function addDays(date: CalendarDate, delta: number): CalendarDate {
  const d = new Date(date.year, date.month, date.day + delta)

  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
}

function addMonths(date: CalendarDate, delta: number): CalendarDate {
  const targetMonthLen = getDaysInMonth(date.year + Math.floor((date.month + delta) / 12), (((date.month + delta) % 12) + 12) % 12)
  const d = new Date(date.year, date.month + delta, Math.min(date.day, targetMonthLen))

  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
}

/** The `days` computed of CalendarBase (without the per-cell flags). */
function calendarBaseGrid(year: number, month: number, firstDay: number): CalendarDate[][] {
  const dim = getDaysInMonth(year, month)
  const firstDayOfMonth = getDayOfWeek(year, month, 1)
  const startOffset = (firstDayOfMonth - firstDay + 7) % 7
  const pMonth = month === 0 ? 11 : month - 1
  const pYear = month === 0 ? year - 1 : year
  const daysInPrevMonth = getDaysInMonth(pYear, pMonth)
  const grid: CalendarDate[][] = []
  let week: CalendarDate[] = []

  for (let i = startOffset - 1; i >= 0; i--) week.push({ year: pYear, month: pMonth, day: daysInPrevMonth - i })
  for (let day = 1; day <= dim; day++) {
    week.push({ year, month, day })
    if (week.length === 7) {
      grid.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    const nMonth = month === 11 ? 0 : month + 1
    const nYear = month === 11 ? year + 1 : year
    let day = 1

    while (week.length < 7) week.push({ year: nYear, month: nMonth, day: day++ })
    grid.push(week)
  }

  return grid
}

const iso = (d: CalendarDate): PlainDate => `${String(d.year).padStart(4, '0')}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` as PlainDate
const toCalendar = (s: string): CalendarDate => ({ year: Number(s.slice(0, 4)), month: Number(s.slice(5, 7)) - 1, day: Number(s.slice(8, 10)) })
/** CalendarBase's `firstDay` (0 Sunday ... 6 Saturday) as an ISO weekday. */
const isoStart = (firstDay: number): Weekday => (firstDay === 0 ? 7 : firstDay) as Weekday

describe('CalendarBase parity', () => {
  it('monthGrid reproduces the CalendarBase grid for every month of 2020-2030 and every week start', () => {
    for (let year = 2020; year <= 2030; year++) {
      for (let month = 0; month < 12; month++) {
        for (let firstDay = 0; firstDay < 7; firstDay++) {
          const ym = `${year}-${String(month + 1).padStart(2, '0')}` as '2026-01'

          expect(monthGrid(ym, { weekStart: isoStart(firstDay) }), `${ym} firstDay ${firstDay}`).toEqual(calendarBaseGrid(year, month, firstDay).map((row) => row.map(iso)))
        }
      }
    }
  })

  it('addDays, addMonths, weekday and days in month agree with the Date-based helpers', () => {
    const r = rng(99)

    for (let i = 0; i < 3000; i++) {
      const cur: CalendarDate = { year: int(r, 1950, 2100), month: int(r, 0, 11), day: 1 }

      cur.day = int(r, 1, getDaysInMonth(cur.year, cur.month))
      const s = iso(cur)
      const delta = int(r, -800, 800)
      const months = int(r, -30, 30)

      expect(add(s, { days: delta }), `${s} ${delta}d`).toBe(iso(addDays(cur, delta)))
      expect(add(s, delta < 0 ? { days: delta } : { days: delta }), s).toBe(iso(addDays(cur, delta)))
      expect(add(s, { months }), `${s} ${months}mo`).toBe(iso(addMonths(cur, months)))
      expect(daysInMonth(s)).toBe(getDaysInMonth(cur.year, cur.month))
      expect(dayOfWeek(s) % 7).toBe(getDayOfWeek(cur.year, cur.month, cur.day))
      for (const firstDay of [0, 1, 6]) {
        const offset = (getDayOfWeek(cur.year, cur.month, cur.day) - firstDay + 7) % 7

        expect(startOf(s, 'week', { weekStart: isoStart(firstDay) }), `Home ${s} fd${firstDay}`).toBe(iso(addDays(cur, -offset)))
        expect(endOf(s, 'week', { weekStart: isoStart(firstDay) }), `End ${s} fd${firstDay}`).toBe(iso(addDays(cur, 6 - offset)))
      }
      expect(toCalendar(add(s, { months: -12 }))).toEqual(addMonths(cur, -12))
      expect(toCalendar(add(s, { months: 12 }))).toEqual(addMonths(cur, 12))
    }
  })
})
