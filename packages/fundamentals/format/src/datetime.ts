/**
 * Date and time formatters: `formatDate`, `formatTime`, `formatDateTime`,
 * `formatRelative`, `formatRelativeTo`, `formatDateRange`, `formatDateToParts`.
 *
 * The cache variant of a date formatter is its time zone. A calendar value
 * (`2026-11-18`, `2026-11-18T14:30`) uses the variant `PLAIN` and is formatted
 * as UTC, so it can never shift.
 */
import { clearTable, construct, createTable, guarded, resolve, type Table } from './cache'
import type { Core, KindDef } from './formatter'
import { badLocale, fallbackOf, preset, fallbackText } from './number'
import { daysFromCivil, lastWasPlain, lastWasTimeOnly, toMillis } from './input'
import { describe, programmerError, quote, warnInvalid, warnOnce } from './warn'
import { withZoneFallback } from './zone'
import type {
  DateBaseOptions,
  DateInput,
  DateRangeOptions,
  DateStylePreset,
  DateTimeOptions,
  RelativeFormatterOptions,
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
    throw programmerError(fn, `unknown preset ${quote(name)}. Valid presets: short, medium, long, full. Pass an options object for anything else.`)
  }
  const style = STYLE_PRESETS[name as DateStylePreset]
  return kind === 'date' ? { dateStyle: style } : kind === 'time' ? { timeStyle: style } : { dateStyle: style, timeStyle: style }
}

function badOptions(fn: string): (error: unknown) => Error {
  return (error) =>
    programmerError(
      fn,
      `${error instanceof Error ? error.message : String(error)}. Check the options against Intl.DateTimeFormat (a dateStyle or timeStyle cannot be combined with field options such as month or hour).`,
    )
}

function makeDt(fn: string, kind: Defaults, locale: string, zone: string, options: object | string | undefined): Intl.DateTimeFormat {
  let o: DtOpts
  if (typeof options === 'string') o = styleOf(options, kind, fn)
  else {
    const given = (options ?? {}) as DtOpts
    o = hasFields(given) ? { ...given } : { ...given, ...defaultsFor(kind, given) }
  }
  delete o.timeZone
  const build = (timeZone: string | undefined): Intl.DateTimeFormat =>
    construct((l, x) => new Intl.DateTimeFormat(l, x), locale, timeZone === undefined ? o : { ...o, timeZone }, badOptions(fn), badLocale(fn))
  if (zone === PLAIN) {
    // A calendar value has no zone: a zone name next to it would read as a lie,
    // so the long/full time styles (which print one) become `medium`.
    delete o.timeZoneName
    if (o.timeStyle === 'long' || o.timeStyle === 'full') o.timeStyle = 'medium'

    return build('UTC')
  }
  if (zone === '') return build(undefined)

  return withZoneFallback(zone, fn, (z) => build(z === '' ? undefined : z))
}

const dateTable = /* @__PURE__ */ createTable<Intl.DateTimeFormat>(/* @__PURE__ */ guarded((l, z, o) => makeDt('formatDate', 'date', l, z, o)))
const timeTable = /* @__PURE__ */ createTable<Intl.DateTimeFormat>(/* @__PURE__ */ guarded((l, z, o) => makeDt('formatTime', 'time', l, z, o)))
const dateTimeTable = /* @__PURE__ */ createTable<Intl.DateTimeFormat>(/* @__PURE__ */ guarded((l, z, o) => makeDt('formatDateTime', 'dateTime', l, z, o)))
const rangeTable = /* @__PURE__ */ createTable<Intl.DateTimeFormat>(/* @__PURE__ */ guarded((l, z, o) => makeDt('formatDateRange', 'date', l, z, o)))
const partsTable = /* @__PURE__ */ createTable<Intl.DateTimeFormat>(/* @__PURE__ */ guarded((l, z, o) => makeDt('formatDateToParts', 'dateTime', l, z, o)))

function missingOrInvalid(fn: string, value: DateInput, fallback: string): string {
  if (value != null) {
    if (process.env.NODE_ENV !== 'production') warnInvalid(fn, value, 'a Date, epoch milliseconds, or an ISO 8601 string such as "2026-11-18" or "2026-11-18T14:30:00Z"')
  }

  return fallback
}

/**
 * Epoch milliseconds of a date-like value for a date formatter, `NaN` when it is missing or invalid (with a dev
 * warning for non-nullish input). A time of day (`14:30`) is valid only where `allowTimeOnly` (the time formatters):
 * a date formatter has nothing to show for it. Leaves the calendar / time-only flags readable.
 */
