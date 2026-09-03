// Calendar geometry — a day-per-cell grid over a date range (the GitHub
// contribution graph shape), coloured by value through the shared heat ramp.
//
// Written in the native subset and BUNDLED into the generated Swift/Kotlin
// engine, so there is no `Date` here: days are counted from 1970-01-01 with
// the proleptic-Gregorian civil arithmetic below (exact in Doubles), ISO
// strings are parsed by char code, and values arrive as a `{ date, value }`
// list rather than a record. The record adapter, the epoch-ms date helpers
// and the nullable hit live in calendar-web.ts; the svg half in family-svg.ts.

import { HEAT_RAMP, rampColor } from './heat'
import type { Domain, Double, DrawCmd, Pt, Rect } from './types'

const CALENDAR_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CALENDAR_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface CalendarCell {
  /** ISO date `YYYY-MM-DD`. */
  date: string
  rect: Rect
  /** Row 0..6 after `firstDay` rotation. */
  row: Double
  /** Week column from the start of the range. */
  week: Double
  /** 0-based month. */
  month: Double
  day: Double
  year: Double
}

export interface CalendarLabel {
  /** Which gutter the label sits in. */
  kind: 'month' | 'day'
  text: string
  at: Pt
}

export interface CalendarLayout {
  cells: CalendarCell[]
  monthLabels: CalendarLabel[]
  dayLabels: CalendarLabel[]
  cellSize: Double
  /** Days since 1970-01-01 of the first cell. */
  startDay: Double
  /** Number of cells. */
  days: Double
}

/** One datum: an ISO date and its value. */
export interface CalendarValue {
  date: string
  value: Double
}

export interface CalendarOptions {
  /** 0 = Sunday (default), 1 = Monday. */
  firstDay?: Double | undefined
  cellGap?: Double | undefined
  /** Force a cell size; default fits the box. */
  cellSize?: Double | undefined
  showMonthLabels?: boolean | undefined
  showDayLabels?: boolean | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  /** Colour stops for the value ramp; default the heat ramp. */
  stops?: string[] | undefined
  /** Colour for days without a value. */
  emptyColor?: string | undefined
  /** Fixed value domain; default the data's min/max. */
  domain?: Domain | undefined
  /** Entrance progress 0..1; cells fill in week by week. */
  progress?: Double | undefined
}

/** A civil date; `month` is 1..12. */
export interface CalendarDate {
  year: Double
  month: Double
  day: Double
}

/** The result of parsing an ISO date: `days` since 1970-01-01 when `ok`. */
export interface CalendarParsed {
  ok: boolean
  days: Double
}

/** Days since 1970-01-01 for a proleptic-Gregorian civil date. */
export function daysFromCivil(year: Double, month: Double, day: Double): Double {
  const yy = month <= 2.0 ? year - 1.0 : year
  const era = Math.floor(yy / 400.0)
  const yoe = yy - era * 400.0
  const mp = month > 2.0 ? month - 3.0 : month + 9.0
  const doy = Math.floor((153.0 * mp + 2.0) / 5.0) + day - 1.0
  const doe = yoe * 365.0 + Math.floor(yoe / 4.0) - Math.floor(yoe / 100.0) + doy
  return era * 146097.0 + doe - 719468.0
}

/** The civil date of a day count since 1970-01-01. */
export function civilFromDays(days: Double): CalendarDate {
  const z = days + 719468.0
  const era = Math.floor(z / 146097.0)
  const doe = z - era * 146097.0
  const yoe = Math.floor((doe - Math.floor(doe / 1460.0) + Math.floor(doe / 36524.0) - Math.floor(doe / 146096.0)) / 365.0)
  const y = yoe + era * 400.0
  const doy = doe - (365.0 * yoe + Math.floor(yoe / 4.0) - Math.floor(yoe / 100.0))
  const mp = Math.floor((5.0 * doy + 2.0) / 153.0)
  const d = doy - Math.floor((153.0 * mp + 2.0) / 5.0) + 1.0
  const m = mp < 10.0 ? mp + 3.0 : mp - 9.0
  return { year: m <= 2.0 ? y + 1.0 : y, month: m, day: d }
}

/** Weekday of a day count, 0 = Sunday (1970-01-01 was a Thursday). */
export function weekdayOfDays(days: Double): Double {
  const x = days + 4.0
  return x - Math.floor(x / 7.0) * 7.0
}

/** A decimal digit's value from its char code, or -1. */
function calendarDigit(c: Double): Double {
  if (c >= 48.0 && c <= 57.0) return c - 48.0
  return -1.0
}

