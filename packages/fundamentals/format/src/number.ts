/**
 * Number-family formatters: `formatNumber`, `formatCurrency`, `formatPercent`,
 * `formatCompact`, `formatUnit`, `formatBytes`, `formatNumberRange` and
 * `formatNumberToParts`. Every function takes the locale first (the entries
 * resolve it: core from `options.locale`, the reactive entry from the active
 * locale) so the hot path is one table lookup and one `format()` call.
 */
import { clearTable, construct, createTable, resolve, tableStats } from './cache'
import { programmerError, warnInvalid, warnOnce } from './warn'
import type {
  BytesOptions,
  CompactOptions,
  CompactPreset,
  CurrencyOptions,
  CurrencyPreset,
  NumberInput,
  NumberOptions,
  NumberPreset,
  NumberRangeOptions,
  PercentOptions,
  Unit,
  UnitOptions,
  UnitPreset,
} from './types'

type Opts = Intl.NumberFormatOptions

export function fallbackOf(options: unknown): string {
  if (typeof options === 'object' && options !== null) {
    const f = (options as { fallback?: string | undefined }).fallback
    if (f !== undefined) return f
  }
  return ''
}

function newNumberFormat(locale: string | undefined, options: object): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, options)
}

export function badLocale(fn: string): (locale: string) => void {
  return (locale) =>
    warnOnce(
      `${fn}:locale:${locale}`,
      `[Pyreon] ${fn}(): the locale ${JSON.stringify(locale)} is not a valid BCP 47 tag; using the runtime default. Use a tag such as "en-US" (underscores are not valid).`,
    )
}

function badOptions(fn: string): (error: unknown) => Error {
  return (error) =>
    programmerError(
      fn,
      `${error instanceof Error ? error.message : String(error)}. Check the options against Intl.NumberFormat (valid currency codes, units from Intl.supportedValuesOf('unit'), digit ranges).`,
    )
}

/** Resolve a string preset against a table of presets (own keys only). */
export function preset<T extends object>(
  presets: Record<string, T>,
  name: string,
  fn: string,
): T {
  if (Object.hasOwn(presets, name)) return presets[name] as T
  throw programmerError(
    fn,
    `unknown preset ${JSON.stringify(name)}. Valid presets: ${Object.keys(presets).join(', ')}. Pass an options object for anything else.`,
  )
}

/** Presets of the functions that have none: a string there is a mistake. */
const NO_PRESETS: Record<string, Opts> = {}

/**
 * The table builders receive `object | string | undefined`; this resolves a
 * string through the function's presets and narrows an object to the function's
 * own option type (the public signature is what guarantees that shape).
 */
function optionsOf<O extends object>(
  options: object | string | undefined,
  presets: Record<string, Opts>,
  fn: string,
): O | undefined {
  if (options === undefined) return undefined
  if (typeof options === 'string') return preset(presets, options, fn) as O
  return options as O
}

function make(fn: string, locale: string, options: Opts): Intl.NumberFormat {
  return construct(newNumberFormat, locale, options, badOptions(fn), badLocale(fn))
}

// ─── formatNumber ────────────────────────────────────────────────────────────

const NUMBER_PRESETS: Record<NumberPreset, Opts> = {
  integer: { maximumFractionDigits: 0 },
  plain: { useGrouping: false },
  compact: { notation: 'compact' },
  percent: { style: 'percent' },
}

const numberTable = createTable<Intl.NumberFormat>((locale, _variant, options) =>
  make('formatNumber', locale, optionsOf<Opts>(options, NUMBER_PRESETS, 'formatNumber') ?? {}),
)

/** Invalid: not a number, not a bigint, not NaN. Nullish is "missing", not invalid. */
function badNumber(fn: string, value: unknown, options: unknown): string {
  if (value != null) warnInvalid(fn, value, 'a number or bigint (NaN is not a number)')
  return fallbackOf(options)
}

function isUsable(value: unknown): value is number | bigint {
  return typeof value === 'bigint' || (typeof value === 'number' && value === value)
}

export function numberIn(locale: string, value: NumberInput, options: NumberOptions | NumberPreset | undefined): string {
  if (!isUsable(value)) return badNumber('formatNumber', value, options)
  return resolve(numberTable, locale, '', options).format(value)
}

