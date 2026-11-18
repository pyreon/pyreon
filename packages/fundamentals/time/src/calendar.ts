import { weekStartOption, type WeekOptions } from './arith'
import { daysFromCivil, daysIn, dayOfYearOf, isLeap, isoWeeksInYear, weekdayOf } from './civil'
import { badRange, badValue, DATE_HINT, DATETIME_HINT, show } from './errors'
import { checkDay, isPlainDateTime, isPlainYearMonth, packedYearMonth, parseDateAt, writeDay, writeYMD } from './text'
import type { PlainDate, PlainDateTime, PlainYearMonth, Weekday } from './types'

/** Packed civil triple of a PlainDate or PlainDateTime. */
function civilOf(fn: string, value: unknown): number {
  const ok = typeof value === 'string' && (value.length === 10 ? parseDateAt(value) >= 0 : isPlainDateTime(value))

  return ok ? parseDateAt(value as string) : badValue(fn, `${DATE_HINT} or ${DATETIME_HINT}`, value)
}

/**
 * ISO weekday: 1 is Monday, 7 is Sunday (unlike `Date#getDay`, where Sunday is 0).
 *
 * @example dayOfWeek('2026-11-18') // => 3
 * @example dayOfWeek('2026-11-22') // => 7
 */
export function dayOfWeek(value: PlainDate | PlainDateTime): Weekday {
  const p = civilOf('dayOfWeek', value)

  return weekdayOf(daysFromCivil(p >> 9, (p >> 5) & 15, p & 31)) as Weekday
}

/**
 * 1 for January 1st through 365 or 366.
 *
 * @example dayOfYear('2024-12-31') // => 366
 */
export function dayOfYear(value: PlainDate | PlainDateTime): number {
  const p = civilOf('dayOfYear', value)

  return dayOfYearOf(p >> 9, (p >> 5) & 15, p & 31)
}

/**
 * ISO 8601 week number, 1-53: week 1 contains the year's first Thursday and weeks start on Monday. Days at the turn of the
 * year can belong to a week of the neighbouring year: see `yearOfWeek`.
 *
 * @example weekOfYear('2027-01-01') // => 53
 * @example weekOfYear('2024-12-30') // => 1
 */
export function weekOfYear(value: PlainDate | PlainDateTime): number {
  return isoWeek('weekOfYear', value) % 100
}

/**
 * The ISO week-based year of a date: 2027-01-01 belongs to week 53 of 2026.
 *
 * @example yearOfWeek('2027-01-01') // => 2026
 * @example yearOfWeek('2024-12-30') // => 2025
 */
export function yearOfWeek(value: PlainDate | PlainDateTime): number {
  return Math.floor(isoWeek('yearOfWeek', value) / 100)
}

/** `weekYear * 100 + week`. */
function isoWeek(fn: string, value: unknown): number {
  const p = civilOf(fn, value)
  const year = p >> 9
  const doy = dayOfYearOf(year, (p >> 5) & 15, p & 31)
  const week = Math.floor((doy - weekdayOf(daysFromCivil(year, (p >> 5) & 15, p & 31)) + 10) / 7)

  if (week < 1) return (year - 1) * 100 + isoWeeksInYear(year - 1)

  return week > isoWeeksInYear(year) ? (year + 1) * 100 + 1 : year * 100 + week
}

/**
 * Number of days in the month of the value (months are 1-12 in the strings it reads).
 *
 * @example daysInMonth('2024-02') // => 29
 * @example daysInMonth('2026-11-18') // => 30
 */
export function daysInMonth(value: PlainDate | PlainDateTime | PlainYearMonth): number {
  const p = typeof value === 'string' && value.length === 7 ? packedYearMonth('daysInMonth', value) : civilOf('daysInMonth', value)

  return daysIn(p >> 9, (p >> 5) & 15)
}

/**
 * Whether a year, or the year of a value, is a Gregorian leap year (1900 and 2100 are not, 2000 is).
 *
 * @example isLeapYear(2000) // => true
 * @example isLeapYear('2100-06') // => false
 */
export function isLeapYear(value: number | PlainDate | PlainDateTime | PlainYearMonth): boolean {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 9999 ? isLeap(value) : badRange('isLeapYear', `year must be an integer from 1 to 9999, got ${value}`)
  if (isPlainYearMonth(value)) return isLeap(packedYearMonth('isLeapYear', value) >> 9)

  return isLeap(civilOf('isLeapYear', value) >> 9)
}

/**
 * Every date from `start` to `end`, both included; empty when `end` is before `start`.
 *
 * @example eachDay('2026-02-27', '2026-03-02') // => ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']
 */
export function eachDay(start: PlainDate, end: PlainDate): PlainDate[] {
  const ps = civilOf('eachDay', start)
  const pe = civilOf('eachDay', end)
  const out: PlainDate[] = []
  const last = daysFromCivil(pe >> 9, (pe >> 5) & 15, pe & 31)
  let year = ps >> 9
  let month = (ps >> 5) & 15
  let day = ps & 31
  let remaining = last - daysFromCivil(year, month, day) + 1

  while (remaining-- > 0) {
    out.push(writeYMD(year, month, day))
    if (++day > daysIn(year, month)) {
      day = 1
      if (++month > 12) {
        month = 1
        year++
      }
    }
  }

  return out
}

/**
 * Options of `monthGrid`: `weekStart` (ISO weekday, 1 Monday ... 7 Sunday) and `weeks` (`'auto'` or 6).
 *
 * @example const options: MonthGridOptions = { weekStart: 7, weeks: 6 }
 */
