/**
 * A second oracle: RFC 5545 evaluated by definition, day by day, with its own calendar arithmetic (`Date.UTC`) and none of the
 * engine's code. For every day it asks "does this day satisfy the rule's parts?", groups the days by period, and applies
 * BYSETPOS to each whole period. Slow and simple on purpose; day-level and longer frequencies only.
 */
import type { Recurrence, WeekdaySpec } from '../types'

const MS = 86_400_000
const dayOf = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d) / MS

const ymd = (day: number): { y: number; m: number; d: number } => {
  const t = new Date(day * MS)

  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

const isoWeekday = (day: number): number => ((new Date(day * MS).getUTCDay() + 6) % 7) + 1
const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()
const daysInYear = (y: number): number => dayOf(y + 1, 1, 1) - dayOf(y, 1, 1)

interface Wall {
  day: number
  tod: number
}

function parse(text: string): Wall & { dateOnly: boolean } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text)!

  return { day: dayOf(+m[1]!, +m[2]!, +m[3]!), tod: m[4] === undefined ? 0 : (+m[4] * 60 + +m[5]!) * 60_000 + (m[6] === undefined ? 0 : +m[6] * 1000), dateOnly: m[4] === undefined }
}

function show(w: Wall, dateOnly: boolean): string {
  const { y, m, d } = ymd(w.day)
  const date = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  if (dateOnly) return date
  const h = Math.floor(w.tod / 3_600_000)
  const mi = Math.floor((w.tod % 3_600_000) / 60_000)
  const s = Math.floor((w.tod % 60_000) / 1000)

  return `${date}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}${s === 0 ? '' : `:${String(s).padStart(2, '0')}`}`
}

/** The start of the week that holds `day`. */
const weekStart = (day: number, wkst: number): number => day - ((isoWeekday(day) - wkst + 7) % 7)

/** The year a week belongs to: the year that holds at least four of its seven days. */
const weekYear = (day: number, wkst: number): number => ymd(weekStart(day, wkst) + 3).y

function weekOneStart(y: number, wkst: number): number {
  let ws = weekStart(dayOf(y, 1, 4), wkst)

  while (weekYear(ws, wkst) < y) ws += 7
  while (weekYear(ws - 7, wkst) >= y) ws -= 7

  return ws
}

function weeksIn(y: number, wkst: number): number {
  let n = 0

  for (let ws = weekOneStart(y, wkst); weekYear(ws, wkst) === y; ws += 7) n++

  return n
}

const weekNumber = (day: number, wkst: number): number => (weekStart(day, wkst) - weekOneStart(weekYear(day, wkst), wkst)) / 7 + 1

interface Spec {
  every: Recurrence['every']
  wkst: number
  months: readonly number[] | undefined
  monthDays: readonly number[] | undefined
  yearDays: readonly number[] | undefined
  weeks: readonly number[] | undefined
  weekdays: readonly WeekdaySpec[] | undefined
  nthInYear: boolean
}

/** The BY parts with the RFC defaults filled in from DTSTART when no part names the day. */
function specOf(rule: Recurrence, start: Wall): Spec {
  const on = rule.on ?? {}
  const sy = ymd(start.day)
  const spec: Spec = { every: rule.every, wkst: rule.weekStart ?? 1, months: on.months, monthDays: on.monthDays, yearDays: on.yearDays, weeks: on.weeks, weekdays: on.weekdays, nthInYear: false }

  if (spec.weeks === undefined && spec.yearDays === undefined && spec.monthDays === undefined && spec.weekdays === undefined) {
    if (rule.every === 'year') {
      spec.months ??= [sy.m]
      spec.monthDays = [sy.d]
    } else if (rule.every === 'month') spec.monthDays = [sy.d]
    else if (rule.every === 'week') spec.weekdays = [isoWeekday(start.day) as 1]
  }
  spec.nthInYear = rule.every === 'year' && spec.months === undefined

  return spec
}

const matchesList = (list: readonly number[], positive: number, size: number): boolean => list.some((v) => (v > 0 ? v === positive : size + v + 1 === positive))

/** Is `day` the n-th (or n-th last) such weekday of its month, or of its year? */
function nthMatches(spec: Spec, day: number, entry: { weekday: number; nth: number }): boolean {
  const { y, m } = ymd(day)
  const lo = spec.nthInYear ? dayOf(y, 1, 1) : dayOf(y, m, 1)
  const hi = spec.nthInYear ? dayOf(y, 12, 31) : dayOf(y, m, daysInMonth(y, m))
  let before = 0
  let after = 0

  for (let x = lo; x < day; x++) if (isoWeekday(x) === entry.weekday) before++
  for (let x = day + 1; x <= hi; x++) if (isoWeekday(x) === entry.weekday) after++

  return entry.nth > 0 ? before + 1 === entry.nth : after + 1 === -entry.nth
}

