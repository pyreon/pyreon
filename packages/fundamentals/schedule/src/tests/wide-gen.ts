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

interface Ctx {
  r: Rand
  every: string
  timed: boolean
  on: Record<string, unknown>
}

const PARTS: Record<string, (c: Ctx) => void> = {
  months: (c) => {
    c.on.months = subset(c.r, 1, 12, 4)
  },
  monthDays: (c) => {
    c.on.monthDays = subset(c.r, 1, 31, 3).map((v) => (c.r() < 0.25 ? v - 32 : v))
  },
  weekdays: (c) => {
    const nthOk = c.every === 'month' || c.every === 'year'

    c.on.weekdays = subset(c.r, 1, 7, 3).map((w): WeekdaySpec => (nthOk && c.r() < 0.5 ? { weekday: w as 1, nth: pick(c.r, [1, 2, 3, 4, 5, -1, -2, -3, -4]) } : (w as 1)))
  },
  yearDays: (c) => {
    c.on.yearDays = subset(c.r, 1, 366, 3).map((v) => (c.r() < 0.25 ? v - 367 : v))
  },
  weeks: (c) => {
    if (c.every === 'year') c.on.weeks = subset(c.r, 1, 53, 3).map((v) => (c.r() < 0.2 ? v - 54 : v))
  },
  hours: (c) => {
    if (c.timed) c.on.hours = subset(c.r, 0, 23, 3)
  },
  minutes: (c) => {
    if (c.timed) c.on.minutes = subset(c.r, 0, 59, 3)
  },
  position: (c) => {
    c.on.position = subset(c.r, 1, 4, 3).map((v) => (c.r() < 0.4 ? -v : v))
  },
}

export function makeWideCase(seed: number): WideCase {
  const r = rng(seed * 7919 + 13)
  const every = pick(r, ['year', 'month', 'week', 'day'] as const)
  const y = int(r, 1999, 2030)
  const m = int(r, 1, 12)
  const d = Math.min(int(r, 1, 31), new Date(Date.UTC(y, m, 0)).getUTCDate())
  const timed = r() < 0.6
  const start = `${y}-${pad(m)}-${pad(d)}${timed ? `T${pad(int(r, 0, 23))}:${pad(pick(r, [0, 15, 30, 45]))}` : ''}`
  const ctx: Ctx = { r, every, timed, on: {} }

  for (let i = r() < 0.2 ? 0 : int(r, 1, 3); i > 0; i--) {
    const kind = pick(r, Object.keys(PARTS))

    if (!(kind in ctx.on)) PARTS[kind]!(ctx)
  }
  const end = new Date(Date.UTC(y + 6, m - 1, 1))
  const extra = (): string => `${y + int(r, 1, 5)}-${pad(int(r, 1, 12))}-${pad(int(r, 1, 28))}${timed ? `T${pad(int(r, 0, 23))}:00` : ''}`
  const optional = <K extends string, V>(p: number, key: K, make: () => V): { [Q in K]?: V } => (r() < p ? ({ [key]: make() } as { [Q in K]?: V }) : {})
  const rule = {
    every,
    start,
    ...optional(0.5, 'interval', () => int(r, 2, 4)),
    ...optional(0.5, 'weekStart', () => int(r, 1, 7)),
    ...(Object.keys(ctx.on).length > 0 ? { on: ctx.on } : {}),
    ...optional(0.35, 'count', () => int(r, 2, 25)),
    ...optional(0.25, 'except', () => [extra(), extra()]),
    ...optional(0.2, 'also', () => [extra()]),
  } as unknown as Recurrence

  return { seed, rule, windowEnd: `${end.toISOString().slice(0, 10)}${timed ? 'T00:00' : ''}` }
}