export function numberToPartsIn(
  locale: string,
  value: NumberInput,
  options: NumberOptions | NumberPreset | undefined,
): Intl.NumberFormatPart[] {
  if (!isUsable(value)) {
    badNumber('formatNumberToParts', value, options)
    return []
  }
  return resolve(numberTable, locale, '', options).formatToParts(value)
}

const rangeTable = createTable<Intl.NumberFormat>((locale, _variant, options) =>
  make('formatNumberRange', locale, optionsOf<Opts>(options, NUMBER_PRESETS, 'formatNumberRange') ?? {}),
)

export function numberRangeIn(
  locale: string,
  start: NumberInput,
  end: NumberInput,
  options: NumberRangeOptions | NumberPreset | undefined,
): string {
  if (!isUsable(start) || !isUsable(end)) {
    if (start != null && !isUsable(start)) warnInvalid('formatNumberRange', start, 'a number or bigint')
    if (end != null && !isUsable(end)) warnInvalid('formatNumberRange', end, 'a number or bigint')
    return fallbackOf(options)
  }
  return resolve(rangeTable, locale, '', options).formatRange(start, end)
}

// ─── formatCurrency ──────────────────────────────────────────────────────────

const CURRENCY_PRESETS: Record<CurrencyPreset, Opts> = {
  symbol: { currencyDisplay: 'symbol' },
  narrowSymbol: { currencyDisplay: 'narrowSymbol' },
  code: { currencyDisplay: 'code' },
  name: { currencyDisplay: 'name' },
  accounting: { currencySign: 'accounting' },
}

const currencyTable = createTable<Intl.NumberFormat>((locale, currency, options) =>
  make('formatCurrency', locale, {
    ...optionsOf<Opts>(options, CURRENCY_PRESETS, 'formatCurrency'),
    style: 'currency',
    currency,
  }),
)

/** A currency code is three ASCII letters (ISO 4217 shape); `Intl` rejects anything else. */
function isCurrencyCode(c: unknown): c is string {
  if (typeof c !== 'string' || c.length !== 3) return false
  for (let i = 0; i < 3; i++) {
    const k = c.charCodeAt(i) | 32
    if (k < 97 || k > 122) return false
  }
  return true
}

export function currencyIn(
  locale: string,
  value: NumberInput,
  currency: string,
  options: CurrencyOptions | CurrencyPreset | undefined,
): string {
  if (!isUsable(value)) return badNumber('formatCurrency', value, options)
  if (!isCurrencyCode(currency)) {
    warnInvalid('formatCurrency', currency, 'a three-letter ISO 4217 currency code such as "EUR"')
    return fallbackOf(options)
  }
  return resolve(currencyTable, locale, currency, options).format(value)
}

// ─── formatPercent ───────────────────────────────────────────────────────────

const percentTable = createTable<Intl.NumberFormat>((locale, _variant, options) =>
  make('formatPercent', locale, {
    ...optionsOf<PercentOptions>(options, NO_PRESETS, 'formatPercent'),
    style: 'percent',
  }),
)

export function percentIn(locale: string, value: NumberInput, options: PercentOptions | undefined): string {
  if (!isUsable(value)) return badNumber('formatPercent', value, options)
  return resolve(percentTable, locale, '', options).format(value)
}

// ─── formatCompact ───────────────────────────────────────────────────────────

const COMPACT_PRESETS: Record<CompactPreset, Opts> = {
  short: { compactDisplay: 'short' },
  long: { compactDisplay: 'long' },
}

const compactTable = createTable<Intl.NumberFormat>((locale, _variant, options) =>
  make('formatCompact', locale, {
    ...optionsOf<Opts>(options, COMPACT_PRESETS, 'formatCompact'),
    notation: 'compact',
  }),
)

export function compactIn(
  locale: string,
  value: NumberInput,
  options: CompactOptions | CompactPreset | undefined,
): string {
  if (!isUsable(value)) return badNumber('formatCompact', value, options)
  return resolve(compactTable, locale, '', options).format(value)
}

// ─── formatUnit ──────────────────────────────────────────────────────────────

const UNIT_PRESETS: Record<UnitPreset, Opts> = {
  short: { unitDisplay: 'short' },
  narrow: { unitDisplay: 'narrow' },
  long: { unitDisplay: 'long' },
}

