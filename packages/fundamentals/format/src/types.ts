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

/** A time of day: `14:30`, `14:30:05` or `14:30:05.250`. A wall-clock value like a date-time without offset: it never shifts with the time zone. Accepted by the time formatters only. Structurally the `PlainTime` of `@pyreon/time`. */
export type PlainTimeString = `${number}:${number}` | `${number}:${number}:${number}` | `${number}:${number}:${number}.${number}`

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
  /** IANA zone. Ignored for calendar strings (`2026-11-18`), which never shift. Defaults to the active zone. An invalid name warns once in dev and falls back to the active zone. */
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
export interface NumberOptions extends Intl.NumberFormatOptions, BaseOptions {
  /**
   * Default `'negative'`, unlike raw `Intl` (`'auto'`): `-0` and values that round to zero print `0`, never `-0` or `-$0.00`.
   * Pass `'auto'` for the platform behaviour.
   */
  signDisplay?: Intl.NumberFormatOptions['signDisplay'] | undefined
}

/** Style shorthands of {@link formatNumber}. */
export type NumberPreset = 'integer' | 'plain' | 'compact' | 'percent'

/** Options of {@link formatCurrency}. `style` and `currency` are set by the function. */
export interface CurrencyOptions
  extends Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
    BaseOptions {
  /**
   * Default `'negative'`, unlike raw `Intl` (`'auto'`): `-0` and values that round to zero print `0`, never `-0` or `-$0.00`.
   * Pass `'auto'` for the platform behaviour.
   */
  signDisplay?: Intl.NumberFormatOptions['signDisplay'] | undefined
}

/** Style shorthands of {@link formatCurrency}: a `currencyDisplay`, or `accounting` (negatives in parentheses where the locale does so). */
export type CurrencyPreset = 'symbol' | 'narrowSymbol' | 'code' | 'name' | 'accounting'

/** Options of {@link formatPercent}. `style` is set by the function. */
export interface PercentOptions extends Omit<Intl.NumberFormatOptions, 'style'>, BaseOptions {
  /**
   * Default `'negative'`, unlike raw `Intl` (`'auto'`): `-0` and values that round to zero print `0`, never `-0` or `-$0.00`.
   * Pass `'auto'` for the platform behaviour.
   */
  signDisplay?: Intl.NumberFormatOptions['signDisplay'] | undefined
}

/** Options of {@link formatCompact}. `notation` is set by the function. */
export interface CompactOptions extends Omit<Intl.NumberFormatOptions, 'notation'>, BaseOptions {
  /**
   * Default `'negative'`, unlike raw `Intl` (`'auto'`): `-0` and values that round to zero print `0`, never `-0` or `-$0.00`.
   * Pass `'auto'` for the platform behaviour.
   */
  signDisplay?: Intl.NumberFormatOptions['signDisplay'] | undefined
}

/** Style shorthands of {@link formatCompact}. */
export type CompactPreset = 'short' | 'long'

/** Options of {@link formatUnit}. `style` and `unit` are set by the function. `unitDisplay` defaults to `'short'`. */
export interface UnitOptions extends Omit<Intl.NumberFormatOptions, 'style' | 'unit'>, BaseOptions {
  /**
   * Default `'negative'`, unlike raw `Intl` (`'auto'`): `-0` and values that round to zero print `0`, never `-0` or `-$0.00`.
   * Pass `'auto'` for the platform behaviour.
   */
  signDisplay?: Intl.NumberFormatOptions['signDisplay'] | undefined
}

/** Style shorthands of {@link formatUnit}: a `unitDisplay`. */
export type UnitPreset = 'short' | 'narrow' | 'long'

/** A system of measurement: `us` (US customary), `uk` (metric with road miles) or `metric`. */
export type MeasurementSystem = 'metric' | 'us' | 'uk'

/**
 * Options of `formatUnit` and `unitFormatter` from `@pyreon/format/units`: everything in {@link UnitOptions}, plus a conversion
 * before formatting. `convertTo` names the unit; `system` picks the locale's own (`'auto'`, which follows the active locale in the
 * reactive entry) or a fixed system. `convertTo` wins when both are given.
 */
export interface ConvertedUnitOptions extends UnitOptions {
  convertTo?: Unit | undefined
  system?: 'auto' | MeasurementSystem | undefined
}

