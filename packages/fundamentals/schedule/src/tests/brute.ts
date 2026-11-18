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

export interface BruteOptions {
  endWall: string
}

export function brute(rule: Recurrence, endWall: string): string[] {
  const start = parse(rule.start)
  const wkst = rule.weekStart ?? 1
  const interval = rule.interval ?? 1
  const on = rule.on ?? {}
  const dateOnly = start.dateOnly
  const end = parse(endWall)
  const sy = ymd(start.day)
  let months = on.months
  let monthDays = on.monthDays
  let weekdays = on.weekdays

  if (on.weeks === undefined && on.yearDays === undefined && monthDays === undefined && weekdays === undefined) {
    if (rule.every === 'year') {
      months ??= [sy.m]
      monthDays = [sy.d]
    } else if (rule.every === 'month') monthDays = [sy.d]
    else if (rule.every === 'week') weekdays = [isoWeekday(start.day)]
  }
  const plain = (weekdays ?? []).filter((w): w is 1 => typeof w === 'number')
  const nth = (weekdays ?? []).filter((w): w is Extract<WeekdaySpec, object> => typeof w !== 'number')
  const nthInYear = rule.every === 'year' && months === undefined

  const dayOk = (day: number): boolean => {
    const { y, m, d } = ymd(day)

    if (months !== undefined && !months.includes(m)) return false
    if (monthDays !== undefined && !monthDays.some((v) => (v > 0 ? v === d : daysInMonth(y, m) + v + 1 === d))) return false
    if (on.yearDays !== undefined) {
      const doy = day - dayOf(y, 1, 1) + 1

      if (!on.yearDays.some((v) => (v > 0 ? v === doy : daysInYear(y) + v + 1 === doy))) return false
    }
    if (on.weeks !== undefined) {
      const wy = weekYear(day, wkst)
      const n = weekNumber(day, wkst)

      if (!on.weeks.some((v) => (v > 0 ? v === n : weeksIn(wy, wkst) + v + 1 === n))) return false
    }
    if (weekdays === undefined) return true
    const wd = isoWeekday(day)

    if (plain.includes(wd as 1)) return true

    return nth.some((e) => {
      if (e.weekday !== wd) return false
      const lo = nthInYear ? dayOf(y, 1, 1) : dayOf(y, m, 1)
      const hi = nthInYear ? dayOf(y, 12, 31) : dayOf(y, m, daysInMonth(y, m))
      let before = 0
      let after = 0

      for (let x = lo; x < day; x++) if (isoWeekday(x) === wd) before++
      for (let x = day + 1; x <= hi; x++) if (isoWeekday(x) === wd) after++

      return e.nth > 0 ? before + 1 === e.nth : after + 1 === -e.nth
    })
  }
  const hours = [...(on.hours ?? [Math.floor(start.tod / 3_600_000)])].sort((a, b) => a - b)
  const minutes = [...(on.minutes ?? [Math.floor((start.tod % 3_600_000) / 60_000)])].sort((a, b) => a - b)
  const tods = dateOnly ? [0] : hours.flatMap((h) => minutes.map((mi) => h * 3_600_000 + mi * 60_000 + (start.tod % 60_000)))
  const periodOf = (day: number): number => {
    const { y, m } = ymd(day)

    if (rule.every === 'year') return on.weeks === undefined ? y : weekYear(day, wkst)
    if (rule.every === 'month') return y * 12 + m - 1
    if (rule.every === 'week') return Math.floor((weekStart(day, wkst) - weekStart(start.day, wkst)) / 7)

    return day - start.day
  }
  const startPeriod = rule.every === 'year' || rule.every === 'month' ? periodOf(start.day) : 0
  const until = rule.until === undefined ? Infinity : ((): number => {
    const u = parse(rule.until)

    return u.dateOnly && !dateOnly ? u.day * MS + MS - 1 : u.day * MS + u.tod
  })()
  const periods = new Map<number, number[]>()

  for (let day = start.day - 400; day <= end.day + 400; day++) {
    const p = periodOf(day)

    if (p < startPeriod || (p - startPeriod) % interval !== 0 || !dayOk(day)) continue
    if (!periods.has(p)) periods.set(p, [])
    periods.get(p)!.push(day)
  }
  const out: string[] = []
  const except = new Set((rule.except ?? []).map((e) => { const w = parse(e); return dateOnly ? w.day * MS : w.day * MS + w.tod }))
  let emitted = 0

  for (const p of [...periods.keys()].sort((a, b) => a - b)) {
    let walls = periods.get(p)!.flatMap((day) => tods.map((tod) => ({ day, tod })))

    if (on.position !== undefined) {
      const picked = new Set<number>()

      for (const pos of on.position) {
        const i = pos > 0 ? pos - 1 : walls.length + pos

        if (i >= 0 && i < walls.length) picked.add(i)
      }
      walls = [...picked].sort((a, b) => a - b).map((i) => walls[i]!)
    }
    for (const w of walls) {
      const t = w.day * MS + w.tod

      if (t < start.day * MS + start.tod) continue
      if (t > until || emitted >= (rule.count ?? Infinity)) return finish(out, rule, dateOnly, end, except)
      emitted++
      if (!except.has(t)) out.push(show(w, dateOnly))
    }
  }

  return finish(out, rule, dateOnly, end, except)
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