function dateMs(fn: string, value: DateInput, allowTimeOnly: boolean): number {
  const ms = toMillis(value)
  if (ms !== ms) {
    missingOrInvalid(fn, value, '')

    return NaN
  }
  if (lastWasTimeOnly() && !allowTimeOnly) {
    if (process.env.NODE_ENV !== 'production') {
      warnOnce(
        `${fn}:timeOnly`,
        `[Pyreon] ${fn}(): ${quote(value)} is a time of day with no date, so there is no date to show. Use formatTime() for it, or pass a date such as "2026-11-18T14:30".`,
      )
    }

    return NaN
  }

  return ms
}

type DateArg = DateTimeOptions | DateStylePreset | undefined

function zoneOf(zone: string): string {
  return lastWasPlain() ? PLAIN : zone
}

export function dateIn(locale: string, zone: string, value: DateInput, options: DateArg): string {
  const ms = dateMs('formatDate', value, false)
  if (ms !== ms) return fallbackOf(options)

  return resolve(dateTable, locale, zoneOf(zone), options).format(ms)
}

export function timeIn(locale: string, zone: string, value: DateInput, options: DateArg): string {
  const ms = dateMs('formatTime', value, true)
  if (ms !== ms) return fallbackOf(options)

  return resolve(timeTable, locale, zoneOf(zone), options).format(ms)
}

export function dateTimeIn(locale: string, zone: string, value: DateInput, options: DateArg): string {
  const ms = dateMs('formatDateTime', value, false)
  if (ms !== ms) return fallbackOf(options)

  return resolve(dateTimeTable, locale, zoneOf(zone), options).format(ms)
}

export function dateToPartsIn(locale: string, zone: string, value: DateInput, options: DateArg): Intl.DateTimeFormatPart[] {
  const ms = dateMs('formatDateToParts', value, false)
  if (ms !== ms) return []

  return resolve(partsTable, locale, zoneOf(zone), options).formatToParts(ms)
}

/** The two instants of a range in order (a range picker mid-selection produces reversed pairs), or `NaN`s. */
function orderedRange(fn: string, start: DateInput, end: DateInput, allowTimeOnly: boolean): boolean {
  const a = dateMs(fn, start, allowTimeOnly)
  const plainA = lastWasPlain()
  const b = dateMs(fn, end, allowTimeOnly)
  const plainB = lastWasPlain()
  rangeA = a
  rangeB = b
  rangePlain = plainA && plainB
  if (a !== a || b !== b) return false
  if (a > b) {
    rangeA = b
    rangeB = a
  }

  return true
}

/** Scratch of {@link orderedRange}: the ordered pair and whether both were calendar values (synchronous, no allocation). */
let rangeA = 0
let rangeB = 0
let rangePlain = false

export function dateRangeIn(
  locale: string,
  zone: string,
  start: DateInput,
  end: DateInput,
  options: DateRangeOptions | DateStylePreset | undefined,
): string {
  if (!orderedRange('formatDateRange', start, end, false)) return fallbackOf(options)
  // Both calendar values: format as calendar days. Otherwise everything is an instant in `zone`.
  return resolve(rangeTable, locale, rangePlain ? PLAIN : zone, options).formatRange(rangeA, rangeB)
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

const relativeTable = /* @__PURE__ */ createTable<Intl.RelativeTimeFormat>(/* @__PURE__ */ guarded((l, _v, o) => makeRelative('formatRelative', {}, l, o)))
const relativeToTable = /* @__PURE__ */ createTable<Intl.RelativeTimeFormat>(/* @__PURE__ */ guarded((l, _v, o) => makeRelative('formatRelativeTo', { numeric: 'auto' }, l, o)))

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
    if (value != null) {
      if (process.env.NODE_ENV !== 'production') warnInvalid('formatRelative', value, 'a finite number')
    }

    return fallbackOf(options)
  }

  return formatRelativeValue(resolve(relativeTable, locale, '', options), 'formatRelative', value, unit)
}

const MIN = 60000
const HOUR = 3600000
const DAY = 86400000

