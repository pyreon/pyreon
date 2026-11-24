/**
 * Calendar arithmetic on epoch days (days since 1970-01-01) and on "wall" values: milliseconds since 1970-01-01T00:00 read
 * as if the wall clock were UTC. A wall value is only a number to order and add; no zone is involved until `toInstants`.
 */
import { dateParts, isPlainDate, isPlainDateTime, timeParts } from '@pyreon/time/core'
import type { PlainDate, PlainDateTime } from '@pyreon/time/core'
import { badValue } from './errors'

export const DAY = 86_400_000
export const HOUR = 3_600_000
export const MINUTE = 60_000
/** The last day the plain values can write (9999-12-31) and the first (0001-01-01), as epoch days. */
export const MAX_DAY = 2_932_896
export const MIN_DAY = -719_162

export function isLeap(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
}

export function daysIn(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28

  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31
}

/** Epoch day of a proleptic Gregorian date. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy

  return era * 146_097 + doe - 719_468
}

/** The date of an epoch day, packed as `year * 512 + month * 32 + day`. */
export function civilFromDays(z: number): number {
  const zz = z + 719_468
  const era = Math.floor(zz / 146_097)
  const doe = zz - era * 146_097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)

  return y * 512 + m * 32 + d
}

export const yearOf = (packed: number): number => packed >> 9
export const monthOf = (packed: number): number => (packed >> 5) & 15
export const dayOf = (packed: number): number => packed & 31

/** ISO weekday of an epoch day: 1 is Monday, 7 is Sunday. 1970-01-01 was a Thursday. */
export function weekdayOf(day: number): number {
  return (((day + 3) % 7) + 7) % 7 + 1
}

/** The epoch day on which week 1 of `year` starts, for a week that starts on `wkst` and whose first week has four days. */
export function weekOneStart(year: number, wkst: number): number {
  const jan4 = daysFromCivil(year, 1, 4)

  return jan4 - ((weekdayOf(jan4) - wkst + 7) % 7)
}

export function weeksInYear(year: number, wkst: number): number {
  return (weekOneStart(year + 1, wkst) - weekOneStart(year, wkst)) / 7
}

const pad = (n: number, w: number): string => String(n).padStart(w, '0')

export function writeDate(day: number): PlainDate {
  const p = civilFromDays(day)

  return `${pad(yearOf(p), 4)}-${pad(monthOf(p), 2)}-${pad(dayOf(p), 2)}` as PlainDate
}

/** The canonical PlainDateTime of a wall value: seconds and milliseconds appear only when they are not zero. */
export function writeWall(wall: number): PlainDateTime {
  const day = Math.floor(wall / DAY)
  const tod = wall - day * DAY
  const h = Math.floor(tod / HOUR)
  const mi = Math.floor((tod % HOUR) / MINUTE)
  const s = Math.floor((tod % MINUTE) / 1000)
  const ms = tod % 1000
  let time = `${pad(h, 2)}:${pad(mi, 2)}`

  if (s !== 0 || ms !== 0) time += `:${pad(s, 2)}`
  if (ms !== 0) time += `.${pad(ms, 3)}`

  return `${writeDate(day)}T${time}` as PlainDateTime
}

/** A plain date or date-time as a wall value, and whether it was a date (midnight). Throws a `[Pyreon]` TypeError otherwise. */
export function readWall(fn: string, what: string, value: unknown): { wall: number; dateOnly: boolean } {
  if (isPlainDate(value)) {
    const p = dateParts(value)

    return { wall: daysFromCivil(p.year, p.month, p.day) * DAY, dateOnly: true }
  }
  if (isPlainDateTime(value)) {
    const p = dateParts(value)
    const t = timeParts(value)

    return { wall: daysFromCivil(p.year, p.month, p.day) * DAY + t.hour * HOUR + t.minute * MINUTE + t.second * 1000 + t.millisecond, dateOnly: false }
  }

  return badValue(fn, `${what} to be a PlainDate ("2026-11-18") or a PlainDateTime ("2026-11-18T09:00")`, value, 'Check user input with isPlainDate / isPlainDateTime from @pyreon/time first.')
}

/** The epoch day of a plain date, or a thrown error. */
export function readDay(fn: string, what: string, value: unknown): number {
  if (!isPlainDate(value)) return badValue(fn, `${what} to be a PlainDate ("2026-11-18")`, value)
  const p = dateParts(value)

  return daysFromCivil(p.year, p.month, p.day)
}
