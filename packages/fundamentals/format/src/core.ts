/**
 * `@pyreon/format/core`: every formatter and parser as a pure function. The
 * locale and time zone come from the options (`locale`, `timeZone`); without
 * them the runtime default is used. No signals, no context, no `@pyreon/*`
 * import: safe in scripts, workers and any framework.
 */
import { durationIn, durationKind, durationSpec } from './duration'
import {
  dateIn,
  dateKind,
  dateRangeIn,
  dateSpec,
  dateTimeIn,
  dateTimeKind,
  dateToPartsIn,
  relativeIn,
  relativeKind,
  relativeSpec,
  relativeToIn,
  timeIn,
  timeKind,
} from './datetime'
import { createFormatterWith, defineFormatsWith } from './formats'
import { type Env, makeFormatter } from './formatter'
import { listIn, listKind, listSpec } from './list'
import {
  bytesIn,
  bytesKind,
  bytesSpec,
  compactIn,
  compactKind,
  compactSpec,
  currencyIn,
  currencyKind,
  currencySpec,
  numberIn,
  numberKind,
  numberRangeIn,
  numberSpec,
  numberToPartsIn,
  percentIn,
  percentKind,
  percentSpec,
  unitIn,
  unitKind,
  unitSpec,
} from './number'
import { parseCurrencyIn, parseDateIn, parseNumberIn } from './parse'
import { localeOf, zoneOf } from './pick'
import type {
  BoundFormatters,
  BytesOptions,
  CompactOptions,
  CompactPreset,
  CurrencyOptions,
  CurrencyPreset,
  DateInput,
  DateRangeOptions,
  DateStylePreset,
  DateTimeOptions,
  DefinedFormats,
  DurationInput,
  DurationOptions,
  DurationStyle,
  ExtendedSpec,
  Formatter,
  FormatterBase,
  FormatSpec,
  ListInput,
  ListOptions,
  ListPreset,
  NumberInput,
  NumberOptions,
  NumberPreset,
  NumberRangeOptions,
  ParseOptions,
  PercentOptions,
  PlainDateString,
  RelativeFormatterOptions,
  RelativeOptions,
  RelativePreset,
  RelativeUnit,
  Unit,
  UnitOptions,
  UnitPreset,
} from './types'

/** `/core` has no active locale or zone: the options (or the runtime default) decide. */
const CORE_ENV: Env = { locale: () => '', zone: () => '' }

export type * from './types'

/**
 * Format a number with `Intl.NumberFormat`, cached per locale and options. Nullish or `NaN` input returns the `fallback` (default `''`). Differs from raw `Intl` in one default: `signDisplay` is `'negative'`, so `-0` and values that round to zero print `0`.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatNumber(1234567.891, { locale: 'en-US' }) // "1,234,567.891"
 * formatNumber(1234.5678, { locale: 'en-US', maximumFractionDigits: 1 }) // "1,234.6"
 * formatNumber(-0, { locale: 'en-US' }) // "0"
 * ```
 */
export function formatNumber(value: NumberInput, options?: NumberOptions | NumberPreset): string {
  return numberIn(localeOf(options), value, options)
}

/**
 * Format money. `currency` is an ISO 4217 code; a malformed code returns the `fallback` with a dev warning. Presets: `symbol`, `narrowSymbol`, `code`, `name`, `accounting`.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatCurrency(9.99, 'EUR', { locale: 'en-US' }) // "€9.99"
 * formatCurrency(1234.5, 'EUR', { locale: 'de' }) // "1.234,50 €"
 * ```
 */
export function formatCurrency(value: NumberInput, currency: string, options?: CurrencyOptions | CurrencyPreset): string {
  return currencyIn(localeOf(options), value, currency, options)
}

/**
 * Format a ratio as a percentage: `0.42` is `42%`. The value is a ratio, never multiplied by you.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatPercent(0.42, { locale: 'en-US' }) // "42%"
 * formatPercent(0.4234, { locale: 'en-US', maximumFractionDigits: 1 }) // "42.3%"
 * ```
 */
export function formatPercent(value: NumberInput, options?: PercentOptions): string {
  return percentIn(localeOf(options), value, options)
}

/**
 * Compact notation: `1_240_000` is `1.2M`. Presets `short` (default) and `long`.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatCompact(1240000, { locale: 'en-US' }) // "1.2M"
 * formatCompact(1240000, { locale: 'en-US', compactDisplay: 'long' }) // "1.2 million"
 * ```
 */
