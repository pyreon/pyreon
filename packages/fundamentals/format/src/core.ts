/**
 * `@pyreon/format/core`: every formatter and parser as a pure function. The
 * locale and time zone come from the options (`locale`, `timeZone`); without
 * them the runtime default is used. No signals, no context, no `@pyreon/*`
 * import: safe in scripts, workers and any framework.
 */
import { durationIn } from './duration'
import { dateIn, dateRangeIn, dateTimeIn, dateToPartsIn, relativeIn, relativeToIn, timeIn } from './datetime'
import { createFormatterWith, defineFormatsWith } from './formats'
import { listIn } from './list'
import {
  bytesIn,
  compactIn,
  currencyIn,
  numberIn,
  numberRangeIn,
  numberToPartsIn,
  percentIn,
  unitIn,
} from './number'
import { parseDateIn, parseNumberIn } from './parse'
import { localeOf, zoneOf } from './pick'
import type {
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
  RelativeOptions,
  RelativePreset,
  RelativeUnit,
  Unit,
  UnitOptions,
  UnitPreset,
} from './types'

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

/** A bound, non-reactive formatter set for servers, scripts and tests. */
export function createFormatter(base: FormatterBase = {}): Formatter {
  return createFormatterWith(base)
}

/** Name a set of formats once: `const f = defineFormats({ price: { kind: 'currency', currency: 'EUR' } })`, then `f.price(9.99)`. */
export function defineFormats<const T extends Record<string, FormatSpec>>(specs: T): DefinedFormats<T> {
  return defineFormatsWith(
    {
      number: formatNumber,
      currency: formatCurrency,
      percent: formatPercent,
      compact: formatCompact,
      unit: formatUnit,
      bytes: formatBytes,
      duration: formatDuration,
      list: formatList,
      date: formatDate,
      time: formatTime,
      dateTime: formatDateTime,
      relative: formatRelative,
    },
    specs,
  )
}
