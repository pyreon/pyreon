/**
 * Date and time formatters: `formatDate`, `formatTime`, `formatDateTime`,
 * `formatRelative`, `formatRelativeTo`, `formatDateRange`, `formatDateToParts`.
 *
 * The cache variant of a date formatter is its time zone. A calendar value
 * (`2026-11-18`, `2026-11-18T14:30`) uses the variant `PLAIN` and is formatted
 * as UTC, so it can never shift.
 */
import { clearTable, construct, createTable, resolve } from './cache'
import { badLocale, fallbackOf, preset } from './number'
import { lastWasPlain, toMillis } from './input'
import { programmerError, warnInvalid } from './warn'
import type {
  DateInput,
  DateRangeOptions,
  DateStylePreset,
  DateTimeOptions,
  RelativeOptions,
  RelativePreset,
  RelativeUnit,
} from './types'

type DtOpts = Intl.DateTimeFormatOptions

/** The variant of a calendar value. Not a valid zone name, so it cannot collide with one. */
const PLAIN = '='

const FIELD_KEYS = [
  'weekday', 'era', 'year', 'month', 'day', 'dayPeriod', 'hour', 'minute', 'second',
  'fractionalSecondDigits', 'dateStyle', 'timeStyle',
] as const

function hasFields(o: DtOpts): boolean {
  for (const k of FIELD_KEYS) if (o[k] !== undefined) return true
  return false
}

type Defaults = 'date' | 'time' | 'dateTime'

/**
 * What `formatDate` / `formatTime` / `formatDateTime` show when the options
 * name no field or style. With `timeZoneName` the styles cannot be used (they
 * reject it), so the equivalent fields are.
 */
function defaultsFor(kind: Defaults, o: DtOpts): DtOpts {
  const zoned = o.timeZoneName !== undefined
  const date: DtOpts = zoned ? { year: 'numeric', month: 'short', day: 'numeric' } : { dateStyle: 'medium' }
  const time: DtOpts = zoned ? { hour: 'numeric', minute: '2-digit' } : { timeStyle: 'short' }
  return kind === 'date' ? date : kind === 'time' ? time : { ...date, ...time }
}

const STYLE_PRESETS: Record<DateStylePreset, DtOpts['dateStyle']> = {
  short: 'short', medium: 'medium', long: 'long', full: 'full',
}

function styleOf(name: string, kind: Defaults, fn: string): DtOpts {
  if (!Object.hasOwn(STYLE_PRESETS, name)) {
    throw programmerError(fn, `unknown preset ${JSON.stringify(name)}. Valid presets: short, medium, long, full. Pass an options object for anything else.`)
  }
  const style = STYLE_PRESETS[name as DateStylePreset]
  return kind === 'date' ? { dateStyle: style } : kind === 'time' ? { timeStyle: style } : { dateStyle: style, timeStyle: style }
}

function badOptions(fn: string): (error: unknown) => Error {
  return (error) =>
    programmerError(
      fn,
      `${error instanceof Error ? error.message : String(error)}. Check the options against Intl.DateTimeFormat (a dateStyle/timeStyle cannot be combined with field options such as month or hour; timeZone must be an IANA name).`,
    )
}

function makeDt(fn: string, kind: Defaults, locale: string, zone: string, options: object | string | undefined): Intl.DateTimeFormat {
  let o: DtOpts
  if (typeof options === 'string') o = styleOf(options, kind, fn)
  else {
    const given = (options ?? {}) as DtOpts
    o = hasFields(given) ? { ...given } : { ...given, ...defaultsFor(kind, given) }
  }
  if (zone === PLAIN) {
    o.timeZone = 'UTC'
    // A calendar value has no zone: a zone name next to it would read as a lie,
    // so the long/full time styles (which print one) become `medium`.
    delete o.timeZoneName
    if (o.timeStyle === 'long' || o.timeStyle === 'full') o.timeStyle = 'medium'
  } else if (zone !== '') o.timeZone = zone
  return construct((l, x) => new Intl.DateTimeFormat(l, x), locale, o, badOptions(fn), badLocale(fn))
}

const dateTable = createTable<Intl.DateTimeFormat>((l, z, o) => makeDt('formatDate', 'date', l, z, o))
const timeTable = createTable<Intl.DateTimeFormat>((l, z, o) => makeDt('formatTime', 'time', l, z, o))
const dateTimeTable = createTable<Intl.DateTimeFormat>((l, z, o) => makeDt('formatDateTime', 'dateTime', l, z, o))
const rangeTable = createTable<Intl.DateTimeFormat>((l, z, o) => makeDt('formatDateRange', 'date', l, z, o))
const partsTable = createTable<Intl.DateTimeFormat>((l, z, o) => makeDt('formatDateToParts', 'dateTime', l, z, o))

function missingOrInvalid(fn: string, value: DateInput, options: unknown): string {
  if (value != null) {
    warnInvalid(fn, value, 'a Date, epoch milliseconds, or an ISO 8601 string such as "2026-11-18" or "2026-11-18T14:30:00Z"')
  }
  return fallbackOf(options)
}

type DateArg = DateTimeOptions | DateStylePreset | undefined

function zoneOf(zone: string): string {
  return lastWasPlain() ? PLAIN : zone
}

export function dateIn(locale: string, zone: string, value: DateInput, options: DateArg): string {
  const ms = toMillis(value)
  if (ms !== ms) return missingOrInvalid('formatDate', value, options)
  return resolve(dateTable, locale, zoneOf(zone), options).format(ms)
}

export function timeIn(locale: string, zone: string, value: DateInput, options: DateArg): string {
  const ms = toMillis(value)
  if (ms !== ms) return missingOrInvalid('formatTime', value, options)
  return resolve(timeTable, locale, zoneOf(zone), options).format(ms)
}

