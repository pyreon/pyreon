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

/** One random rule that always has occurrences, in both our shape and `rrule`'s. */
export function makeCase(seed: number): Case {
  const r = rng(seed)
  const [name, freq] = pick(r, FREQS.slice(0, 6).filter((_, i) => i < 4 || r() < 0.25))
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
  const on: Record<string, unknown> = {}
  const opts: Partial<Options> = { freq, interval, wkst: RDAYS[wkst - 1] as RWeekday, dtstart: new Date(Date.UTC(y, mo - 1, d, timed ? h : 0, timed ? mi : 0)) }
  const parts = r() < 0.3 ? 0 : int(r, 1, 3)
  const used = new Set<string>()

  for (let i = 0; i < parts; i++) {
    const kind = pick(r, ['months', 'monthDays', 'weekdays', 'yearDays', 'weeks', 'hours', 'minutes', 'position'])

    if (used.has(kind)) continue
    used.add(kind)
    if (kind === 'months') {
      on.months = subset(r, 1, 12, 3)
      opts.bymonth = on.months as number[]
    } else if (kind === 'monthDays' && !sub) {
      on.monthDays = subset(r, 1, 28, 3).map((v) => (r() < 0.2 ? v - 29 : v))
      opts.bymonthday = on.monthDays as number[]
    } else if (kind === 'weekdays' && !sub) {
      const nthOk = name === 'month' || name === 'year'
      const list: WeekdaySpec[] = subset(r, 1, 7, 3).map((w) => (nthOk && r() < 0.4 ? { weekday: w as 1, nth: pick(r, [1, 2, 3, -1, -2]) } : (w as 1)))

      on.weekdays = list
      opts.byweekday = list.map((w) => (typeof w === 'number' ? RDAYS[w - 1]! : RDAYS[w.weekday - 1]!.nth(w.nth)))
    } else if (kind === 'yearDays' && !sub) {
      on.yearDays = subset(r, 1, 360, 3).map((v) => (r() < 0.2 ? v - 361 : v))
      opts.byyearday = on.yearDays as number[]
    } else if (kind === 'weeks' && name === 'year') {
      on.weeks = subset(r, 1, 52, 2)
      opts.byweekno = on.weeks as number[]
    } else if (kind === 'hours' && timed) {
      on.hours = subset(r, 0, 23, 3)
      opts.byhour = [...(on.hours as number[])].sort((a, b) => a - b)
    } else if (kind === 'minutes' && timed) {
      on.minutes = subset(r, 0, 59, 3)
      opts.byminute = [...(on.minutes as number[])].sort((a, b) => a - b)
    } else if (kind === 'position' && name !== 'minute' && name !== 'hour') {
      // Positions beyond the period's size are where `rrule` clamps and duplicates; those cases have their own divergence test.
      on.position = pick(r, [[1], [2], [-1]])
      opts.bysetpos = on.position as number[]
    }
  }
  const limit = int(r, 5, 40)
  const end = new Date(Date.UTC(y, mo - 1, d, 0, 0))
  const count = r() < 0.3 ? int(r, 3, 15) : undefined

  if (name === 'minute') end.setUTCDate(end.getUTCDate() + 3)
  else if (name === 'hour') end.setUTCDate(end.getUTCDate() + 30)
  else end.setUTCFullYear(end.getUTCFullYear() + 8)
  const windowEnd = end.toISOString().slice(0, 16)
  const rule: Recurrence = { every: name, start: start as Recurrence['start'], ...(interval === 1 ? {} : { interval }), ...(wkst === 1 ? {} : { weekStart: wkst as 1 }), ...(Object.keys(on).length > 0 ? { on } : {}), ...(count === undefined ? {} : { count }) }

  const wd = (on.weekdays as WeekdaySpec[] | undefined) ?? []
  const mixedDays = wd.some((w) => typeof w === 'number') && wd.some((w) => typeof w !== 'number')

  return { seed, rule, options: opts, limit, windowEnd, mixedDays, ...(count === undefined ? {} : { count }) }
}

export const toDate = (wall: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(wall)!

  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)))
}

export const wallOf = (date: Date, timed: boolean): string => {
  const iso = date.toISOString()

  return timed ? iso.slice(0, 16) : iso.slice(0, 10)
}
