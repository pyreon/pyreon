/**
 * Public types for `@pyreon/format`. Option names are the platform's
 * (`Intl.*` option names); the only additions are `locale`, `timeZone`
 * (date-like formatters) and `fallback`, plus a few documented extras.
 */

/** A number-like input. `null` / `undefined` format as the `fallback`. */
export type NumberInput = number | bigint | null | undefined

/**
 * A date-like input.
 *
 * - `Date` and `number` (epoch milliseconds) are instants.
 * - An ISO string with a `Z` or an offset (`2026-11-18T14:30:00Z`) is an instant.
 * - An ISO date (`2026-11-18`) or date-time without offset (`2026-11-18T14:30`)
 *   is a CALENDAR value: it formats as that calendar day / wall-clock time in
 *   every time zone and never shifts.
 */
export type DateInput = Date | number | string | null | undefined

/** `YYYY-MM-DD`, the result of {@link parseDate}. Structurally the `PlainDate` of `@pyreon/time`. */
export type PlainDateString = `${number}-${number}-${number}`

/** Options every formatter accepts. */
export interface BaseOptions {
  /** BCP 47 tag. Defaults to the active locale (reactive entry) or the runtime default (core). */
  locale?: string | undefined
  /** Returned for nullish or invalid input. Default `''`. */
  fallback?: string | undefined
}

/** Options of the date and time formatters. */
export interface DateBaseOptions extends BaseOptions {
  /** IANA zone. Ignored for calendar strings (`2026-11-18`), which never shift. Defaults to the active zone. */
  timeZone?: string | undefined
}

// ─── Units ───────────────────────────────────────────────────────────────────

/**
 * The simple units ECMA-402 sanctions (`Intl.supportedValuesOf('unit')`).
 * A test keeps this union equal to the runtime list.
 */
export type SimpleUnit =
  | 'acre'
  | 'bit'
  | 'byte'
  | 'celsius'
  | 'centimeter'
  | 'day'
  | 'degree'
  | 'fahrenheit'
  | 'fluid-ounce'
  | 'foot'
  | 'gallon'
  | 'gigabit'
  | 'gigabyte'
  | 'gram'
  | 'hectare'
  | 'hour'
  | 'inch'
  | 'kilobit'
  | 'kilobyte'
  | 'kilogram'
  | 'kilometer'
  | 'liter'
  | 'megabit'
  | 'megabyte'
  | 'meter'
  | 'microsecond'
  | 'mile'
  | 'mile-scandinavian'
  | 'milliliter'
  | 'millimeter'
  | 'millisecond'
  | 'minute'
  | 'month'
  | 'nanosecond'
  | 'ounce'
  | 'percent'
  | 'petabyte'
  | 'pound'
  | 'second'
  | 'stone'
  | 'terabit'
  | 'terabyte'
  | 'week'
  | 'yard'
  | 'year'

/** A simple unit or a `<unit>-per-<unit>` compound (`kilometer-per-hour`). */
export type Unit = SimpleUnit | `${SimpleUnit}-per-${SimpleUnit}`

/** Units of {@link formatRelative}. */
export type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'

// ─── Number options ──────────────────────────────────────────────────────────

/** Options of {@link formatNumber}: any `Intl.NumberFormat` option. */
export interface NumberOptions extends Intl.NumberFormatOptions, BaseOptions {}

/** Style shorthands of {@link formatNumber}. */
export type NumberPreset = 'integer' | 'plain' | 'compact' | 'percent'

/** Options of {@link formatCurrency}. `style` and `currency` are set by the function. */
export interface CurrencyOptions
  extends Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
    BaseOptions {}

/** Style shorthands of {@link formatCurrency}: a `currencyDisplay`, or `accounting` (negatives in parentheses where the locale does so). */
export type CurrencyPreset = 'symbol' | 'narrowSymbol' | 'code' | 'name' | 'accounting'

