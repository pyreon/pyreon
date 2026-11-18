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
import { parseDateIn, parseNumberIn } from './parse'
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

export function formatNumber(value: NumberInput, options?: NumberOptions | NumberPreset): string {
  return numberIn(localeOf(options), value, options)
}

export function formatCurrency(value: NumberInput, currency: string, options?: CurrencyOptions | CurrencyPreset): string {
  return currencyIn(localeOf(options), value, currency, options)
}

export function formatPercent(value: NumberInput, options?: PercentOptions): string {
  return percentIn(localeOf(options), value, options)
}

export function formatCompact(value: NumberInput, options?: CompactOptions | CompactPreset): string {
  return compactIn(localeOf(options), value, options)
}

export function formatUnit(value: NumberInput, unit: Unit, options?: UnitOptions | UnitPreset): string {
  return unitIn(localeOf(options), value, unit, options)
}

export function formatBytes(bytes: NumberInput, options?: BytesOptions): string {
  return bytesIn(localeOf(options), bytes, options)
}

export function formatDuration(value: DurationInput, options?: DurationOptions | DurationStyle): string {
  return durationIn(localeOf(options), value, options)
}

export function formatList(items: ListInput, options?: ListOptions | ListPreset): string {
  return listIn(localeOf(options), items, options)
}

export function formatDate(value: DateInput, options?: DateTimeOptions | DateStylePreset): string {
  return dateIn(localeOf(options), zoneOf(options), value, options)
}

export function formatTime(value: DateInput, options?: DateTimeOptions | DateStylePreset): string {
  return timeIn(localeOf(options), zoneOf(options), value, options)
}

export function formatDateTime(value: DateInput, options?: DateTimeOptions | DateStylePreset): string {
  return dateTimeIn(localeOf(options), zoneOf(options), value, options)
}

export function formatRelative(value: number, unit: RelativeUnit, options?: RelativeOptions | RelativePreset): string {
  return relativeIn(localeOf(options), value, unit, options)
}

export function formatRelativeTo(target: DateInput, base: DateInput, options?: RelativeOptions | RelativePreset): string {
  return relativeToIn(localeOf(options), target, base, options)
}

export function formatDateRange(start: DateInput, end: DateInput, options?: DateRangeOptions | DateStylePreset): string {
  return dateRangeIn(localeOf(options), zoneOf(options), start, end, options)
}

export function formatNumberRange(start: NumberInput, end: NumberInput, options?: NumberRangeOptions | NumberPreset): string {
  return numberRangeIn(localeOf(options), start, end, options)
}

export function formatNumberToParts(value: NumberInput, options?: NumberOptions | NumberPreset): Intl.NumberFormatPart[] {
  return numberToPartsIn(localeOf(options), value, options)
}

export function formatDateToParts(value: DateInput, options?: DateTimeOptions | DateStylePreset): Intl.DateTimeFormatPart[] {
  return dateToPartsIn(localeOf(options), zoneOf(options), value, options)
}

export function parseNumber(text: string | null | undefined, options?: ParseOptions): number | null {
  return parseNumberIn(options?.locale ?? '', text)
}

export function parseDate(text: string | null | undefined, options?: ParseOptions): PlainDateString | null {
  return parseDateIn(options?.locale ?? '', text)
}

/** A bound, NON-reactive set of one-off functions for servers, scripts and tests: it never reads the active locale or zone. */
export function createFormatter(base: FormatterBase = {}): BoundFormatters {
  return createFormatterWith(base)
}

// ─── Formatters as values ────────────────────────────────────────────────────

/** A reusable number formatter: `const n = numberFormatter({ maximumFractionDigits: 1 })`, then `n(1234.56)`. */
export function numberFormatter(options?: NumberOptions | NumberPreset): Formatter<NumberInput, 'number'> {
  return makeFormatter(numberKind, numberSpec(options), CORE_ENV)
}

/** A reusable currency formatter: `const price = currencyFormatter('EUR')`, then `price(9.99)`. */
export function currencyFormatter(currency: string, options?: CurrencyOptions | CurrencyPreset): Formatter<NumberInput, 'currency'> {
  return makeFormatter(currencyKind, currencySpec(currency, options), CORE_ENV)
}

/** A reusable percent formatter: `percentFormatter()(0.42)` is `42%`. */
export function percentFormatter(options?: PercentOptions): Formatter<NumberInput, 'percent'> {
  return makeFormatter(percentKind, percentSpec(options), CORE_ENV)
}

/** A reusable compact-number formatter: `compactFormatter()(1_240_000)` is `1.2M`. */
export function compactFormatter(options?: CompactOptions | CompactPreset): Formatter<NumberInput, 'compact'> {
  return makeFormatter(compactKind, compactSpec(options), CORE_ENV)
}

/** A reusable unit formatter: `unitFormatter('kilometer-per-hour')(72)` is `72 km/h`. */
export function unitFormatter(unit: Unit, options?: UnitOptions | UnitPreset): Formatter<NumberInput, 'unit'> {
  return makeFormatter(unitKind, unitSpec(unit, options), CORE_ENV)
}

/** A reusable byte-size formatter: `bytesFormatter()(1536)` is `1.5 kB`. */
export function bytesFormatter(options?: BytesOptions): Formatter<NumberInput, 'bytes'> {
  return makeFormatter(bytesKind, bytesSpec(options), CORE_ENV)
}

/** A reusable duration formatter: `durationFormatter({ style: 'digital' })(3_905_000)` is `1:05:05`. */
export function durationFormatter(options?: DurationOptions | DurationStyle): Formatter<DurationInput, 'duration'> {
  return makeFormatter(durationKind, durationSpec(options), CORE_ENV)
}

/** A reusable list formatter: `listFormatter('or')(['a', 'b'])` is `a or b`. */
export function listFormatter(options?: ListOptions | ListPreset): Formatter<ListInput, 'list'> {
  return makeFormatter(listKind, listSpec(options), CORE_ENV)
}

/** A reusable date formatter (the date part): `dateFormatter('long')('2026-11-18')`. */
export function dateFormatter(options?: DateTimeOptions | DateStylePreset): Formatter<DateInput, 'date'> {
  return makeFormatter(dateKind, dateSpec('date', options), CORE_ENV)
}

/** A reusable time formatter (the time part). */
export function timeFormatter(options?: DateTimeOptions | DateStylePreset): Formatter<DateInput, 'time'> {
  return makeFormatter(timeKind, dateSpec('time', options), CORE_ENV)
}

/** A reusable date-and-time formatter. */
export function dateTimeFormatter(options?: DateTimeOptions | DateStylePreset): Formatter<DateInput, 'dateTime'> {
  return makeFormatter(dateTimeKind, dateSpec('dateTime', options), CORE_ENV)
}

/** A reusable relative-time formatter: elapsed time of the target against `options.base` (a date-like value, or an accessor that is tracked). */
export function relativeFormatter(options: RelativeFormatterOptions): Formatter<DateInput, 'relative'> {
  return makeFormatter(relativeKind, options, CORE_ENV)
}

/** Name a set of formats once: `const f = defineFormats({ price: { kind: 'currency', currency: 'EUR' } })`; each key is a real `Formatter` (`f.price(9.99)`, `f.price.with(...)`). A spec may `extends` another by name. */
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
