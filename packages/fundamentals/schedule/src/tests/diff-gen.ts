/** Seeded random rules for the differential tests against the `rrule` npm library. */
import { RRule, Weekday as RWeekday } from 'rrule'
import type { Options } from 'rrule'
import { int, pick, rng, type Rand } from './rng'
import type { Recurrence, WeekdaySpec } from '../types'

export { rng }

const FREQS = [
  ['year', RRule.YEARLY],
  ['month', RRule.MONTHLY],
  ['week', RRule.WEEKLY],
  ['day', RRule.DAILY],
  ['hour', RRule.HOURLY],
  ['minute', RRule.MINUTELY],
] as const

const RDAYS = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU]

const subset = (r: Rand, lo: number, hi: number, max: number): number[] => {
  const n = int(r, 1, max)
  const set = new Set<number>()

  while (set.size < n) set.add(int(r, lo, hi))

  return [...set]
}

const pad = (n: number): string => String(n).padStart(2, '0')

export interface Case {
  seed: number
  rule: Recurrence
  options: Partial<Options>
  limit: number
  /** The end of the window both implementations are compared over (wall, inclusive). */
  windowEnd: string
  /** A BYDAY list that mixes plain weekdays and n-th weekdays: `rrule` returns nothing for those. */
  mixedDays: boolean
  count?: number
}

interface Ctx {
  r: Rand
  name: string
  sub: boolean
  timed: boolean
  on: Record<string, unknown>
  opts: Partial<Options>
}

type PartMaker = (c: Ctx) => void

const SORT = (list: number[]): number[] => [...list].sort((a, b) => a - b)

/** One BY part, in our shape and in rrule's. A part that makes no sense for the frequency is left out. */
const PARTS: Record<string, PartMaker> = {
  months: (c) => {
    c.on.months = subset(c.r, 1, 12, 3)
    c.opts.bymonth = c.on.months as number[]
  },
  monthDays: (c) => {
    if (c.sub) return
    c.on.monthDays = subset(c.r, 1, 28, 3).map((v) => (c.r() < 0.2 ? v - 29 : v))
    c.opts.bymonthday = c.on.monthDays as number[]
  },
  weekdays: (c) => {
    if (c.sub) return
    const nthOk = c.name === 'month' || c.name === 'year'
    const list: WeekdaySpec[] = subset(c.r, 1, 7, 3).map((w) => (nthOk && c.r() < 0.4 ? { weekday: w as 1, nth: pick(c.r, [1, 2, 3, -1, -2]) } : (w as 1)))

    c.on.weekdays = list
    c.opts.byweekday = list.map((w) => (typeof w === 'number' ? RDAYS[w - 1]! : RDAYS[w.weekday - 1]!.nth(w.nth)))
  },
  yearDays: (c) => {
    if (c.sub) return
    c.on.yearDays = subset(c.r, 1, 360, 3).map((v) => (c.r() < 0.2 ? v - 361 : v))
    c.opts.byyearday = c.on.yearDays as number[]
  },
  weeks: (c) => {
    if (c.name !== 'year') return
    c.on.weeks = subset(c.r, 1, 52, 2)
    c.opts.byweekno = c.on.weeks as number[]
  },
  hours: (c) => {
    if (!c.timed) return
    c.on.hours = subset(c.r, 0, 23, 3)
    c.opts.byhour = SORT(c.on.hours as number[])
  },
  minutes: (c) => {
    if (!c.timed) return
    c.on.minutes = subset(c.r, 0, 59, 3)
    c.opts.byminute = SORT(c.on.minutes as number[])
  },
  position: (c) => {
    if (c.sub) return
    // Positions beyond the period's size are where `rrule` clamps and duplicates; those cases have their own divergence test.
    c.on.position = pick(c.r, [[1], [2], [-1]])
    c.opts.bysetpos = c.on.position as number[]
  },
}

function windowEnd(name: string, y: number, mo: number, d: number): string {
  const end = new Date(Date.UTC(y, mo - 1, d, 0, 0))

  if (name === 'minute') end.setUTCDate(end.getUTCDate() + 3)
  else if (name === 'hour') end.setUTCDate(end.getUTCDate() + 30)
  else end.setUTCFullYear(end.getUTCFullYear() + 8)

  return end.toISOString().slice(0, 16)
}

/** One random rule that always has occurrences, in both our shape and `rrule`'s. */
export function makeCase(seed: number): Case {
  const r = rng(seed)
  const [name, freq] = pick(r, FREQS.filter((_, i) => i < 4 || r() < 0.25))
  const y = int(r, 1996, 2030)
  const mo = int(r, 1, 12)
  const d = int(r, 1, 28)
  const h = int(r, 0, 23)
  const mi = pick(r, [0, 15, 30, 45])
  const sub = name === 'hour' || name === 'minute'
  const timed = sub || r() < 0.7
  const start = `${y}-${pad(mo)}-${pad(d)}${timed ? `T${pad(h)}:${pad(mi)}` : ''}`
  const interval = r() < 0.6 ? 1 : int(r, 2, sub ? 7 : 4)
  const wkst = int(r, 1, 7)
  const opts: Partial<Options> = { freq, interval, wkst: RDAYS[wkst - 1] as RWeekday, dtstart: new Date(Date.UTC(y, mo - 1, d, timed ? h : 0, timed ? mi : 0)) }
  const ctx: Ctx = { r, name, sub, timed, on: {}, opts }
  const used = new Set<string>()

  for (let i = r() < 0.3 ? 0 : int(r, 1, 3); i > 0; i--) {
    const kind = pick(r, Object.keys(PARTS))

    if (used.has(kind)) continue
    used.add(kind)
    PARTS[kind]!(ctx)
  }
  const count = r() < 0.3 ? int(r, 3, 15) : undefined
  const wd = (ctx.on.weekdays as WeekdaySpec[] | undefined) ?? []
  const rule: Recurrence = {
    every: name,
    start: start as Recurrence['start'],
    ...(interval === 1 ? {} : { interval }),
    ...(wkst === 1 ? {} : { weekStart: wkst as 1 }),
    ...(Object.keys(ctx.on).length > 0 ? { on: ctx.on } : {}),
    ...(count === undefined ? {} : { count }),
  }

  return {
    seed,
    rule,
    options: opts,
    limit: int(r, 5, 40),
    windowEnd: windowEnd(name, y, mo, d),
    mixedDays: wd.some((w) => typeof w === 'number') && wd.some((w) => typeof w !== 'number'),
    ...(count === undefined ? {} : { count }),
  }
}

export const toDate = (wall: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(wall)!

  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)))
}

export const wallOf = (date: Date, timed: boolean): string => {
  const iso = date.toISOString()

  return timed ? iso.slice(0, 16) : iso.slice(0, 10)
}
