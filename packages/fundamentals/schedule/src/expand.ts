/**
 * The expansion engine: RFC 5545 recurrence, computed period by period. A period is a year, month, week or day (for hourly
 * and minutely rules, a day holding many periods). Expansion never steps through the time between occurrences: it jumps to
 * the period of the lower bound by arithmetic, and a rule that finds nothing for a long stretch ends.
 */
import { DAY, HOUR, MAX_DAY, MINUTE, civilFromDays, dayOf, daysFromCivil, daysIn, monthOf, weekOneStart, weekdayOf, weeksInYear, yearOf } from './civil'
import { HOURLY, MONTH, WEEK, YEAR, type Plan } from './plan'

/** How many consecutive periods without a single candidate end a rule (a daily rule on a 30th of February, say). */
const MAX_EMPTY = 5000

/** Set by `dayPeriods`: did the last day pass its filters (so its periods were all examined)? Such empty days are costlier. */
let heavyDay = false

/** Counts the days tested against a rule's filters: what tests bound to prove that expansion jumps. */
export const stats = { candidates: 0 }

const contains = (list: readonly number[], v: number): boolean => list.includes(v)

/** Does `day` pass the rule's month, month-day, year-day and weekday filters? */
function matches(plan: Plan, day: number): boolean {
  stats.candidates++
  const c = civilFromDays(day)
  const y = yearOf(c)
  const m = monthOf(c)
  const d = dayOf(c)

  if (plan.months !== null && !contains(plan.months, m)) return false
  if (plan.monthDays !== null && !contains(plan.monthDays, d) && !contains(plan.monthDays, d - daysIn(y, m) - 1)) return false
  if (plan.yearDays !== null && !yearDayMatches(plan.yearDays, day, y)) return false

  return weekdayMatches(plan, day, y, m)
}

function yearDayMatches(list: readonly number[], day: number, y: number): boolean {
  const first = daysFromCivil(y, 1, 1)
  const doy = day - first + 1
  const length = daysFromCivil(y + 1, 1, 1) - first

  return contains(list, doy) || contains(list, doy - length - 1)
}

function weekdayMatches(plan: Plan, day: number, y: number, m: number): boolean {
  if (plan.weekdays === null && plan.nth === null) return true
  const wd = weekdayOf(day)

  if (plan.weekdays !== null && contains(plan.weekdays, wd)) return true
  if (plan.nth === null) return false
  const first = plan.nthInYear ? daysFromCivil(y, 1, 1) : daysFromCivil(y, m, 1)
  const last = plan.nthInYear ? daysFromCivil(y + 1, 1, 1) - 1 : first + daysIn(y, m) - 1
  const fromStart = Math.floor((day - first) / 7) + 1
  const fromEnd = -(Math.floor((last - day) / 7) + 1)

  return plan.nth.some((e) => e.weekday === wd && (e.nth === fromStart || e.nth === fromEnd))
}

function monthDayList(plan: Plan, y: number, m: number): number[] {
  const first = daysFromCivil(y, m, 1)
  const length = daysIn(y, m)
  const days: number[] = []

  if (plan.monthDays === null) {
    for (let i = 0; i < length; i++) days.push(first + i)
  } else {
    for (const md of plan.monthDays) {
      const dd = md > 0 ? md : length + md + 1

      if (dd >= 1 && dd <= length) days.push(first + dd - 1)
    }
  }

  return days
}

function yearCandidates(plan: Plan, y: number): number[] {
  const first = daysFromCivil(y, 1, 1)
  const length = daysFromCivil(y + 1, 1, 1) - first
  let days: number[] = []

  if (plan.weeks !== null) {
    const n = weeksInYear(y, plan.wkst)
    const one = weekOneStart(y, plan.wkst)

    for (const w of plan.weeks) {
      const week = w > 0 ? w : n + w + 1

      if (week >= 1 && week <= n) for (let i = 0; i < 7; i++) days.push(one + (week - 1) * 7 + i)
    }
  } else if (plan.yearDays !== null) {
    for (const yd of plan.yearDays) {
      const dd = yd > 0 ? yd : length + yd + 1

      if (dd >= 1 && dd <= length) days.push(first + dd - 1)
    }
  } else {
    for (const m of plan.months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) days.push(...monthDayList(plan, y, m))
  }
  days = days.filter((d) => matches(plan, d))

  return sortedUnique(days)
}

function sortedUnique(list: number[]): number[] {
  list.sort((a, b) => a - b)

  return list.filter((v, i) => i === 0 || v !== list[i - 1])
}

/** The days of one period of a day-or-longer rule that pass its filters, sorted; `null` when the period is past year 9999. */
function dayCandidates(plan: Plan, k: number): number[] | null {
  const n = plan.interval

  if (plan.freq === YEAR) {
    const y = yearOf(civilFromDays(plan.startDay)) + k * n

    return y > 9999 ? null : yearCandidates(plan, y)
  }
  if (plan.freq === MONTH) {
    const c = civilFromDays(plan.startDay)
    const index = yearOf(c) * 12 + monthOf(c) - 1 + k * n
    const y = Math.floor(index / 12)

    return y > 9999 ? null : sortedUnique(monthDayList(plan, y, (index % 12) + 1).filter((d) => matches(plan, d)))
  }
  if (plan.freq === WEEK) {
    const first = plan.startDay - ((weekdayOf(plan.startDay) - plan.wkst + 7) % 7) + k * n * 7

    if (first > MAX_DAY) return null
    const days: number[] = []

    for (let i = 0; i < 7; i++) if (matches(plan, first + i)) days.push(first + i)

    return days
  }
  const day = plan.startDay + k * n

  return day > MAX_DAY ? null : matches(plan, day) ? [day] : []
}