/** Options of {@link formatPercent}. `style` is set by the function. */
export interface PercentOptions extends Omit<Intl.NumberFormatOptions, 'style'>, BaseOptions {}

/** Options of {@link formatCompact}. `notation` is set by the function. */
export interface CompactOptions extends Omit<Intl.NumberFormatOptions, 'notation'>, BaseOptions {}

/** Style shorthands of {@link formatCompact}. */
export type CompactPreset = 'short' | 'long'

/** Options of {@link formatUnit}. `style` and `unit` are set by the function. `unitDisplay` defaults to `'short'`. */
export interface UnitOptions extends Omit<Intl.NumberFormatOptions, 'style' | 'unit'>, BaseOptions {}

/** Style shorthands of {@link formatUnit}: a `unitDisplay`. */
export type UnitPreset = 'short' | 'narrow' | 'long'

/** Options of {@link formatBytes}. */
export interface BytesOptions
  extends Omit<Intl.NumberFormatOptions, 'style' | 'unit' | 'notation' | 'currency'>,
    BaseOptions {
  /** Use 1024 steps and IEC symbols (`KiB`, `MiB`, ...). Default `false`: 1000 steps and SI units (`kB`, `MB`, ...). */
  binary?: boolean | undefined
}

/** Options of {@link formatNumberRange}. */
export interface NumberRangeOptions extends NumberOptions {}

// ─── Duration ────────────────────────────────────────────────────────────────

/** A duration as plain data. Fields share one sign. */
export interface Duration {
  years?: number | undefined
  months?: number | undefined
  weeks?: number | undefined
  days?: number | undefined
  hours?: number | undefined
  minutes?: number | undefined
  seconds?: number | undefined
  milliseconds?: number | undefined
}

/** A duration, or a number of milliseconds. */
export type DurationInput = Duration | number | null | undefined

/** Style of {@link formatDuration}. */
export type DurationStyle = 'long' | 'short' | 'narrow' | 'digital'

/** Options of {@link formatDuration}. */
export interface DurationOptions extends BaseOptions {
  /** Default `'short'`. `'digital'` is `1:05:05`. */
  style?: DurationStyle | undefined
  /** Show at most this many units, the most significant non-zero ones (truncated, not rounded). Ignored for `'digital'`. */
  largest?: number | undefined
  /** Digits after the seconds in `'digital'` style, `0`-`9`. Default: as many as the input needs. */
  fractionalDigits?: number | undefined
}

// ─── List ────────────────────────────────────────────────────────────────────

/** Any iterable of strings (numbers and bigints are converted with `String`, nullish entries are skipped). */
export type ListInput = Iterable<string | number | bigint | null | undefined> | null | undefined

/** Options of {@link formatList}. */
export interface ListOptions extends Intl.ListFormatOptions, BaseOptions {}

/** Style shorthands of {@link formatList}: `and`, `or` and `unit` are the `Intl.ListFormat` types. */
export type ListPreset = 'and' | 'or' | 'unit'

// ─── Dates ───────────────────────────────────────────────────────────────────

/** Options of {@link formatDate}, {@link formatTime}, {@link formatDateTime}, {@link formatDateToParts}: any `Intl.DateTimeFormat` option. */
export interface DateTimeOptions extends Intl.DateTimeFormatOptions, DateBaseOptions {}

/** `dateStyle` / `timeStyle` shorthands. */
export type DateStylePreset = 'short' | 'medium' | 'long' | 'full'

/** Options of {@link formatRelative}. */
export interface RelativeOptions extends Intl.RelativeTimeFormatOptions, BaseOptions {}

/** Style shorthands of {@link formatRelative}: the `numeric` mode. */
export type RelativePreset = 'always' | 'auto'

/** Options of {@link formatDateRange}. Same as {@link DateTimeOptions}. */
export interface DateRangeOptions extends DateTimeOptions {}

/** Options of the parsers. */
export interface ParseOptions {
  /** BCP 47 tag. Defaults to the active locale (reactive entry) or the runtime default (core). */
  locale?: string | undefined
}

