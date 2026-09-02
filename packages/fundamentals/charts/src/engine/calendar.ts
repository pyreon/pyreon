// Calendar geometry — a day-per-cell grid over a date range (the GitHub
// contribution graph shape), coloured by value through the shared heat ramp.

import { HEAT_RAMP } from './heat'
import { colorRamp } from './heat-ramp'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const DAY_MS = 86400000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface CalendarCell {
  /** ISO date `YYYY-MM-DD`. */
  date: string
  rect: Rect
  /** Row 0..6 after `firstDay` rotation. */
  row: number
  /** Week column from the start of the range. */
  week: number
  month: number
  day: number
  year: number
}

export interface CalendarLabel {
  text: string
  at: Pt
}

export interface CalendarLayout {
  cells: CalendarCell[]
  monthLabels: CalendarLabel[]
  dayLabels: CalendarLabel[]
  cellSize: Double
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
  domain?: [Double, Double] | undefined
  /** Entrance progress 0..1; cells fill in week by week. */
  progress?: Double | undefined
}

/** `YYYY-MM-DD` → UTC epoch ms, or null. */
export function parseIsoDate(s: string): number | null {
  if (s.length !== 10 || s[4] !== '-' || s[7] !== '-') return null
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(5, 7))
  const d = Number(s.slice(8, 10))
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1 || d > 31) return null
  const t = Date.UTC(y, m - 1, d)
  const back = new Date(t)
  if (back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null
  return t
}

/** UTC epoch ms → `YYYY-MM-DD`. */
export function formatIsoDate(t: number): string {
  const d = new Date(t)
  const pad = (n: number): string => (n < 10 ? '0' + String(n) : String(n))
  return String(d.getUTCFullYear()) + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
}

/** Lay out every day from `start` to `end` (inclusive, ISO dates) into `box`. */
export function layoutCalendar(start: string, end: string, box: Rect, options?: CalendarOptions): CalendarLayout {
  const t0 = parseIsoDate(start)
  const t1 = parseIsoDate(end)
  const empty: CalendarLayout = { cells: [], monthLabels: [], dayLabels: [], cellSize: 0.0 }
  if (t0 === null || t1 === null || t1 < t0) return empty
  const firstDay = Math.max(0, Math.min(6, Math.floor(options?.firstDay ?? 0)))
  const gap = options?.cellGap ?? 2.0
  const fontSize = options?.fontSize ?? 10.0
  const showMonths = options?.showMonthLabels ?? true
  const showDays = options?.showDayLabels ?? true
  const gutterX = showDays ? fontSize * 2.6 : 0.0
  const gutterY = showMonths ? fontSize * 1.6 : 0.0
  const startRow = (new Date(t0).getUTCDay() - firstDay + 7) % 7
  const days = Math.round((t1 - t0) / DAY_MS) + 1
  const weeks = Math.ceil((startRow + days) / 7)
  const fitW = weeks <= 0 ? 0.0 : (box.w - gutterX) / weeks
  const fitH = (box.h - gutterY) / 7.0
  const pitch = options?.cellSize !== undefined ? options.cellSize + gap : Math.max(0.0, Math.min(fitW, fitH))
  const cellSize = Math.max(0.0, pitch - gap)
  const originX = box.x + gutterX
  const originY = box.y + gutterY
  const cells: CalendarCell[] = []
  const monthLabels: CalendarLabel[] = []
  let lastMonthKey = -1
  for (let i = 0; i < days; i++) {
    const t = t0 + i * DAY_MS
    const d = new Date(t)
    const idx = startRow + i
    const week = Math.floor(idx / 7)
    const row = idx % 7
    const month = d.getUTCMonth()
    const year = d.getUTCFullYear()
    const rect: Rect = { x: originX + week * pitch, y: originY + row * pitch, w: cellSize, h: cellSize }
    cells.push({ date: formatIsoDate(t), rect, row, week, month, day: d.getUTCDate(), year })
    const key = year * 12 + month
    if (key !== lastMonthKey) {
      lastMonthKey = key
      monthLabels.push({ text: MONTHS[month]!, at: { x: originX + week * pitch, y: originY - fontSize * 0.4 } })
    }
  }
  const dayLabels: CalendarLabel[] = []
  for (let r = 0; r < 7; r++) {
    // Every other row, like the contribution graph — seven labels do not fit.
    if (r % 2 !== 1) continue
    dayLabels.push({ text: DAYS[(firstDay + r) % 7]!, at: { x: originX - fontSize * 0.4, y: originY + r * pitch + cellSize / 2.0 } })
  }
  return { cells, monthLabels: showMonths ? monthLabels : [], dayLabels: showDays ? dayLabels : [], cellSize }
}