export function formatCompact(value: NumberInput, options?: CompactOptions | CompactPreset): string {
  return compactIn(localeOf(options), value, options)
}

/**
 * Format a measurement with a sanctioned `Intl` unit (`kilometer`, `kilometer-per-hour`, ...). `unitDisplay` is `short` by default. An unknown unit throws a `[Pyreon]` error.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatUnit(72, 'kilometer-per-hour', { locale: 'en-US' }) // "72 km/h"
 * formatUnit(1.5, 'liter', { locale: 'en-US', unitDisplay: 'long' }) // "1.5 liters"
 * ```
 */
export function formatUnit(value: NumberInput, unit: Unit, options?: UnitOptions | UnitPreset): string {
  return unitIn(localeOf(options), value, unit, options)
}

/**
 * Format a byte count, choosing the unit: decimal by default (`1.5 kB`), `binary: true` for `KiB`. Below a kilobyte the symbol is used in the locale's own pattern (`999 B`); `unitDisplay: 'long'` gives `999 bytes`. Never prints `1000 kB`. Continues to EB/ZB/YB (`EiB`...) above petabytes.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatBytes(1536, { locale: 'en-US' }) // "1.5 kB"
 * formatBytes(999, { locale: 'en-US' }) // "999 B"
 * formatBytes(1536, { locale: 'en-US', binary: true }) // "1.5 KiB"
 * ```
 */
export function formatBytes(bytes: NumberInput, options?: BytesOptions): string {
  return bytesIn(localeOf(options), bytes, options)
}

/**
 * Format a duration (`{ hours, minutes, ... }` or milliseconds). From one second on, seconds are the smallest unit shown (rounded with carry); `smallest` and `largest` set the range; fractions balance down; `style: 'digital'` is `h:mm:ss`.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatDuration({ hours: 2, minutes: 5 }, { locale: 'en-US' }) // "2 hr, 5 min"
 * formatDuration(59_999, { locale: 'en-US' }) // "1 min"
 * formatDuration(65_432, { locale: 'en-US', style: 'digital' }) // "1:05"
 * ```
 */
export function formatDuration(value: DurationInput, options?: DurationOptions | DurationStyle): string {
  return durationIn(localeOf(options), value, options)
}

/**
 * Join items the way the locale does (`and`, `or`, `unit`). Any iterable; nullish entries are skipped; an empty list returns the `fallback`.
 *
 * @example
 * ```ts
 * formatList(['red', 'green', 'blue'], { locale: 'en-US' }) // "red, green, and blue"
 * formatList(['a', 'b'], { locale: 'en-US', type: 'disjunction' }) // "a or b"
 * ```
 */
export function formatList(items: ListInput, options?: ListOptions | ListPreset): string {
  return listIn(localeOf(options), items, options)
}

/**
 * Format the date part (default `dateStyle: 'medium'`). A date-only string is a calendar date and shows that day in every zone; instants show in `timeZone`. A time of day is rejected.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatDate('2026-11-18', { locale: 'en-US' }) // "Nov 18, 2026"
 * formatDate('2026-11-18T23:30:00Z', { locale: 'en-US', timeZone: 'Asia/Tokyo' }) // "Nov 19, 2026"
 * ```
 */
export function formatDate(value: DateInput, options?: DateTimeOptions | DateStylePreset): string {
  return dateIn(localeOf(options), zoneOf(options), value, options)
}

/**
 * Format the time part (default `timeStyle: 'short'`). Accepts a time of day (`14:30`, `14:30:05.250`) as a wall-clock value that never shifts.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatTime('14:30', { locale: 'en-US' }) // "2:30 PM"
 * formatTime('2026-11-18T14:30', { locale: 'de' }) // "14:30"
 * ```
 */
export function formatTime(value: DateInput, options?: DateTimeOptions | DateStylePreset): string {
  return timeIn(localeOf(options), zoneOf(options), value, options)
}

/**
 * Format date and time together (default `dateStyle: 'medium'`, `timeStyle: 'short'`).
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatDateTime('2026-11-18T14:30', { locale: 'de' }) // "18.11.2026, 14:30"
 * ```
 */
export function formatDateTime(value: DateInput, options?: DateTimeOptions | DateStylePreset): string {
  return dateTimeIn(localeOf(options), zoneOf(options), value, options)
}