function setPosition(list: number[], position: readonly number[] | null): number[] {
  if (position === null) return list
  const picked = new Set<number>()

  for (const p of position) {
    const i = p > 0 ? p - 1 : list.length + p

    if (i >= 0 && i < list.length) picked.add(i)
  }

  return [...picked].sort((a, b) => a - b).map((i) => list[i]!)
}

/** The walls of one period of a day-or-longer rule: days x times of day, sorted, after BYSETPOS. */
function periodWalls(plan: Plan, k: number): number[] | null {
  const days = dayCandidates(plan, k)

  if (days === null) return null
  const walls: number[] = []

  for (const day of days) for (const tod of plan.tods) walls.push(day * DAY + tod)

  return setPosition(walls, plan.position)
}

/** One day of an hourly or minutely rule: every period of the day that passes the filters, with BYSETPOS per period. */
function dayPeriods(plan: Plan, day: number): number[] | null {
  if (day > MAX_DAY) return null
  heavyDay = false
  if (!matches(plan, day)) return []
  heavyDay = true
  const step = plan.interval * (plan.freq === HOURLY ? HOUR : MINUTE)
  const dayStart = day * DAY
  const kFirst = Math.max(0, Math.ceil((dayStart - plan.startWall) / step))
  const kLast = Math.ceil((dayStart + DAY - plan.startWall) / step) - 1
  const out: number[] = []

  for (let k = kFirst; k <= kLast; k++) {
    const p = plan.startWall + k * step
    const h = Math.floor((p - dayStart) / HOUR)
    const m = Math.floor(((p - dayStart) % HOUR) / MINUTE)

    if (plan.hours !== null && !contains(plan.hours, h)) continue
    const rest = plan.startTod % MINUTE
    let walls: number[]

    if (plan.freq === HOURLY) walls = plan.minutes === null ? [p] : [...plan.minutes].sort((a, b) => a - b).map((mm) => dayStart + h * HOUR + mm * MINUTE + rest)
    else walls = plan.minutes !== null && !contains(plan.minutes, m) ? [] : [p]
    out.push(...setPosition(walls, plan.position))
  }

  return out
}

function firstPeriod(plan: Plan, lo: number): number {
  const loDay = Math.max(plan.startDay, Math.floor(lo / DAY))

  if (plan.freq >= HOURLY) return loDay - plan.startDay
  const c = civilFromDays(loDay)
  const s = civilFromDays(plan.startDay)
  let k: number

  if (plan.freq === YEAR) k = Math.floor((yearOf(c) - yearOf(s)) / plan.interval)
  else if (plan.freq === MONTH) k = Math.floor((yearOf(c) * 12 + monthOf(c) - yearOf(s) * 12 - monthOf(s)) / plan.interval)
  else if (plan.freq === WEEK) k = Math.floor((loDay - (plan.startDay - ((weekdayOf(plan.startDay) - plan.wkst + 7) % 7))) / (7 * plan.interval))
  else k = Math.floor((loDay - plan.startDay) / plan.interval)

  return Math.max(0, k - 1)
}

/** The rule's own occurrences (before `except` and `also`) that are at least `lo`, in order. */
function* ruleWalls(plan: Plan, lo: number): Generator<number, void, undefined> {
  const counted = plan.count !== Infinity
  const sub = plan.freq >= HOURLY
  let emitted = 0
  let empty = 0

  for (let k = counted ? 0 : firstPeriod(plan, lo); ; k++) {
    const walls = sub ? dayPeriods(plan, plan.startDay + k) : periodWalls(plan, k)

    if (walls === null) return
    if (walls.length === 0) {
      empty += sub && heavyDay ? 12 : 1
      if (empty > MAX_EMPTY) return
      continue
    }
    empty = 0
    for (const w of walls) {
      if (w < plan.startWall) continue
      if (w > plan.until || emitted >= plan.count) return
      emitted++
      if (w >= lo) yield w
    }
  }
}

/**
 * The occurrences of a rule with `lo <= wall <= hi`, in order: the rule's own (RRULE), plus `also` (RDATE), minus `except`
 * (EXDATE). `count` limits the rule's own occurrences, so an excepted date still counts against it.
 */
export function* walk(plan: Plan, lo: number, hi: number): Generator<number, void, undefined> {
  const own = ruleWalls(plan, lo)
  const extra = plan.also.filter((w) => w >= lo && w <= hi)
  let e = 0
  let next = own.next()
  let last = NaN

  while (!next.done || e < extra.length) {
    const a = next.done ? Infinity : next.value
    const b = e < extra.length ? extra[e]! : Infinity
    const w = Math.min(a, b)

    if (w > hi) return
    if (a === w) next = own.next()
    if (b === w) e++
    if (w === last || plan.except.has(w)) continue
    last = w
    yield w
  }
}

/** The first occurrence at or after `lo`, or `null`. */
export function firstFrom(plan: Plan, lo: number, hi = Infinity): number | null {
  for (const w of walk(plan, lo, hi)) return w

  return null
}

/** The last occurrence at or before `hi`, found by looking back in doubling windows, or `null`. */
export function lastUpTo(plan: Plan, hi: number): number | null {
  const lowest = plan.also.length > 0 ? Math.min(plan.startWall, plan.also[0]!) : plan.startWall
  const highest = Math.max(plan.until, plan.also.length > 0 ? plan.also[plan.also.length - 1]! : -Infinity)
  let top = Math.min(hi, highest)
  let span = DAY

  while (top >= lowest) {
    const bottom = Math.max(lowest, top - span + 1)
    let found: number | null = null

    for (const w of walk(plan, bottom, top)) found = w
    if (found !== null) return found
    top = bottom - 1
    span *= 2
  }

  return null
}
