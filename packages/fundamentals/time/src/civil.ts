/**
 * Proleptic Gregorian calendar arithmetic on integers: Howard Hinnant's days-from-civil and civil-from-days
 * (https://howardhinnant.github.io/date_algorithms.html). No `Date` object anywhere on this path.
 *
 * A "civil" triple is packed into one integer, `(year << 9) | (month << 5) | day`, so the hot paths neither allocate
 * nor use module-level scratch state.
 */

/** Epoch day of 0001-01-01 and of 9999-12-31 (epoch day 0 is 1970-01-01). */
export const MIN_DAY = -719162
export const MAX_DAY = 2932896

export const MS_PER_DAY = 86_400_000

const CUMULATIVE_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

export function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function daysIn(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

export function dayOfYearOf(year: number, month: number, day: number): number {
  return CUMULATIVE_DAYS[month - 1]! + day + (month > 2 && isLeap(year) ? 1 : 0)
}

/** Days since 1970-01-01 of a valid civil date with `year >= 1`. */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = (((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) | 0) + day - 1
  const doe = yoe * 365 + ((yoe / 4) | 0) - ((yoe / 100) | 0) + doy

  return era * 146_097 + doe - 719_468
}

/** The packed civil triple of an epoch day. */
export function civilFromDays(epochDay: number): number {
  const z = epochDay + 719_468
  const era = Math.floor(z / 146_097)
  const doe = z - era * 146_097
  const yoe = ((doe - ((doe / 1460) | 0) + ((doe / 36_524) | 0) - ((doe / 146_096) | 0)) / 365) | 0
  const doy = doe - (365 * yoe + ((yoe / 4) | 0) - ((yoe / 100) | 0))
  const mp = ((5 * doy + 2) / 153) | 0
  const day = doy - (((153 * mp + 2) / 5) | 0) + 1
  const month = mp < 10 ? mp + 3 : mp - 9

  return (((yoe + era * 400 + (month <= 2 ? 1 : 0)) << 9) | (month << 5)) | day
}

/** ISO weekday (1 Monday ... 7 Sunday) of an epoch day. 1970-01-01 was a Thursday. */
export function weekdayOf(epochDay: number): number {
  return ((((epochDay + 3) % 7) + 7) % 7) + 1
}

/** Number of ISO weeks (52 or 53) in a year. */
export function isoWeeksInYear(year: number): number {
  return isoPhase(year) === 4 || isoPhase(year - 1) === 3 ? 53 : 52
}

function isoPhase(y: number): number {
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) % 7
}