/** `Intl` view of a zone's local date: Gregorian, Latin digits, era kept for years before 1. */
const civilTable = /* @__PURE__ */ createTable<Intl.DateTimeFormat>((_locale, zone) =>
  withZoneFallback(
    zone,
    'formatRelativeTo',
    (z) =>
      new Intl.DateTimeFormat('en-US', {
        ...(z === '' ? {} : { timeZone: z }),
        calendar: 'gregory',
        numberingSystem: 'latn',
        era: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }),
  ),
)

/** Day number (days since 1970-01-01) and `year * 12 + month` of the local date of an instant, in `zone`; calendar values read as UTC. */
function civilOf(ms: number, plain: boolean, zone: string): void {
  let year: number
  let month: number
  let day: number
  if (plain) {
    const d = new Date(ms)
    year = d.getUTCFullYear()
    month = d.getUTCMonth() + 1
    day = d.getUTCDate()
  } else {
    year = 0
    month = 0
    day = 0
    let bce = false
    for (const part of resolve(civilTable, '', zone, undefined).formatToParts(ms)) {
      if (part.type === 'year') year = Number(part.value)
      else if (part.type === 'month') month = Number(part.value)
      else if (part.type === 'day') day = Number(part.value)
      else if (part.type === 'era') bce = part.value === 'BC'
    }
    if (bce) year = 1 - year
  }
  civilDays = daysFromCivil(year, month, day)
  civilMonths = year * 12 + month
  civilYear = year
}

/** Scratch of {@link civilOf} (synchronous, no allocation). */
let civilDays = 0
let civilMonths = 0
let civilYear = 0

/**
 * `target` relative to `base` through `rtf`. Under a minute is seconds, under an hour minutes, under 24 hours
 * hours (elapsed time, truncated toward zero: 59 min 40 s is "59 minutes"). From 24 hours on the difference is
 * counted in CALENDAR terms in `zone` (calendar values in UTC), so "yesterday", "tomorrow" and "last month"
 * are literally true: under 7 calendar days it is days; otherwise weeks (7-day blocks) while the calendar month
 * differs by less than one or the distance is under 30 days; then calendar months (up to 11), then calendar
 * years. `fallback` for a missing or invalid date.
 */
function relativeToValue(rtf: Intl.RelativeTimeFormat, target: DateInput, base: DateInput, fallback: string, zone: string): string {
  const t = dateMs('formatRelativeTo', target, false)
  const plainT = lastWasPlain()
  const b = t === t ? dateMs('formatRelativeTo', base, false) : NaN
  const plainB = lastWasPlain()
  if (t !== t || b !== b) return fallback
  const diff = t - b
  const abs = diff < 0 ? -diff : diff
  let unit: RelativeUnit
  let n: number
  if (abs < MIN) {
    unit = 'second'
    n = Math.trunc(diff / 1000)
  } else if (abs < HOUR) {
    unit = 'minute'
    n = Math.trunc(diff / MIN)
  } else if (abs < DAY) {
    unit = 'hour'
    n = Math.trunc(diff / HOUR)
  } else {
    civilOf(t, plainT, zone)
    const tDays = civilDays
    const tMonths = civilMonths
    const tYear = civilYear
    civilOf(b, plainB, zone)
    const days = tDays - civilDays
    const months = tMonths - civilMonths
    const absDays = days < 0 ? -days : days
    const absMonths = months < 0 ? -months : months
    if (absDays < 7) {
      unit = 'day'
      n = days
    } else if (absMonths < 1 || absDays < 30) {
      unit = 'week'
      n = Math.trunc(days / 7)
    } else if (absMonths < 12) {
      unit = 'month'
      n = months
    } else {
      unit = 'year'
      n = tYear - civilYear
    }
  }

  return formatRelativeValue(rtf, 'formatRelativeTo', n === 0 ? 0 : n, unit)
}

export function relativeToIn(
  locale: string,
  zone: string,
  target: DateInput,
  base: DateInput,
  options: RelativeOptions | RelativePreset | undefined,
): string {
  return relativeToValue(resolve(relativeToTable, locale, '', options), target, base, fallbackOf(options), zone)
}

// ─── Formatters as values ────────────────────────────────────────────────────

type DateKind = 'date' | 'time' | 'dateTime'

/** Spec of `dateFormatter` / `timeFormatter` / `dateTimeFormatter`: an options object, or a style name. */
export function dateSpec(kind: DateKind, options: DateTimeOptions | DateStylePreset | undefined): DateTimeOptions {
  if (typeof options === 'string') return styleOf(options, kind, `${kind}Formatter`)

  return options ?? {}
}