/** Options of {@link formatBytes}. */
export interface BytesOptions
  extends Omit<Intl.NumberFormatOptions, 'style' | 'unit' | 'notation' | 'currency'>,
    BaseOptions {
  /**
   * Default `'negative'`, unlike raw `Intl` (`'auto'`): `-0` prints `0`.
   */
  signDisplay?: Intl.NumberFormatOptions['signDisplay'] | undefined
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

/** A unit of {@link DurationOptions.smallest}. */
export type DurationUnit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond'

/** Style of {@link formatDuration}. */
export type DurationStyle = 'long' | 'short' | 'narrow' | 'digital'

/** Options of {@link formatDuration}. */
export interface DurationOptions extends BaseOptions {
  /** Default `'short'`. `'digital'` is `1:05:05`. */
  style?: DurationStyle | undefined
  /** Show at most this many units, the most significant non-zero ones (truncated, not rounded). Ignored for `'digital'`. */
  largest?: number | undefined
  /** The finest unit shown; finer parts are rounded away with carries (59 min 59.6 s with `'minute'` is `1 hr`). Default: seconds, and milliseconds only when the whole duration is under one second. */
  smallest?: DurationUnit | undefined
  /** Digits after the seconds in `'digital'` style, `0`-`9` (3 shows milliseconds). Default: none. */
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
export interface RelativeOptions extends Intl.RelativeTimeFormatOptions, DateBaseOptions {}

/** A span of time, summed: `{ days: 1, hours: 12 }` is 36 hours. */
export interface RelativeSpan {
  seconds?: number | undefined
  minutes?: number | undefined
  hours?: number | undefined
  days?: number | undefined
  weeks?: number | undefined
}

/**
 * When a self-updating relative label gives way to an absolute date: once the target is `after` away from now (in either
 * direction, by elapsed time), the label is the date, formatted `as` (a date style or `Intl.DateTimeFormat` options; default
 * `'medium'`). `{ after: { days: 7 }, as: 'medium' }` reads "3 hours ago", "yesterday", "last week", then "Nov 12, 2026".
 */
export interface RelativeThreshold {
  after: number | RelativeSpan
  as?: DateStylePreset | DateTimeOptions | undefined
}

/** Options of {@link useRelativeTime} and `<RelativeTime>`: the relative words, and an optional switch to an absolute date. */
export interface RelativeTimeOptions extends RelativeOptions {
  threshold?: RelativeThreshold | undefined
}

/** Style shorthands of {@link formatRelative}: the `numeric` mode. */
export type RelativePreset = 'always' | 'auto'

/** Options of {@link formatDateRange}. Same as {@link DateTimeOptions}. */
export interface DateRangeOptions extends DateTimeOptions {}

/** Options of the parsers. */
export interface ParseOptions {
  /** BCP 47 tag. Defaults to the active locale (reactive entry) or the runtime default (core). */
  locale?: string | undefined
}

// ─── createFormatter ─────────────────────────────────────────────────────────

/** Base of {@link createFormatter}. */
export interface FormatterBase {
  locale?: string | undefined
  timeZone?: string | undefined
}

/** The non-reactive set of one-off functions returned by {@link createFormatter}. */
export interface BoundFormatters {
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

// ─── Formatters as values ────────────────────────────────────────────────────

/** `Intl.ListFormat` parts. */
export interface ListPart {
  type: 'element' | 'literal'
  value: string
}

/** Options of {@link relativeFormatter}: the elapsed time is measured against `base`. */
export interface RelativeFormatterOptions extends Intl.RelativeTimeFormatOptions, DateBaseOptions {
  /**
   * What the target is relative to: a date-like value, or an accessor for one
   * (`() => now()` makes the formatter track a clock signal). Required by `@pyreon/format/core`; in the reactive entry
   * it defaults to the ambient clock (`@pyreon/ambient`'s `now()`, read on every call).
   */
  base?: DateInput | (() => DateInput) | undefined
}

/** Options of `relativeFormatter` in `@pyreon/format/core`, where there is no ambient clock: `base` is required. */
export type CoreRelativeFormatterOptions = RelativeFormatterOptions & { base: DateInput | (() => DateInput) }

/**
 * Per formatter kind: the input it takes, the spec (options) it is built from,
 * the part type of `parts()` (`never` when the platform has no parts for it)
 * and whether it has `range()`.
 */
export interface KindInfo {
  number: { in: NumberInput; spec: NumberOptions; part: Intl.NumberFormatPart; range: true }
  currency: { in: NumberInput; spec: CurrencyOptions & { currency: string }; part: Intl.NumberFormatPart; range: true }
  percent: { in: NumberInput; spec: PercentOptions; part: Intl.NumberFormatPart; range: true }
  compact: { in: NumberInput; spec: CompactOptions; part: Intl.NumberFormatPart; range: true }
  unit: { in: NumberInput; spec: UnitOptions & { unit: Unit }; part: Intl.NumberFormatPart; range: true }
  bytes: { in: NumberInput; spec: BytesOptions; part: Intl.NumberFormatPart; range: false }
  duration: { in: DurationInput; spec: DurationOptions; part: never; range: false }
  list: { in: ListInput; spec: ListOptions; part: ListPart; range: false }
  date: { in: DateInput; spec: DateTimeOptions; part: Intl.DateTimeFormatPart; range: true }
  time: { in: DateInput; spec: DateTimeOptions; part: Intl.DateTimeFormatPart; range: true }
  dateTime: { in: DateInput; spec: DateTimeOptions; part: Intl.DateTimeFormatPart; range: true }
  relative: { in: DateInput; spec: RelativeFormatterOptions; part: never; range: false }
}

/** The formatter kinds: one per factory. */
export type FormatterKind = keyof KindInfo

/** The `Formatter` surface every kind has. */
export interface FormatterMembers<In, K extends FormatterKind> {
  (value: In): string
  /** Derive a formatter with options merged over this one's. The original is untouched; `undefined` unsets an option. */
  with(overrides: Partial<KindInfo[K]['spec']>): Formatter<In, K>
  /** Adapt the input: `price.from((cents: number) => cents / 100)`. */
  from<Src>(map: (source: Src) => In): Formatter<Src, K>
  /** What nullish or invalid input renders as. */
  fallback(text: string): Formatter<In, K>
  /** The resolved spec, for debugging and for components. */
  readonly options: Readonly<KindInfo[K]['spec']>
}

/**
 * A reusable formatter: a plain `(value) => string` that follows the active
 * locale (and zone) like the free functions, so it drops into any formatting
 * callback (`Array#map`, a chart axis, a table column). `parts` exists where
 * the platform has parts, `range` where `Intl` has `formatRange`.
 */
export type Formatter<In, K extends FormatterKind = FormatterKind> = FormatterMembers<In, K> &
  ([KindInfo[K]['part']] extends [never] ? unknown : { parts(value: In): readonly KindInfo[K]['part'][] }) &
  (KindInfo[K]['range'] extends true ? { range(start: In, end: In): string } : unknown)

/** The input type a formatter of kind `K` takes. */
export type FormatterInput<K extends FormatterKind> = KindInfo[K]['in']

// ─── defineFormats ───────────────────────────────────────────────────────────

/** A named, reusable format: the `kind` picks the formatter, the rest are that formatter's options. */
export type FormatSpec = { [K in FormatterKind]: { kind: K } & KindInfo[K]['spec'] }[FormatterKind]

type AnySpecOptions = { [K in FormatterKind]: Partial<KindInfo[K]['spec']> }[FormatterKind]

/** A format that extends another one of the same set by name: its kind is inherited and its options merge over the base's. */
export type ExtendedSpec<Name extends string> = { extends: Name } & AnySpecOptions

/** The kind a spec resolves to, following `extends` (a cycle or an unknown name resolves to `never`). */
export type SpecKind<T, K extends keyof T, Depth extends unknown[] = []> = Depth['length'] extends 8
  ? never
  : T[K] extends { kind: infer Kd extends FormatterKind }
    ? Kd
    : T[K] extends { extends: infer N }
      ? N extends keyof T
        ? SpecKind<T, N, [...Depth, 0]>
        : never
      : never

/** What {@link defineFormats} returns: one real `Formatter` per declared key. */
export type DefinedFormats<T> = {
  readonly [K in keyof T]: Formatter<KindInfo[SpecKind<T, K>]['in'], SpecKind<T, K>>
}