/** `YYYY-MM-DD` → days since 1970-01-01; `ok: false` for anything malformed or an impossible date. */
export function parseIsoDays(s: string): CalendarParsed {
  if (s.length !== 10 || s.charCodeAt(4) !== 45.0 || s.charCodeAt(7) !== 45.0) return { ok: false, days: 0.0 }
  const y0 = calendarDigit(s.charCodeAt(0))
  const y1 = calendarDigit(s.charCodeAt(1))
  const y2 = calendarDigit(s.charCodeAt(2))
  const y3 = calendarDigit(s.charCodeAt(3))
  const m0 = calendarDigit(s.charCodeAt(5))
  const m1 = calendarDigit(s.charCodeAt(6))
  const d0 = calendarDigit(s.charCodeAt(8))
  const d1 = calendarDigit(s.charCodeAt(9))
  if (y0 < 0.0 || y1 < 0.0 || y2 < 0.0 || y3 < 0.0 || m0 < 0.0 || m1 < 0.0 || d0 < 0.0 || d1 < 0.0) return { ok: false, days: 0.0 }
  const y = y0 * 1000.0 + y1 * 100.0 + y2 * 10.0 + y3
  const m = m0 * 10.0 + m1
  const d = d0 * 10.0 + d1
  if (m < 1.0 || m > 12.0 || d < 1.0 || d > 31.0) return { ok: false, days: 0.0 }
  const days = daysFromCivil(y, m, d)
  const back = civilFromDays(days)
  if (back.month !== m || back.day !== d) return { ok: false, days: 0.0 }
  return { ok: true, days }
}

/** Days since 1970-01-01 → `YYYY-MM-DD`. */
export function formatIsoDays(days: Double): string {
  const c = civilFromDays(days)
  const mp = c.month < 10.0 ? '0' : ''
  const dp = c.day < 10.0 ? '0' : ''
  const yp = c.year < 1000.0 ? (c.year < 100.0 ? (c.year < 10.0 ? '000' : '00') : '0') : ''
  return `${yp}${Math.round(c.year)}-${mp}${Math.round(c.month)}-${dp}${Math.round(c.day)}`
}

/** Lay out every day from `start` to `end` (inclusive, ISO dates) into `box`. */
export function layoutCalendar(start: string, end: string, box: Rect, options?: CalendarOptions): CalendarLayout {
  const p0 = parseIsoDays(start)
  const p1 = parseIsoDays(end)
  if (!p0.ok || !p1.ok || p1.days < p0.days) return { cells: [], monthLabels: [], dayLabels: [], cellSize: 0.0, startDay: 0.0, days: 0.0 }
  const rawFirst = Math.floor(options?.firstDay ?? 0.0)
  const firstDay = rawFirst < 0.0 ? 0.0 : rawFirst > 6.0 ? 6.0 : rawFirst
  const gap = options?.cellGap ?? 2.0
  const fontSize = options?.fontSize ?? 10.0
  const showMonths = options?.showMonthLabels ?? true
  const showDays = options?.showDayLabels ?? true
  const gutterX = showDays ? fontSize * 2.6 : 0.0
  const gutterY = showMonths ? fontSize * 1.6 : 0.0
  const sr = weekdayOfDays(p0.days) - firstDay + 7.0
  const startRow = sr - Math.floor(sr / 7.0) * 7.0
  const days = p1.days - p0.days + 1.0
  const weeksRaw = (startRow + days) / 7.0
  const weeksF = Math.floor(weeksRaw)
  const weeks = weeksF < weeksRaw ? weeksF + 1.0 : weeksF
  const fitW = weeks <= 0.0 ? 0.0 : (box.w - gutterX) / weeks
  const fitH = (box.h - gutterY) / 7.0
  const fitRaw = fitW < fitH ? fitW : fitH
  const fit = fitRaw < 0.0 ? 0.0 : fitRaw
  const fixed = options?.cellSize ?? -1.0
  const pitch = fixed >= 0.0 ? fixed + gap : fit
  const rawCell = pitch - gap
  const cellSize = rawCell < 0.0 ? 0.0 : rawCell
  const originX = box.x + gutterX
  const originY = box.y + gutterY
  const cells: CalendarCell[] = []
  const monthLabels: CalendarLabel[] = []
  let lastMonthKey = -1.0
  let iF = 0.0
  while (iF < days) {
    const t = p0.days + iF
    const c = civilFromDays(t)
    const idx = startRow + iF
    const week = Math.floor(idx / 7.0)
    const row = idx - week * 7.0
    const rect: Rect = { x: originX + week * pitch, y: originY + row * pitch, w: cellSize, h: cellSize }
    cells.push({ date: formatIsoDays(t), rect, row, week, month: c.month - 1.0, day: c.day, year: c.year })
    const key = c.year * 12.0 + c.month
    if (key !== lastMonthKey) {
      lastMonthKey = key
      let mi = 0
      let miF = 1.0
      while (miF < c.month) {
        mi = mi + 1
        miF = miF + 1.0
      }
      monthLabels.push({ kind: 'month', text: CALENDAR_MONTHS[mi]!, at: { x: originX + week * pitch, y: originY - fontSize * 0.4 } })
    }
    iF = iF + 1.0
  }
  const dayLabels: CalendarLabel[] = []
  let rF = 0.0
  for (let r = 0; r < 7; r++) {
    // Every other row, like the contribution graph — seven labels do not fit.
    if (r % 2 === 1) {
      const raw = firstDay + rF
      const dIdx = raw - Math.floor(raw / 7.0) * 7.0
      let di = 0
      let diF = 0.0
      while (diF < dIdx) {
        di = di + 1
        diF = diF + 1.0
      }
      dayLabels.push({ kind: 'day', text: CALENDAR_DAYS[di]!, at: { x: originX - fontSize * 0.4, y: originY + rF * pitch + cellSize / 2.0 } })
    }
    rF = rF + 1.0
  }
  return { cells, monthLabels: showMonths ? monthLabels : [], dayLabels: showDays ? dayLabels : [], cellSize, startDay: p0.days, days }
}