const zoneFn = (spec: Readonly<DateBaseOptions>, active: () => string): (() => string) =>
  typeof spec.timeZone === 'string' && spec.timeZone !== '' ? () => spec.timeZone as string : active

function dateCore(
  table: Table<Intl.DateTimeFormat>,
  fn: string,
  spec: Readonly<DateTimeOptions>,
  env: { locale: () => string; zone: () => string },
  allowTimeOnly = false,
): Core<DateInput> {
  const { locale, zone: activeZone } = env
  const fb = fallbackText(spec.fallback)
  const zone = zoneFn(spec, activeZone)
  // Calendar values and instants use different formatters (UTC vs the zone): memoize each.
  let plainAt = ''
  let plainIntl: Intl.DateTimeFormat | undefined
  let zonedAt = ''
  let zonedZone = ''
  let zonedIntl: Intl.DateTimeFormat | undefined
  const intlFor = (l: string, z: string, plain: boolean): Intl.DateTimeFormat => {
    if (plain) {
      if (plainIntl === undefined || l !== plainAt) {
        plainIntl = resolve(table, l, PLAIN, spec)
        plainAt = l
      }

      return plainIntl
    }
    if (zonedIntl === undefined || l !== zonedAt || z !== zonedZone) {
      zonedIntl = resolve(table, l, z, spec)
      zonedAt = l
      zonedZone = z
    }

    return zonedIntl
  }

  return {
    call: (value) => {
      const l = locale()
      const z = zone()
      const ms = dateMs(fn, value, allowTimeOnly)
      if (ms !== ms) return fb

      return intlFor(l, z, lastWasPlain()).format(ms)
    },
    parts: (value) => {
      const l = locale()
      const z = zone()
      const ms = dateMs(fn, value, allowTimeOnly)
      if (ms !== ms) return []

      return intlFor(l, z, lastWasPlain()).formatToParts(ms)
    },
    range: (start, end) => {
      const l = locale()
      const z = zone()
      if (!orderedRange(fn, start, end, allowTimeOnly)) return fb

      return intlFor(l, z, rangePlain).formatRange(rangeA, rangeB)
    },
  }
}

export const dateKind: KindDef<'date'> = { create: (spec, locale, zone) => dateCore(dateTable, 'dateFormatter', spec, { locale, zone }) }
export const timeKind: KindDef<'time'> = { create: (spec, locale, zone) => dateCore(timeTable, 'timeFormatter', spec, { locale, zone }, true) }

export const dateTimeKind: KindDef<'dateTime'> = {
  create: (spec, locale, zone) => dateCore(dateTimeTable, 'dateTimeFormatter', spec, { locale, zone }),
}

/** Spec of `relativeFormatter`: an options object with a `base`. */
export function relativeSpec(options: RelativeFormatterOptions): RelativeFormatterOptions {
  if (typeof options !== 'object' || options === null) {
    throw programmerError('relativeFormatter', `expected options with a base, such as { base: Date.now() } or { base: () => now() }, got ${describe(options)}.`)
  }

  return options
}

export const relativeKind: KindDef<'relative'> = {
  create(spec, locale, activeZone) {
    const fb = fallbackText(spec.fallback)
    const zone = zoneFn(spec, activeZone)
    if (process.env.NODE_ENV !== 'production' && spec.base === undefined) {
      warnOnce('relativeFormatter:base', '[Pyreon] relativeFormatter(): no `base` was given, so every call returns the fallback. Pass { base: Date.now() } or an accessor such as { base: () => now() }.')
    }
    // `base` is data, not an Intl option: keep it out of the cache key.
    const rtfSpec = { numeric: spec.numeric, style: spec.style }
    let at = ''
    let rtf: Intl.RelativeTimeFormat | undefined

    return {
      call: (target) => {
        const l = locale()
        const z = zone()
        const base = typeof spec.base === 'function' ? spec.base() : spec.base
        if (rtf === undefined || l !== at) {
          rtf = resolve(relativeToTable, l, '', rtfSpec)
          at = l
        }

        return relativeToValue(rtf, target, base, fb, z)
      },
    }
  },
}

export const PLAIN_VARIANT = PLAIN

/** Test hooks. */
export function _dateTables() {
  return { date: dateTable, time: timeTable, dateTime: dateTimeTable, range: rangeTable, parts: partsTable, relative: relativeTable, relativeTo: relativeToTable }
}

export function _clearDateTables(): void {
  for (const t of Object.values(_dateTables())) clearTable(t as never)
}
