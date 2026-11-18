/** Wider random rules for the brute-force oracle: every BY part, any positions, mixed weekday lists, `count`, `until`, `except`, `also`. */
import { int, pick, rng, type Rand } from './rng'
import type { Recurrence, WeekdaySpec } from '../types'

const subset = (r: Rand, lo: number, hi: number, max: number): number[] => {
  const n = int(r, 1, max)
  const set = new Set<number>()

  while (set.size < n) set.add(int(r, lo, hi))

  return [...set]
}
const pad = (n: number): string => String(n).padStart(2, '0')

export interface WideCase {
  seed: number
  rule: Recurrence
  windowEnd: string
}

export function makeWideCase(seed: number): WideCase {
  const r = rng(seed * 7919 + 13)
  const every = pick(r, ['year', 'month', 'week', 'day'] as const)
  const y = int(r, 1999, 2030)
  const m = int(r, 1, 12)
  const d = Math.min(int(r, 1, 31), new Date(Date.UTC(y, m, 0)).getUTCDate())
  const timed = r() < 0.6
  const start = `${y}-${pad(m)}-${pad(d)}${timed ? `T${pad(int(r, 0, 23))}:${pad(pick(r, [0, 15, 30, 45]))}` : ''}`
  const on: Record<string, unknown> = {}
  const parts = r() < 0.2 ? 0 : int(r, 1, 3)

  for (let i = 0; i < parts; i++) {
    const kind = pick(r, ['months', 'monthDays', 'weekdays', 'yearDays', 'weeks', 'hours', 'minutes', 'position'])

    if (kind in on) continue
    if (kind === 'months') on.months = subset(r, 1, 12, 4)
    else if (kind === 'monthDays') on.monthDays = subset(r, 1, 31, 3).map((v) => (r() < 0.25 ? v - 32 : v))
    else if (kind === 'weekdays') {
      const nthOk = every === 'month' || every === 'year'

      on.weekdays = subset(r, 1, 7, 3).map((w): WeekdaySpec => (nthOk && r() < 0.5 ? { weekday: w as 1, nth: pick(r, [1, 2, 3, 4, 5, -1, -2, -3, -4]) } : (w as 1)))
    } else if (kind === 'yearDays') on.yearDays = subset(r, 1, 366, 3).map((v) => (r() < 0.25 ? v - 367 : v))
    else if (kind === 'weeks' && every === 'year') on.weeks = subset(r, 1, 53, 3).map((v) => (r() < 0.2 ? v - 54 : v))
    else if (kind === 'hours' && timed) on.hours = subset(r, 0, 23, 3)
    else if (kind === 'minutes' && timed) on.minutes = subset(r, 0, 59, 3)
    else if (kind === 'position') on.position = subset(r, 1, 4, 3).map((v) => (r() < 0.4 ? -v : v))
  }
  const end = new Date(Date.UTC(y + 6, m - 1, 1))
  const extra = (): string => `${y + int(r, 1, 5)}-${pad(int(r, 1, 12))}-${pad(int(r, 1, 28))}${timed ? `T${pad(int(r, 0, 23))}:00` : ''}`
  const rule: Recurrence = {
    every,
    start: start as Recurrence['start'],
    ...(r() < 0.5 ? {} : { interval: int(r, 2, 4) }),
    ...(r() < 0.5 ? {} : { weekStart: int(r, 1, 7) as 1 }),
    ...(Object.keys(on).length > 0 ? { on } : {}),
    ...(r() < 0.35 ? { count: int(r, 2, 25) } : {}),
    ...(r() < 0.25 ? { except: [extra(), extra()] as Recurrence['except'] } : {}),
    ...(r() < 0.2 ? { also: [extra()] as Recurrence['also'] } : {}),
  }

  return { seed, rule, windowEnd: `${end.toISOString().slice(0, 10)}${timed ? 'T00:00' : ''}` }
}
