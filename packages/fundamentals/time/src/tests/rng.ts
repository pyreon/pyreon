/** Seeded generator (mulberry32) so a failing differential case reproduces from its seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0

  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rand = () => number

export const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1))

export const pick = <T>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length)]!

const pad = (n: number, w: number): string => String(n).padStart(w, '0')

export const isLeapYear = (y: number): boolean => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)

export function monthLength(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28

  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

/** Mostly years people use, sometimes the whole supported range. */
export function year(r: Rand): number {
  return r() < 0.8 ? int(r, 1900, 2100) : int(r, 1, 9999)
}

export function date(r: Rand): string {
  const y = year(r)
  const m = int(r, 1, 12)
  const edge = pick(r, [1, monthLength(y, m), 28, 29, 30, 31].filter((x) => x <= monthLength(y, m)))
  const d = r() < 0.25 ? edge : int(r, 1, monthLength(y, m))

  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`
}

export function yearMonth(r: Rand): string {
  return date(r).slice(0, 7)
}

export type Level = 0 | 1 | 2

export function time(r: Rand, level: Level = pick(r, [0, 1, 2] as const)): string {
  const base = `${pad(int(r, 0, 23), 2)}:${pad(int(r, 0, 59), 2)}`

  if (level === 0) return base
  const withSeconds = `${base}:${pad(int(r, 0, 59), 2)}`

  return level === 1 ? withSeconds : `${withSeconds}.${pad(int(r, 0, 999), 3)}`
}

export function dateTime(r: Rand): string {
  return `${date(r)}T${time(r)}`
}

export interface Dur {
  years?: number
  months?: number
  weeks?: number
  days?: number
  hours?: number
  minutes?: number
  seconds?: number
  milliseconds?: number
}

const DATE_FIELDS = ['years', 'months', 'weeks', 'days'] as const
const TIME_FIELDS = ['hours', 'minutes', 'seconds', 'milliseconds'] as const

/** A same-sign duration over the given fields, with magnitudes that cross month, year and day boundaries. */
export function duration(r: Rand, fields: readonly (keyof Dur)[]): Dur {
  const sign = r() < 0.5 ? -1 : 1
  const out: Dur = {}
  const count = int(r, 1, Math.min(3, fields.length))

  for (let i = 0; i < count; i++) {
    const key = pick(r, fields)
    const big = r() < 0.15

    out[key] = sign * (big ? int(r, 0, key === 'years' ? 400 : key === 'milliseconds' ? 200_000_000 : 5000) : int(r, 0, key === 'years' ? 5 : key === 'months' ? 30 : 40))
  }

  return out
}

export const dateDuration = (r: Rand): Dur => duration(r, DATE_FIELDS)
export const dateTimeDuration = (r: Rand): Dur => duration(r, [...DATE_FIELDS, ...TIME_FIELDS])
export const yearMonthDuration = (r: Rand): Dur => duration(r, ['years', 'months'])
export { pad }