/** Per-cell presence + value, resolved once from the datum list. */
export interface CalendarCellValues {
  has: boolean[]
  value: Double[]
}

/** Resolve the datum list onto the layout's cells (a datum outside the range, or with a bad date, is ignored). */
export function calendarCellValues(layout: CalendarLayout, values: CalendarValue[]): CalendarCellValues {
  const has: boolean[] = []
  const value: Double[] = []
  for (let i = 0; i < layout.cells.length; i++) {
    has.push(false)
    value.push(0.0)
  }
  const vDays: Double[] = []
  const vOk: boolean[] = []
  for (const v of values) {
    const p = parseIsoDays(v.date)
    vDays.push(p.days)
    vOk.push(p.ok && v.value === v.value)
  }
  let iF = 0.0
  for (let i = 0; i < layout.cells.length; i++) {
    const day = layout.startDay + iF
    for (let k = 0; k < values.length; k++) {
      if (!vOk[k]! || vDays[k]! !== day) continue
      has[i] = true
      value[i] = values[k]!.value
    }
    iF = iF + 1.0
  }
  return { has, value }
}

/** Value extent over the cells that have data. */
export function calendarDomain(layout: CalendarLayout, values: CalendarValue[]): Domain {
  const cv = calendarCellValues(layout, values)
  let lo = 0.0
  let hi = 0.0
  let seen = false
  for (let i = 0; i < cv.has.length; i++) {
    if (!cv.has[i]!) continue
    const v = cv.value[i]!
    if (!seen || v < lo) lo = v
    if (!seen || v > hi) hi = v
    seen = true
  }
  return { min: lo, max: hi }
}

/** Render the grid: coloured cells, then month and weekday labels. */
export function renderCalendar(layout: CalendarLayout, values: CalendarValue[], options?: CalendarOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const stops = options?.stops ?? HEAT_RAMP
  const emptyColor = options?.emptyColor ?? '#e2e8f0'
  const domain = options?.domain ?? calendarDomain(layout, values)
  const span = domain.max - domain.min
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  let weeks = 0.0
  for (const c of layout.cells) if (c.week + 1.0 > weeks) weeks = c.week + 1.0
  const shownWeeks = progress >= 1.0 ? weeks : Math.floor(weeks * progress)
  const fontSize = options?.fontSize ?? 10.0
  const labelColor = options?.labelColor ?? '#64748b'
  const cv = calendarCellValues(layout, values)
  for (let i = 0; i < layout.cells.length; i++) {
    const c = layout.cells[i]!
    if (c.week >= shownWeeks) continue
    const hasV = cv.has[i]!
    const raw = !hasV ? 0.0 : span <= 0.0 ? 1.0 : (cv.value[i]! - domain.min) / span
    const t = raw < 0.0 ? 0.0 : raw > 1.0 ? 1.0 : raw
    out.push({ kind: 'rect', rect: c.rect, fill: hasV ? rampColor(stops, t) : emptyColor })
  }
  if (progress < 1.0) return out
  for (const m of layout.monthLabels) out.push({ kind: 'text', text: m.text, at: m.at, fill: labelColor, size: fontSize, align: 'start', baseline: 'bottom' })
  for (const d of layout.dayLabels) out.push({ kind: 'text', text: d.text, at: d.at, fill: labelColor, size: fontSize, align: 'end', baseline: 'middle' })
  return out
}

/** Index of the cell under a point, or -1. */
export function hitCalendarIndex(layout: CalendarLayout, px: Double, py: Double): number {
  let hit = -1
  for (let i = 0; i < layout.cells.length; i++) {
    if (hit >= 0) continue
    const r = layout.cells[i]!.rect
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) hit = i
  }
  return hit
}