/**
 * Format a relative amount in a given unit: `(-3, 'day')` is `3 days ago`. `numeric: 'auto'` gives words (`yesterday`). An unknown unit throws a `[Pyreon]` error.
 *
 * @example
 * ```ts
 * formatRelative(-3, 'day', { locale: 'en-US' }) // "3 days ago"
 * formatRelative(-1, 'day', { locale: 'en-US', numeric: 'auto' }) // "yesterday"
 * ```
 */
export function formatRelative(value: number, unit: RelativeUnit, options?: RelativeOptions | RelativePreset): string {
  return relativeIn(localeOf(options), value, unit, options)
}

/**
 * Describe `target` relative to an explicit `base`. Under 24 hours it is elapsed time (truncated toward zero); from 24 hours on the distance is counted by the calendar in `timeZone`, so "yesterday" and "last month" are literally true.
 *
 * @example
 * ```ts
 * formatRelativeTo('2026-11-17', '2026-11-18', { locale: 'en-US' }) // "yesterday"
 * formatRelativeTo('2026-10-05', '2026-11-18', { locale: 'en-US' }) // "last month"
 * ```
 */
export function formatRelativeTo(target: DateInput, base: DateInput, options?: RelativeOptions | RelativePreset): string {
  return relativeToIn(localeOf(options), zoneOf(options), target, base, options)
}

/**
 * Format a range with the shared parts collapsed. A reversed pair is ordered first.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatDateRange('2026-11-12', '2026-11-15', { locale: 'en-US' }) // "Nov 12 – 15, 2026"
 * ```
 */
export function formatDateRange(start: DateInput, end: DateInput, options?: DateRangeOptions | DateStylePreset): string {
  return dateRangeIn(localeOf(options), zoneOf(options), start, end, options)
}

/**
 * Format a numeric range with the shared parts collapsed. A reversed pair is ordered first.
 *
 * Output uses the platform's non-breaking and thin spaces (U+00A0, U+2009, U+202F), not plain ones: compare with `===` only against `Intl`'s own output from the same process.
 *
 * @example
 * ```ts
 * formatNumberRange(3, 5, { locale: 'en-US' }) // "3–5"
 * ```
 */
export function formatNumberRange(start: NumberInput, end: NumberInput, options?: NumberRangeOptions | NumberPreset): string {
  return numberRangeIn(localeOf(options), start, end, options)
}

/**
 * The parts of a formatted number, for custom markup. Nullish or invalid input returns `[]`.
 *
 * @example
 * ```ts
 * formatNumberToParts(1234.5, { locale: 'en-US' }).map((p) => p.type) // ["integer", "group", "integer", "decimal", "fraction"]
 * ```
 */
export function formatNumberToParts(value: NumberInput, options?: NumberOptions | NumberPreset): Intl.NumberFormatPart[] {
  return numberToPartsIn(localeOf(options), value, options)
}

/**
 * The parts of a formatted date and time. Nullish or invalid input returns `[]`.
 *
 * @example
 * ```ts
 * formatDateToParts('2026-11-18', { locale: 'en-US', month: 'long', day: 'numeric' }).map((p) => p.value).join('') // "November 18"
 * ```
 */
export function formatDateToParts(value: DateInput, options?: DateTimeOptions | DateStylePreset): Intl.DateTimeFormatPart[] {
  return dateToPartsIn(localeOf(options), zoneOf(options), value, options)
}

/**
 * Parse a number typed or printed in the locale: its digits, separators and typed variants. A lone `.` is also a decimal in locales that use a comma and do not group with a dot. `null` for anything else (not parsed: `1e3`, `1.2M`).
 *
 * @example
 * ```ts
 * parseNumber('1 234,5', { locale: 'cs' }) // 1234.5
 * parseNumber('1234.5', { locale: 'cs' }) // 1234.5
 * parseNumber('1.234', { locale: 'de' }) // 1234
 * ```
 */
export function parseNumber(text: string | null | undefined, options?: ParseOptions): number | null {
  return parseNumberIn(options?.locale ?? '', text)
}

/**
 * Parse a money amount: the currency symbol, code or name (as the locale writes it) and accounting parentheses are removed, then the number is read. `null` for anything else.
 *
 * @example
 * ```ts
 * parseCurrency('€9.99', 'EUR', { locale: 'en-US' }) // 9.99
 * parseCurrency('($5.00)', 'USD', { locale: 'en-US' }) // -5
 * ```
 */
