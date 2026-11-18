/** Compile a `Recurrence` into a validated `Plan` of plain numbers. Every rule error is raised here, with the fix. */
import { isTimeZone } from '@pyreon/time/core'
import { DAY, HOUR, MINUTE, civilFromDays, dayOf as civilDay, daysIn, monthOf, readWall, weekdayOf } from './civil'
import { badRange, badValue, show } from './errors'
import type { Recurrence, WeekdaySpec } from './types'

export const YEAR = 0
export const MONTH = 1
export const WEEK = 2
export const DAILY = 3
export const HOURLY = 4
export const MINUTELY = 5

const FREQ: Record<string, number> = { year: YEAR, month: MONTH, week: WEEK, day: DAILY, hour: HOURLY, minute: MINUTELY }

export interface Nth {
  weekday: number
  nth: number
}

export interface Plan {
  freq: number
  interval: number
  dateOnly: boolean
  startWall: number
  startDay: number
  startTod: number
  wkst: number
  until: number
  count: number
  months: number[] | null
  monthDays: number[] | null
  yearDays: number[] | null
  weeks: number[] | null
  weekdays: number[] | null
  nth: Nth[] | null
  /** Where an n-th weekday is counted: the month, or the whole year. */
  nthInYear: boolean
  hours: number[] | null
  minutes: number[] | null
  position: number[] | null
  except: Set<number>
  also: number[]
  /** Times of day of one day's occurrences for the day-and-longer frequencies (ms since midnight, sorted). */
  tods: number[]
  zone: string | undefined
}

function whole(fn: string, what: string, v: unknown, lo: number, hi: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : badRange(fn, `${what} must be a whole number from ${lo} to ${hi}, got ${show(v)}.`)
}

/** A non-empty list of whole numbers in `-hi..-1` and `1..hi` (or `lo..hi` when `zeroOk`). */
function numbers(fn: string, name: string, list: unknown, lo: number, hi: number, signed: boolean): number[] {
  if (!Array.isArray(list) || list.length === 0) return badValue(fn, `on.${name} to be a non-empty array`, list, `Leave on.${name} out to not use it.`)
  const out: number[] = []

  for (const v of list as unknown[]) {
    const ok = typeof v === 'number' && Number.isInteger(v) && ((v >= lo && v <= hi) || (signed && v <= -lo && v >= -hi))

    if (!ok) return badRange(fn, `on.${name} entries must be whole numbers from ${lo} to ${hi}${signed ? ` (or -${lo} to -${hi} from the end)` : ''}, got ${show(v)}.`)
    if (!out.includes(v)) out.push(v)
  }

  return out
}

function weekdayList(fn: string, list: unknown, freq: number): { weekdays: number[] | null; nth: Nth[] | null } {
  if (!Array.isArray(list) || list.length === 0) return badValue(fn, 'on.weekdays to be a non-empty array', list, 'Leave on.weekdays out to not use it.')
  const weekdays: number[] = []
  const nth: Nth[] = []

  for (const entry of list as WeekdaySpec[]) {
    if (typeof entry === 'number') weekdays.push(whole(fn, 'on.weekdays entries', entry, 1, 7))
    else if (typeof entry === 'object' && entry !== null) {
      const weekday = whole(fn, 'weekday', entry.weekday, 1, 7)

      if (freq !== MONTH && freq !== YEAR) return badRange(fn, `an n-th weekday (${show(entry)}) only makes sense for monthly and yearly rules, not for "${Object.keys(FREQ)[freq]}".`)
      const n = entry.nth
      const max = freq === YEAR ? 53 : 5

      if (typeof n !== 'number' || !Number.isInteger(n) || n === 0 || Math.abs(n) > max) return badRange(fn, `nth must be a whole number from 1 to ${max} or from -1 to -${max} (-1 is the last), got ${show(n)}.`)
      nth.push({ weekday, nth: n })
    } else return badValue(fn, 'a weekday 1..7 or { weekday, nth }', entry)
  }

  return { weekdays: weekdays.length > 0 ? weekdays : null, nth: nth.length > 0 ? nth : null }
}

/** A month-day filter that no month has: 31 in April, or 30 in February. */
function checkMonthDays(fn: string, monthDays: number[], months: number[] | null): void {
  const candidates = months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const longest = Math.max(...candidates.map((m) => (m === 2 ? 29 : daysIn(2001, m))))

  if (monthDays.every((d) => Math.abs(d) > longest)) {
    badRange(fn, `on.monthDays ${show(monthDays)} never occurs in ${months === null ? 'any month' : `month ${months.join(', ')}`} (the longest has ${longest} days). Check the days and months of the rule.`)
  }
}

function wallsOf(fn: string, what: string, list: unknown, dateOnly: boolean): number[] {
  if (list === undefined) return []
  if (!Array.isArray(list)) return badValue(fn, `${what} to be an array of dates or date-times`, list)

  return (list as unknown[]).map((v) => {
    const r = readWall(fn, what, v)

    return dateOnly ? Math.floor(r.wall / DAY) * DAY : r.wall
  })
}

function boundOf(fn: string, rule: Recurrence, dateOnly: boolean): number {
  if (rule.until === undefined) return Infinity
  const u = readWall(fn, 'until', rule.until)

  return u.dateOnly && !dateOnly ? u.wall + DAY - 1 : u.wall
}