const unitTable = createTable<Intl.NumberFormat>((locale, unit, options) =>
  make('formatUnit', locale, {
    unitDisplay: 'short',
    ...optionsOf<Opts>(options, UNIT_PRESETS, 'formatUnit'),
    style: 'unit',
    unit,
  }),
)

export function unitIn(
  locale: string,
  value: NumberInput,
  unit: Unit,
  options: UnitOptions | UnitPreset | undefined,
): string {
  if (!isUsable(value)) return badNumber('formatUnit', value, options)
  if (typeof unit !== 'string' || !unit) {
    throw programmerError('formatUnit', `the unit must be a string such as "kilometer" or "kilometer-per-hour", got ${String(unit)}. See Intl.supportedValuesOf('unit').`)
  }
  return resolve(unitTable, locale, unit, options).format(value)
}

// ─── formatBytes ─────────────────────────────────────────────────────────────

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'] as const
const BYTE_SYMBOLS_BINARY = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const

/**
 * One cache entry per (locale, options): the options and, filled lazily, one
 * `Intl.NumberFormat` per byte unit. A `Pack` is built once per cached options
 * shape; the per-call work is picking the unit and one `format()`.
 */
interface BytesPack {
  readonly locale: string
  readonly options: Opts
  readonly binary: boolean
  readonly digits: number
  readonly formats: (Intl.NumberFormat | undefined)[]
}

const bytesTable = createTable<BytesPack>((locale, _variant, options) => {
  const o = optionsOf<BytesOptions>(options, NO_PRESETS, 'formatBytes') ?? {}
  const digits = o.maximumFractionDigits ?? Math.max(1, o.minimumFractionDigits ?? 0)
  const base: Opts = { ...o, maximumFractionDigits: digits, unitDisplay: o.unitDisplay ?? 'short' }
  // Validate the options now (and fall a bad locale back) with the cheapest unit.
  const first = make('formatBytes', locale, { ...base, style: 'unit', unit: 'byte' })
  const formats: (Intl.NumberFormat | undefined)[] = [first, undefined, undefined, undefined, undefined, undefined]
  return { locale, options: base, binary: o.binary === true, digits, formats }
})

function bytesFormatter(pack: BytesPack, index: number): Intl.NumberFormat {
  return (pack.formats[index] ??= make('formatBytes', pack.locale, {
    ...pack.options,
    style: 'unit',
    unit: BYTE_UNITS[index] as string,
  }))
}

export function bytesIn(locale: string, bytes: NumberInput, options: BytesOptions | undefined): string {
  if (bytes == null) return fallbackOf(options)
  const value = typeof bytes === 'bigint' ? Number(bytes) : bytes
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    warnInvalid('formatBytes', bytes, 'a finite number of bytes')
    return fallbackOf(options)
  }
  const pack = resolve(bytesTable, locale, '', options)
  const base = pack.binary ? 1024 : 1000
  let scaled = value < 0 ? -value : value
  let index = 0
  while (scaled >= base && index < 5) {
    scaled /= base
    index++
  }
  // Rounding can carry a value over the next step (999.96 kB at one digit is
  // "1000 kB", never shown): bump the unit instead.
  if (index < 5) {
    const factor = 10 ** pack.digits
    if (Math.round(scaled * factor) / factor >= base) {
      scaled /= base
      index++
    }
  }
  const shown = value < 0 ? -scaled : scaled
  const format = bytesFormatter(pack, index)
  if (!pack.binary || index === 0) return format.format(shown)
  // No Intl unit exists for KiB/MiB: let Intl place the number and unit
  // (spacing and order are per locale), and swap the unit text for the IEC symbol.
  const parts = format.formatToParts(shown)
  let out = ''
  for (const part of parts) out += part.type === 'unit' ? (BYTE_SYMBOLS_BINARY[index] as string) : part.value
  return out
}

/** Test hooks. */
export function _numberTables() {
  return { number: numberTable, currency: currencyTable, unit: unitTable, bytes: bytesTable, percent: percentTable, compact: compactTable, range: rangeTable }
}
export function _clearNumberTables(): void {
  for (const t of Object.values(_numberTables())) clearTable(t as never)
}
export { tableStats }