export function parseCurrency(text: string | null | undefined, currency: string, options?: ParseOptions): number | null {
  return parseCurrencyIn(options?.locale ?? '', text, currency)
}

/**
 * Parse a numeric date in the locale's order, ISO, or the locale's own medium/long form with a month name, to `YYYY-MM-DD`. Impossible dates return `null`. Two-digit years: 00-68 is 20xx, 69-99 is 19xx. Not parsed: weekday names, times, natural language.
 *
 * @example
 * ```ts
 * parseDate('18. 11. 2026', { locale: 'cs' }) // "2026-11-18"
 * parseDate('Nov 18, 2026', { locale: 'en-US' }) // "2026-11-18"
 * parseDate('18. listopadu 2026', { locale: 'cs' }) // "2026-11-18"
 * ```
 */
export function parseDate(text: string | null | undefined, options?: ParseOptions): PlainDateString | null {
  return parseDateIn(options?.locale ?? '', text)
}

/**
 * A bound, NON-reactive set of one-off functions for servers, scripts and tests: it never reads the active locale or zone.
 *
 * @example
 * ```ts
 * const f = createFormatter({ locale: 'cs' })
 * f.number(1234567.5) // "1 234 567,5"
 * ```
 */
export function createFormatter(base: FormatterBase = {}): BoundFormatters {
  return createFormatterWith(base)
}

// ─── Formatters as values ────────────────────────────────────────────────────

/**
 * A reusable number formatter: a plain `(value) => string` with `with`, `from`, `fallback`, `parts`, `range` and `options`.
 *
 * @example
 * ```ts
 * const n = numberFormatter({ locale: 'en-US', maximumFractionDigits: 1 })
 * n(1234.5678) // "1,234.6"
 * [1000, 2500.55].map(n) // ["1,000", "2,500.6"]
 * ```
 */
export function numberFormatter(options?: NumberOptions | NumberPreset): Formatter<NumberInput, 'number'> {
  return makeFormatter(numberKind, numberSpec(options), CORE_ENV)
}

/**
 * A reusable currency formatter. `price.with(...)` derives, `price.from((cents) => cents / 100)` adapts cents, `price.range(10, 20)` formats a range.
 *
 * @example
 * ```ts
 * const price = currencyFormatter('EUR', { locale: 'en-US' })
 * price(9.99) // "€9.99"
 * price.from((cents: number) => cents / 100)(999) // "€9.99"
 * ```
 */
export function currencyFormatter(currency: string, options?: CurrencyOptions | CurrencyPreset): Formatter<NumberInput, 'currency'> {
  return makeFormatter(currencyKind, currencySpec(currency, options), CORE_ENV)
}

/**
 * A reusable percent formatter.
 *
 * @example
 * ```ts
 * percentFormatter({ locale: 'en-US' })(0.42) // "42%"
 * ```
 */
export function percentFormatter(options?: PercentOptions): Formatter<NumberInput, 'percent'> {
  return makeFormatter(percentKind, percentSpec(options), CORE_ENV)
}

/**
 * A reusable compact-number formatter.
 *
 * @example
 * ```ts
 * compactFormatter({ locale: 'en-US' })(1240000) // "1.2M"
 * ```
 */
export function compactFormatter(options?: CompactOptions | CompactPreset): Formatter<NumberInput, 'compact'> {
  return makeFormatter(compactKind, compactSpec(options), CORE_ENV)
}

/**
 * A reusable unit formatter.
 *
 * @example
 * ```ts
 * unitFormatter('kilometer-per-hour', { locale: 'en-US' })(72) // "72 km/h"
 * ```
 */
export function unitFormatter(unit: Unit, options?: UnitOptions | UnitPreset): Formatter<NumberInput, 'unit'> {
  return makeFormatter(unitKind, unitSpec(unit, options), CORE_ENV)
}

/**
 * A reusable byte-size formatter.
 *
 * @example
 * ```ts
 * bytesFormatter({ locale: 'en-US' })(1536) // "1.5 kB"
 * ```
 */
export function bytesFormatter(options?: BytesOptions): Formatter<NumberInput, 'bytes'> {
  return makeFormatter(bytesKind, bytesSpec(options), CORE_ENV)
}