/** Compile and validate. `fn` names the public function in errors. */
export function compile(fn: string, rule: Recurrence): Plan {
  if (typeof rule !== 'object' || rule === null) return badValue(fn, 'a Recurrence object', rule, 'Build one like { every: "week", start: "2026-11-18" }.')
  const freq = FREQ[rule.every as string]

  if (freq === undefined) return badValue(fn, 'every to be "day", "week", "month", "year", "hour" or "minute"', rule.every)
  const interval = rule.interval === undefined ? 1 : whole(fn, 'interval', rule.interval, 1, 1_000_000)
  const start = readWall(fn, 'start', rule.start)
  const dateOnly = start.dateOnly
  const parts = rule.on

  if (rule.count !== undefined && rule.until !== undefined) return badRange(fn, 'count and until are exclusive: set one of them.')
  const count = rule.count === undefined ? Infinity : whole(fn, 'count', rule.count, 1, 1_000_000_000)

  if (dateOnly && freq >= HOURLY) return badRange(fn, `a rule that repeats every ${rule.every} needs a date-time start, but start is the date ${show(rule.start)}. Use "${rule.start}T00:00".`)
  if (dateOnly && (parts?.hours !== undefined || parts?.minutes !== undefined)) return badRange(fn, 'on.hours and on.minutes need a date-time start; a date start produces dates.')
  if (parts?.weeks !== undefined && freq !== YEAR) return badRange(fn, 'on.weeks (BYWEEKNO) only applies to yearly rules.')
  const startDay = Math.floor(start.wall / DAY)
  const wkst = rule.weekStart === undefined ? 1 : whole(fn, 'weekStart', rule.weekStart, 1, 7)
  const until = boundOf(fn, rule, dateOnly)

  if (until < start.wall) return badRange(fn, `until (${show(rule.until)}) is before start (${show(rule.start)}), so the rule never occurs. Move until after start.`)
  const months = parts?.months === undefined ? null : numbers(fn, 'months', parts.months, 1, 12, false)
  const monthDays = parts?.monthDays === undefined ? null : numbers(fn, 'monthDays', parts.monthDays, 1, 31, true)
  const yearDays = parts?.yearDays === undefined ? null : numbers(fn, 'yearDays', parts.yearDays, 1, 366, true)
  const weeks = parts?.weeks === undefined ? null : numbers(fn, 'weeks', parts.weeks, 1, 53, true)
  const wd = parts?.weekdays === undefined ? { weekdays: null, nth: null } : weekdayList(fn, parts.weekdays, freq)
  const hours = parts?.hours === undefined ? null : numbers(fn, 'hours', parts.hours.map((h) => h + 1), 1, 24, false).map((h) => h - 1)
  const minutes = parts?.minutes === undefined ? null : numbers(fn, 'minutes', parts.minutes.map((m) => m + 1), 1, 60, false).map((m) => m - 1)
  const position = parts?.position === undefined ? null : numbers(fn, 'position', parts.position, 1, 366, true)

  if (monthDays !== null) checkMonthDays(fn, monthDays, months)
  if (rule.timeZone !== undefined && !isTimeZone(rule.timeZone)) return badValue(fn, 'timeZone to be an IANA zone name such as "Europe/Prague"', rule.timeZone)
  const plan: Plan = {
    freq, interval, dateOnly, startWall: start.wall, startDay, startTod: start.wall - startDay * DAY, wkst, until, count,
    months, monthDays, yearDays, weeks, weekdays: wd.weekdays, nth: wd.nth, nthInYear: freq === YEAR && months === null,
    hours, minutes, position, except: new Set(wallsOf(fn, 'except', rule.except, dateOnly)),
    also: [...new Set(wallsOf(fn, 'also', rule.also, dateOnly))].sort((a, b) => a - b), tods: [0], zone: rule.timeZone,
  }

  applyDefaults(plan)
  plan.tods = timesOfDay(plan)

  return plan
}

/** The times of one day that a day-or-longer rule produces: BYHOUR x BYMINUTE, each defaulting to the start's. */
function timesOfDay(plan: Plan): number[] {
  if (plan.dateOnly || plan.freq >= HOURLY) return [0]
  const hours = plan.hours ?? [Math.floor(plan.startTod / HOUR)]
  const minutes = plan.minutes ?? [Math.floor((plan.startTod % HOUR) / MINUTE)]
  const rest = plan.startTod % MINUTE
  const out: number[] = []

  for (const h of hours) for (const m of minutes) out.push(h * HOUR + m * MINUTE + rest)

  return [...new Set(out)].sort((a, b) => a - b)
}

/** RFC 5545: parts that the rule leaves out are taken from DTSTART, when no other part already picks the day. */
function applyDefaults(plan: Plan): void {
  const noDayPart = plan.weeks === null && plan.yearDays === null && plan.monthDays === null && plan.weekdays === null && plan.nth === null

  if (!noDayPart || plan.freq >= DAILY) return
  const c = civilFromDays(plan.startDay)

  if (plan.freq === YEAR) {
    plan.months ??= [monthOf(c)]
    plan.monthDays = [civilDay(c)]
    plan.nthInYear = false
  } else if (plan.freq === MONTH) plan.monthDays = [civilDay(c)]
  else plan.weekdays = [weekdayOf(plan.startDay)]
}