export interface MonthGridOptions extends WeekOptions {
  /** `'auto'` (default): only the weeks the month occupies (4 to 6 rows). `6`: always six rows, so a picker keeps its height. */
  weeks?: 6 | 'auto'
}

/**
 * The weeks of a month as rows of seven dates, including the days of the neighbouring months that fill the first and last
 * row. `weekStart` is an ISO weekday (1 Monday, the default, to 7 Sunday); `weeks: 6` always returns six rows.
 *
 * @example monthGrid('2026-11')[0] // => ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
 * @example monthGrid('2026-02', { weekStart: 7 }).length // => 4
 */
export function monthGrid(month: PlainYearMonth | PlainDate, options?: MonthGridOptions): PlainDate[][] {
  const weekStart = weekStartOption('monthGrid', options)
  const weeks = options?.weeks ?? 'auto'

  if (weeks !== 'auto' && weeks !== 6) return badRange('monthGrid', `weeks must be 'auto' or 6, got ${show(weeks)}`)
  const p = typeof month === 'string' && month.length === 7 ? packedYearMonth('monthGrid', month) : civilOf('monthGrid', month)
  const first = daysFromCivil(p >> 9, (p >> 5) & 15, 1)
  const lead = (weekdayOf(first) - weekStart + 7) % 7
  const rows = weeks === 6 ? 6 : Math.ceil((lead + daysIn(p >> 9, (p >> 5) & 15)) / 7)
  const start = checkDay('monthGrid', first - lead)

  checkDay('monthGrid', start + rows * 7 - 1)
  const grid: PlainDate[][] = []

  for (let r = 0; r < rows; r++) {
    const row: PlainDate[] = []

    for (let c = 0; c < 7; c++) row.push(writeDay(start + r * 7 + c))
    grid.push(row)
  }

  return grid
}

// ---------------------------------------------------------------------------------------------------------------------
// Locale week data
// ---------------------------------------------------------------------------------------------------------------------

interface WeekInfo {
  firstDay: Weekday
  weekend: readonly Weekday[]
}

const SUNDAY_FIRST = new Set(
  'AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW'.split(' '),
)

const SATURDAY_FIRST = new Set('AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY'.split(' '))
const FRI_SAT_WEEKEND = new Set('BH DZ EG IL IQ JO KW LY OM QA SA SD SY YE'.split(' '))

const WEEK_CACHE_LIMIT = 64
const weekCache = new Map<string, WeekInfo>()

/** Region subtag of a locale tag (`cs-CZ` is `CZ`), or `''`. Used only when `Intl.Locale` week data is missing. */
function regionOf(locale: string): string {
  try {
    const loc = new Intl.Locale(locale)

    return (loc.region ?? loc.maximize().region ?? '').toUpperCase()
  } catch {
    return ''
  }
}

/** The week data table used when the platform has none. Exported for tests, not part of the public API. */
export function fallbackWeekInfo(region: string): WeekInfo {
  const firstDay: Weekday = SUNDAY_FIRST.has(region) ? 7 : SATURDAY_FIRST.has(region) ? 6 : 1
  return { firstDay, weekend: Object.freeze(fallbackWeekend(region).slice() as Weekday[]) }
}

function fallbackWeekend(region: string): readonly Weekday[] {
  if (FRI_SAT_WEEKEND.has(region)) return [5, 6]
  if (region === 'AF') return [4, 5]
  if (region === 'IR') return [5]

  return region === 'IN' ? [7] : [6, 7]
}

interface PlatformWeekInfo {
  firstDay?: number
  weekend?: number[]
}

function platformWeekInfo(locale: string): WeekInfo | undefined {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & { weekInfo?: PlatformWeekInfo; getWeekInfo?: () => PlatformWeekInfo }
    const info = loc.getWeekInfo?.() ?? loc.weekInfo
    const first = info?.firstDay

    if (typeof first !== 'number' || first < 1 || first > 7) return undefined

    return { firstDay: first as Weekday, weekend: Object.freeze((info?.weekend ?? [6, 7]).slice() as Weekday[]) }
  } catch {
    return undefined
  }
}

function weekInfoOf(locale: string): WeekInfo {
  if (typeof locale !== 'string') return badValue('weekStartOf', 'a locale tag such as "en-US"', locale)
  const cached = weekCache.get(locale)

  if (cached !== undefined) return cached
  const info = platformWeekInfo(locale) ?? fallbackWeekInfo(regionOf(locale))

  // Bounded: a long-lived server sees few locales, but the table must not grow with arbitrary input. The oldest entry goes first.
  if (weekCache.size >= WEEK_CACHE_LIMIT) weekCache.delete(weekCache.keys().next().value as string)
  weekCache.set(locale, info)

  return info
}

/**
 * First day of the week for a locale as an ISO weekday (1 Monday ... 7 Sunday). A malformed tag gives Monday.
 *
 * @example weekStartOf('en-US') // => 7
 * @example weekStartOf('cs') // => 1
 */
export function weekStartOf(locale: string): Weekday {
  return weekInfoOf(locale).firstDay
}

/**
 * The weekend days of a locale as ISO weekdays (1 Monday ... 7 Sunday). The array is shared and frozen.
 *
 * @example weekendOf('en-US') // => [6, 7]
 * @example weekendOf('he-IL') // => [5, 6]
 */
export function weekendOf(locale: string): readonly Weekday[] {
  return weekInfoOf(locale).weekend
}

/** Number of cached locales (for tests). */
export function weekCacheSize(): number {
  return weekCache.size
}