export function dateTimeIn(locale: string, zone: string, value: DateInput, options: DateArg): string {
  const ms = toMillis(value)
  if (ms !== ms) return missingOrInvalid('formatDateTime', value, options)
  return resolve(dateTimeTable, locale, zoneOf(zone), options).format(ms)
}

export function dateToPartsIn(locale: string, zone: string, value: DateInput, options: DateArg): Intl.DateTimeFormatPart[] {
  const ms = toMillis(value)
  if (ms !== ms) {
    missingOrInvalid('formatDateToParts', value, options)
    return []
  }
  return resolve(partsTable, locale, zoneOf(zone), options).formatToParts(ms)
}

export function dateRangeIn(
  locale: string,
  zone: string,
  start: DateInput,
  end: DateInput,
  options: DateRangeOptions | DateStylePreset | undefined,
): string {
  const a = toMillis(start)
  const plainA = lastWasPlain()
  const b = toMillis(end)
  const plainB = lastWasPlain()
  if (a !== a || b !== b) {
    if (a !== a) missingOrInvalid('formatDateRange', start, options)
    else missingOrInvalid('formatDateRange', end, options)
    return fallbackOf(options)
  }
  // Both calendar values: format as calendar days. Otherwise everything is an instant in `zone`.
  return resolve(rangeTable, locale, plainA && plainB ? PLAIN : zone, options).formatRange(a, b)
}

// ─── relative ────────────────────────────────────────────────────────────────

const RELATIVE_PRESETS: Record<RelativePreset, Intl.RelativeTimeFormatOptions> = {
  always: { numeric: 'always' },
  auto: { numeric: 'auto' },
}

function relativeOptions(options: object | string | undefined, fn: string): Intl.RelativeTimeFormatOptions | undefined {
  if (options === undefined) return undefined
  if (typeof options === 'string') return preset(RELATIVE_PRESETS, options, fn)
  return options as Intl.RelativeTimeFormatOptions
}

function makeRelative(fn: string, defaults: Intl.RelativeTimeFormatOptions, locale: string, options: object | string | undefined) {
  return construct(
    (l, o) => new Intl.RelativeTimeFormat(l, o),
    locale,
    { ...defaults, ...relativeOptions(options, fn) },
    (error) =>
      programmerError(fn, `${error instanceof Error ? error.message : String(error)}. numeric is 'always' | 'auto', style is 'long' | 'short' | 'narrow'.`),
    badLocale(fn),
  )
}

const relativeTable = createTable<Intl.RelativeTimeFormat>((l, _v, o) => makeRelative('formatRelative', {}, l, o))
const relativeToTable = createTable<Intl.RelativeTimeFormat>((l, _v, o) => makeRelative('formatRelativeTo', { numeric: 'auto' }, l, o))

function formatRelativeValue(f: Intl.RelativeTimeFormat, fn: string, value: number, unit: RelativeUnit): string {
  try {
    return f.format(value, unit)
  } catch (error) {
    throw programmerError(
      fn,
      `${error instanceof Error ? error.message : String(error)}. unit is one of second, minute, hour, day, week, month, quarter, year.`,
    )
  }
}

export function relativeIn(
  locale: string,
  value: number,
  unit: RelativeUnit,
  options: RelativeOptions | RelativePreset | undefined,
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    if (value != null) warnInvalid('formatRelative', value, 'a finite number')
    return fallbackOf(options)
  }
  return formatRelativeValue(resolve(relativeTable, locale, '', options), 'formatRelative', value, unit)
}

const MIN = 60000
const HOUR = 3600000
const DAY = 86400000
const MONTH = 30.4375 * DAY
const YEAR = 365.25 * DAY

/**
 * Pick the unit for an elapsed time and truncate toward zero: under a minute
 * is seconds, under an hour minutes, under a day hours, under a week days,
 * under a month weeks, under a year months, then years. Truncation (not
 * rounding) so 59 min 40 s is "59 minutes", never "60 minutes".
 */
export function relativeToIn(
  locale: string,
  target: DateInput,
  base: DateInput,
  options: RelativeOptions | RelativePreset | undefined,
): string {
  const t = toMillis(target)
  const b = toMillis(base)
  if (t !== t || b !== b) {
    if (t !== t) missingOrInvalid('formatRelativeTo', target, options)
    else missingOrInvalid('formatRelativeTo', base, options)
    return fallbackOf(options)
  }
  const diff = t - b
  const abs = diff < 0 ? -diff : diff
  let unit: RelativeUnit
  let size: number
  if (abs < MIN) { unit = 'second'; size = 1000 }
  else if (abs < HOUR) { unit = 'minute'; size = MIN }
  else if (abs < DAY) { unit = 'hour'; size = HOUR }
  else if (abs < 7 * DAY) { unit = 'day'; size = DAY }
  else if (abs < MONTH) { unit = 'week'; size = 7 * DAY }
  else if (abs < YEAR) { unit = 'month'; size = MONTH }
  else { unit = 'year'; size = YEAR }
  const n = Math.trunc(diff / size)
  return formatRelativeValue(resolve(relativeToTable, locale, '', options), 'formatRelativeTo', n === 0 ? 0 : n, unit)
}

export const PLAIN_VARIANT = PLAIN

/** Test hooks. */
export function _dateTables() {
  return { date: dateTable, time: timeTable, dateTime: dateTimeTable, range: rangeTable, parts: partsTable, relative: relativeTable, relativeTo: relativeToTable }
}
export function _clearDateTables(): void {
  for (const t of Object.values(_dateTables())) clearTable(t as never)
}