/** Value extent over the cells that have data. */
export function calendarDomain(layout: CalendarLayout, values: Record<string, Double>): [Double, Double] {
  let lo = Infinity
  let hi = -Infinity
  for (const c of layout.cells) {
    const v = values[c.date]
    if (v === undefined || v !== v) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (lo === Infinity) return [0.0, 0.0]
  return [lo, hi]
}

/** Render the grid: coloured cells, then month and weekday labels. */
export function renderCalendar(layout: CalendarLayout, values: Record<string, Double>, options?: CalendarOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const ramp = colorRamp(options?.stops ?? HEAT_RAMP)
  const emptyColor = options?.emptyColor ?? '#e2e8f0'
  const [lo, hi] = options?.domain ?? calendarDomain(layout, values)
  const span = hi - lo
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  let weeks = 0
  for (const c of layout.cells) if (c.week + 1 > weeks) weeks = c.week + 1
  const shownWeeks = progress >= 1.0 ? weeks : Math.floor(weeks * progress)
  const fontSize = options?.fontSize ?? 10.0
  const labelColor = options?.labelColor ?? '#64748b'
  void (measure ?? measureApprox())
  for (const c of layout.cells) {
    if (c.week >= shownWeeks) continue
    const v = values[c.date]
    const has = v !== undefined && v === v
    const t = !has ? 0.0 : span <= 0.0 ? 1.0 : (v - lo) / span
    out.push({ kind: 'rect', rect: c.rect, fill: has ? ramp(t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t) : emptyColor })
  }
  if (progress < 1.0) return out
  for (const m of layout.monthLabels) out.push({ kind: 'text', text: m.text, at: m.at, fill: labelColor, size: fontSize, align: 'start', baseline: 'bottom' })
  for (const d of layout.dayLabels) out.push({ kind: 'text', text: d.text, at: d.at, fill: labelColor, size: fontSize, align: 'end', baseline: 'middle' })
  return out
}

/** The cell under a point, or null. */
export function hitCalendar(layout: CalendarLayout, px: Double, py: Double): CalendarCell | null {
  for (const c of layout.cells) {
    const r = c.rect
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return c
  }
  return null
}

export interface CalendarToSvgOptions {
  start: string
  end: string
  values: Record<string, Double>
  width?: Double
  height?: Double
  calendar?: CalendarOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Calendar → `<svg>` string, server-safe. */
export function calendarToSvg(options: CalendarToSvgOptions): string {
  const width = options.width ?? 720.0
  const height = options.height ?? 140.0
  const layout = layoutCalendar(options.start, options.end, { x: 4.0, y: 4.0, w: width - 8.0, h: height - 8.0 }, options.calendar)
  const cmds = renderCalendar(layout, options.values, options.calendar, options.measure ?? measureApprox())
  let filled = 0
  for (const c of layout.cells) if (options.values[c.date] !== undefined) filled++
  const [lo, hi] = calendarDomain(layout, options.values)
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${layout.cells.length} days from ${options.start} to ${options.end}, ${filled} with values from ${lo} to ${hi}.` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