/**
 * A reusable duration formatter (no `parts` or `range`).
 *
 * @example
 * ```ts
 * durationFormatter({ locale: 'en-US', style: 'narrow' })(3905000) // "1h 5m 5s"
 * ```
 */
export function durationFormatter(options?: DurationOptions | DurationStyle): Formatter<DurationInput, 'duration'> {
  return makeFormatter(durationKind, durationSpec(options), CORE_ENV)
}

/**
 * A reusable list formatter.
 *
 * @example
 * ```ts
 * listFormatter({ locale: 'en-US', type: 'disjunction' })(['a', 'b', 'c']) // "a, b, or c"
 * ```
 */
export function listFormatter(options?: ListOptions | ListPreset): Formatter<ListInput, 'list'> {
  return makeFormatter(listKind, listSpec(options), CORE_ENV)
}

/**
 * A reusable date formatter (the date part).
 *
 * @example
 * ```ts
 * dateFormatter({ locale: 'en-US', dateStyle: 'long' })('2026-11-18') // "November 18, 2026"
 * ```
 */
export function dateFormatter(options?: DateTimeOptions | DateStylePreset): Formatter<DateInput, 'date'> {
  return makeFormatter(dateKind, dateSpec('date', options), CORE_ENV)
}

/**
 * A reusable time formatter (the time part); accepts a time of day.
 *
 * @example
 * ```ts
 * timeFormatter({ locale: 'de', timeZone: 'UTC' })('2026-11-18T14:30:00Z') // "14:30"
 * ```
 */
export function timeFormatter(options?: DateTimeOptions | DateStylePreset): Formatter<DateInput, 'time'> {
  return makeFormatter(timeKind, dateSpec('time', options), CORE_ENV)
}

/**
 * A reusable date-and-time formatter.
 *
 * @example
 * ```ts
 * dateTimeFormatter({ locale: 'de' })('2026-11-18T14:30') // "18.11.2026, 14:30"
 * ```
 */
export function dateTimeFormatter(options?: DateTimeOptions | DateStylePreset): Formatter<DateInput, 'dateTime'> {
  return makeFormatter(dateTimeKind, dateSpec('dateTime', options), CORE_ENV)
}

/**
 * A reusable relative-time formatter: the target against `options.base` (a date-like value, or an accessor that is tracked).
 *
 * @example
 * ```ts
 * relativeFormatter({ locale: 'en-US', base: '2026-11-18' })('2026-11-17') // "yesterday"
 * ```
 */
export function relativeFormatter(options: RelativeFormatterOptions): Formatter<DateInput, 'relative'> {
  return makeFormatter(relativeKind, relativeSpec(options), CORE_ENV)
}

/**
 * Name a set of formats once; each key is a real `Formatter` (`f.price(9.99)`, `f.price.with(...)`). A spec may `extends` another by name.
 *
 * @example
 * ```ts
 * const f = defineFormats({ price: { kind: 'currency', currency: 'EUR', locale: 'en-US' }, short: { extends: 'price', notation: 'compact' } })
 * f.short(1234567) // "€1.2M"
 * ```
 */
export function defineFormats<const T extends Record<string, FormatSpec | ExtendedSpec<Extract<keyof T, string>>>>(specs: T): DefinedFormats<T> {
  return defineFormatsWith(
    {
      number: (spec) => makeFormatter(numberKind, spec, CORE_ENV),
      currency: (spec) => makeFormatter(currencyKind, spec, CORE_ENV),
      percent: (spec) => makeFormatter(percentKind, spec, CORE_ENV),
      compact: (spec) => makeFormatter(compactKind, spec, CORE_ENV),
      unit: (spec) => makeFormatter(unitKind, spec, CORE_ENV),
      bytes: (spec) => makeFormatter(bytesKind, spec, CORE_ENV),
      duration: (spec) => makeFormatter(durationKind, spec, CORE_ENV),
      list: (spec) => makeFormatter(listKind, spec, CORE_ENV),
      date: (spec) => makeFormatter(dateKind, spec, CORE_ENV),
      time: (spec) => makeFormatter(timeKind, spec, CORE_ENV),
      dateTime: (spec) => makeFormatter(dateTimeKind, spec, CORE_ENV),
      relative: (spec) => makeFormatter(relativeKind, spec, CORE_ENV),
    },
    specs,
  )
}