// ─── Bound formatter ─────────────────────────────────────────────────────────

/** Base of {@link createFormatter}. */
export interface FormatterBase {
  locale?: string | undefined
  timeZone?: string | undefined
}

/** The non-reactive formatter set returned by {@link createFormatter}. */
export interface Formatter {
  number(value: NumberInput, options?: NumberOptions | NumberPreset): string
  currency(value: NumberInput, currency: string, options?: CurrencyOptions | CurrencyPreset): string
  percent(value: NumberInput, options?: PercentOptions): string
  compact(value: NumberInput, options?: CompactOptions | CompactPreset): string
  unit(value: NumberInput, unit: Unit, options?: UnitOptions | UnitPreset): string
  bytes(bytes: NumberInput, options?: BytesOptions): string
  duration(value: DurationInput, options?: DurationOptions | DurationStyle): string
  list(items: ListInput, options?: ListOptions | ListPreset): string
  date(value: DateInput, options?: DateTimeOptions | DateStylePreset): string
  time(value: DateInput, options?: DateTimeOptions | DateStylePreset): string
  dateTime(value: DateInput, options?: DateTimeOptions | DateStylePreset): string
  relative(value: number, unit: RelativeUnit, options?: RelativeOptions | RelativePreset): string
  relativeTo(target: DateInput, base: DateInput, options?: RelativeOptions | RelativePreset): string
  dateRange(start: DateInput, end: DateInput, options?: DateRangeOptions | DateStylePreset): string
  numberRange(start: NumberInput, end: NumberInput, options?: NumberRangeOptions | NumberPreset): string
  numberToParts(value: NumberInput, options?: NumberOptions | NumberPreset): Intl.NumberFormatPart[]
  dateToParts(value: DateInput, options?: DateTimeOptions | DateStylePreset): Intl.DateTimeFormatPart[]
  parseNumber(text: string | null | undefined): number | null
  parseDate(text: string | null | undefined): PlainDateString | null
}

// ─── defineFormats ───────────────────────────────────────────────────────────

/** A named, reusable format: the `kind` picks the formatter, the rest are that formatter's options. */
export type FormatSpec =
  | ({ kind: 'number' } & NumberOptions)
  | ({ kind: 'currency'; currency: string } & CurrencyOptions)
  | ({ kind: 'percent' } & PercentOptions)
  | ({ kind: 'compact' } & CompactOptions)
  | ({ kind: 'unit'; unit: Unit } & UnitOptions)
  | ({ kind: 'bytes' } & BytesOptions)
  | ({ kind: 'duration' } & DurationOptions)
  | ({ kind: 'list' } & ListOptions)
  | ({ kind: 'date' } & DateTimeOptions)
  | ({ kind: 'time' } & DateTimeOptions)
  | ({ kind: 'dateTime' } & DateTimeOptions)
  | ({ kind: 'relative'; unit: RelativeUnit } & RelativeOptions)

/** The value a format of each `kind` takes. */
export interface FormatValueByKind {
  number: NumberInput
  currency: NumberInput
  percent: NumberInput
  compact: NumberInput
  unit: NumberInput
  bytes: NumberInput
  duration: DurationInput
  list: ListInput
  date: DateInput
  time: DateInput
  dateTime: DateInput
  relative: number
}

/** Per-call overrides of a format: any option of its `kind` (including `currency` / `unit`). */
export type FormatOverrides<K extends FormatSpec['kind']> = Partial<
  Omit<Extract<FormatSpec, { kind: K }>, 'kind'>
>

/** A named format: `(value, overrides?) => string`. */
export type NamedFormat<K extends FormatSpec['kind']> = (
  value: FormatValueByKind[K],
  overrides?: FormatOverrides<K>,
) => string

/** What {@link defineFormats} returns: one function per declared key. */
export type DefinedFormats<T extends Record<string, FormatSpec>> = {
  readonly [K in keyof T]: NamedFormat<T[K]['kind']>
}