function weekdayOk(spec: Spec, day: number): boolean {
  if (spec.weekdays === undefined) return true
  const wd = isoWeekday(day)

  return spec.weekdays.some((e) => (typeof e === 'number' ? e === wd : e.weekday === wd && nthMatches(spec, day, e)))
}

/** Does the day satisfy every BY part of the rule? */
function dayOk(spec: Spec, day: number): boolean {
  const { y, m, d } = ymd(day)

  if (spec.months !== undefined && !spec.months.includes(m)) return false
  if (spec.monthDays !== undefined && !matchesList(spec.monthDays, d, daysInMonth(y, m))) return false
  if (spec.yearDays !== undefined && !matchesList(spec.yearDays, day - dayOf(y, 1, 1) + 1, daysInYear(y))) return false
  if (spec.weeks !== undefined && !matchesList(spec.weeks, weekNumber(day, spec.wkst), weeksIn(weekYear(day, spec.wkst), spec.wkst))) return false

  return weekdayOk(spec, day)
}

/** The period a day belongs to; the rule is active in periods whose distance from DTSTART's period is a multiple of INTERVAL. */
function periodOf(spec: Spec, startDay: number, day: number): number {
  const { y, m } = ymd(day)

  if (spec.every === 'year') return spec.weeks === undefined ? y : weekYear(day, spec.wkst)
  if (spec.every === 'month') return y * 12 + m - 1
  if (spec.every === 'week') return Math.floor((weekStart(day, spec.wkst) - weekStart(startDay, spec.wkst)) / 7)

  return day - startDay
}

function timesOf(rule: Recurrence, start: Wall & { dateOnly: boolean }): number[] {
  if (start.dateOnly) return [0]
  const hours = [...(rule.on?.hours ?? [Math.floor(start.tod / 3_600_000)])].sort((a, b) => a - b)
  const minutes = [...(rule.on?.minutes ?? [Math.floor((start.tod % 3_600_000) / 60_000)])].sort((a, b) => a - b)

  return hours.flatMap((h) => minutes.map((mi) => h * 3_600_000 + mi * 60_000 + (start.tod % 60_000)))
}

function untilOf(rule: Recurrence, dateOnly: boolean): number {
  if (rule.until === undefined) return Infinity
  const u = parse(rule.until)

  return u.dateOnly && !dateOnly ? u.day * MS + MS - 1 : u.day * MS + u.tod
}

function pickPositions(walls: Wall[], position: readonly number[] | undefined): Wall[] {
  if (position === undefined) return walls
  const picked = new Set<number>()

  for (const pos of position) {
    const i = pos > 0 ? pos - 1 : walls.length + pos

    if (i >= 0 && i < walls.length) picked.add(i)
  }

  return [...picked].sort((a, b) => a - b).map((i) => walls[i]!)
}

export function brute(rule: Recurrence, endWall: string): string[] {
  const start = parse(rule.start)
  const end = parse(endWall)
  const spec = specOf(rule, start)
  const interval = rule.interval ?? 1
  const tods = timesOf(rule, start)
  const startPeriod = periodOf(spec, start.day, start.day)
  const until = untilOf(rule, start.dateOnly)
  const periods = new Map<number, number[]>()

  for (let day = start.day - 400; day <= end.day + 400; day++) {
    const p = periodOf(spec, start.day, day)

    if (p < startPeriod || (p - startPeriod) % interval !== 0 || !dayOk(spec, day)) continue
    if (!periods.has(p)) periods.set(p, [])
    periods.get(p)!.push(day)
  }
  const except = new Set((rule.except ?? []).map((e) => { const w = parse(e); return start.dateOnly ? w.day * MS : w.day * MS + w.tod }))
  const out: string[] = []
  let emitted = 0

  for (const p of [...periods.keys()].sort((a, b) => a - b)) {
    const walls = pickPositions(periods.get(p)!.flatMap((day) => tods.map((tod) => ({ day, tod }))), rule.on?.position)

    for (const w of walls) {
      const t = w.day * MS + w.tod

      if (t < start.day * MS + start.tod) continue
      if (t > until || emitted >= (rule.count ?? Infinity)) return finish(out, rule, start.dateOnly, end, except)
      emitted++
      if (!except.has(t)) out.push(show(w, start.dateOnly))
    }
  }

  return finish(out, rule, start.dateOnly, end, except)
}

function finish(out: string[], rule: Recurrence, dateOnly: boolean, end: Wall, except: Set<number>): string[] {
  const all = new Set(out)

  for (const a of rule.also ?? []) {
    const w = parse(a)
    const t = dateOnly ? w.day * MS : w.day * MS + w.tod

    if (!except.has(t)) all.add(show(dateOnly ? { day: w.day, tod: 0 } : w, dateOnly))
  }

  return [...all].sort().filter((s) => s <= show(end, dateOnly))
}
