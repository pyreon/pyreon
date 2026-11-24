/**
 * Number-family formatters: `formatNumber`, `formatCurrency`, `formatPercent`,
 * `formatCompact`, `formatUnit`, `formatBytes`, `formatNumberRange` and
 * `formatNumberToParts`. Every function takes the locale first (the entries
 * resolve it: core from `options.locale`, the reactive entry from the active
 * locale) so the hot path is one table lookup and one `format()` call.
 */
import { clearTable, construct, createTable, guarded, resolve, tableStats, type Table } from './cache'
import { exactRange, greater } from './exact'
import type { Core, KindDef } from './formatter'
import { describe, programmerError, quote, warnInvalid, warnOnce } from './warn'
import type {
  BaseOptions,
  BytesOptions,
  CompactOptions,
  CompactPreset,
  CurrencyInput,
  CurrencyOptions,
  CurrencyPreset,
  KindInfo,
  MoneyLike,
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

/** A fallback is text: anything else (a wrong-typed option) reads as the default `''`. */
export function fallbackText(fallback: unknown): string {
  return typeof fallback === 'string' ? fallback : ''
}

export function fallbackOf(options: unknown): string {
  if (typeof options === 'object' && options !== null) return fallbackText((options as { fallback?: unknown }).fallback)

  return ''
}

function newNumberFormat(locale: string | undefined, options: object): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, options)
}

export function badLocale(fn: string): (locale: string) => void {
  return (locale) => {
    if (process.env.NODE_ENV !== 'production') {
      warnOnce(
        `${fn}:locale:${locale}`,
        `[Pyreon] ${fn}(): the locale ${quote(locale)} is not a valid BCP 47 tag; using the runtime default. Use a tag such as "en-US" (underscores are not valid).`,
      )
    }
  }
}

function badOptions(fn: string, hint: string): (error: unknown) => Error {
  return (error) => programmerError(fn, `${error instanceof Error ? error.message : String(error)}. Check the option values${hint}.`)
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

function make(fn: string, locale: string, options: Opts, hint = ''): Intl.NumberFormat {
  return construct(newNumberFormat, locale, options, badOptions(fn, hint), badLocale(fn))
}

// ─── formatNumber ────────────────────────────────────────────────────────────

const NUMBER_PRESETS: Record<NumberPreset, Opts> = {
  integer: { maximumFractionDigits: 0 },
  plain: { useGrouping: false },
  compact: { notation: 'compact' },
  percent: { style: 'percent' },
}

const numberTable = /* @__PURE__ */ createTable<Intl.NumberFormat>((locale, _variant, options) =>
  make('formatNumber', locale, { signDisplay: 'negative', ...optionsOf<Opts>(options, NUMBER_PRESETS, 'formatNumber') }),
)

const EXPECTED_NUMBER = 'a number, a bigint or a decimal string such as "-1234.5" within the double range (NaN is not a number)'

/** Invalid: not a number, not a bigint, not a decimal string, or NaN. Nullish is "missing", not invalid. */
export function badNumber(fn: string, value: unknown, fallback: string): string {
  if (value != null) {
    if (process.env.NODE_ENV !== 'production') warnInvalid(fn, value, EXPECTED_NUMBER)
  }

  return fallback
}

/**
 * A decimal string: an optional `-`, digits, and an optional `.` followed by digits (`"9.99"`, `"-12345678901234567.89"`).
 * `Intl` formats it exactly, at any size. Anything else `Intl` would read as a string number (`""` is 0, `"1e3"`,
 * `" 12 "`, `"Infinity"`, `"0x1F"`) is rejected: such text is almost always a bug, never an amount.
 */
export function isDecimal(value: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(value)
}

/**
 * A value `Intl.NumberFormat` formats exactly: a number (not NaN), a bigint, or a decimal string within the double range
 * (any precision, but beyond about 1.8e308 every engine prints `∞`, so such a string is invalid rather than shown wrong).
 */
export function isUsable(value: unknown): value is number | bigint | `${number}` {
  return typeof value === 'bigint' || (typeof value === 'number' && value === value) || (typeof value === 'string' && isDecimal(value) && Number.isFinite(Number(value)))
}

export function numberIn(locale: string, value: NumberInput, options: NumberOptions | NumberPreset | undefined): string {
  if (!isUsable(value)) return badNumber('formatNumber', value, fallbackOf(options))
  return resolve(numberTable, locale, '', options).format(value)
}

export function numberToPartsIn(
  locale: string,
  value: NumberInput,
  options: NumberOptions | NumberPreset | undefined,
): Intl.NumberFormatPart[] {
  if (!isUsable(value)) {
    badNumber('formatNumberToParts', value, fallbackOf(options))
    return []
  }

  return resolve(numberTable, locale, '', options).formatToParts(value)
}

const rangeTable = /* @__PURE__ */ createTable<Intl.NumberFormat>((locale, _variant, options) =>
  make('formatNumberRange', locale, { signDisplay: 'negative', ...optionsOf<Opts>(options, NUMBER_PRESETS, 'formatNumberRange') }),
)

export function numberRangeIn(
  locale: string,
  start: NumberInput,
  end: NumberInput,
  options: NumberRangeOptions | NumberPreset | undefined,
): string {
  if (!isUsable(start) || !isUsable(end)) {
    if (process.env.NODE_ENV !== 'production') {
      if (start != null && !isUsable(start)) warnInvalid('formatNumberRange', start, EXPECTED_NUMBER)
      if (end != null && !isUsable(end)) warnInvalid('formatNumberRange', end, EXPECTED_NUMBER)
    }

    return fallbackOf(options)
  }

  // A range picker mid-selection produces reversed pairs: order them.
  const range = resolve(rangeTable, locale, '', options)

  return greater(start, end) ? exactRange(range, end, start) : exactRange(range, start, end)
}

// ─── formatCurrency ──────────────────────────────────────────────────────────

const CURRENCY_PRESETS: Record<CurrencyPreset, Opts> = {
  symbol: { currencyDisplay: 'symbol' },
  narrowSymbol: { currencyDisplay: 'narrowSymbol' },
  code: { currencyDisplay: 'code' },
  name: { currencyDisplay: 'name' },
  accounting: { currencySign: 'accounting' },
}

const DIGIT_OPTIONS = ['minimumFractionDigits', 'maximumFractionDigits', 'minimumSignificantDigits', 'maximumSignificantDigits', 'roundingIncrement'] as const

/** The most fraction digits `Intl.NumberFormat` takes (ES2023; older engines stop at 20). */
const MAX_SCALE = 100

/**
 * Currency formats with a variant of the code and, for a Money, its digits. A Money is shown with its own digits (the
 * amount's scale), not the platform's display digits for the currency, so it is never rounded: a currency given other
 * digits with `defineCurrency` (ISK in hundredths) shows them. Options that set digits themselves win.
 *
 * Variants: `"EUR"` (the currency's own digits), `"EUR2"` (ISO code, 2 digits), `"#2"` / `"#"` (a custom code such as `USDT`, which `Intl` rejects: formatted
 * as the placeholder `XXX` shown as a code, which {@link relabel} replaces, so the locale's own pattern places the code).
 */
const currencyTable = /* @__PURE__ */ createTable<Intl.NumberFormat>((locale, variant, options) => {
  const own = optionsOf<Opts>(options, CURRENCY_PRESETS, 'formatCurrency')
  const custom = variant.charCodeAt(0) === 35
  const digitText = custom ? variant.slice(1) : variant.slice(3)
  const digits = Number(digitText)
  const setsDigits = digitText === '' || (own !== undefined && DIGIT_OPTIONS.some((key) => (own as Record<string, unknown>)[key] !== undefined))

  return make('formatCurrency', locale, {
    signDisplay: 'negative',
    ...(setsDigits ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    ...own,
    ...(custom ? { currencyDisplay: 'code' } : undefined),
    style: 'currency',
    currency: custom ? PLACEHOLDER : variant.slice(0, 3),
  })
})

/** The ISO "no currency" code: the stand-in for a custom code, displayed as a code and then relabelled. */
const PLACEHOLDER = 'XXX'

/** A currency code is three ASCII letters (ISO 4217 shape); `Intl` rejects anything else. */
export function isCurrencyCode(c: unknown): c is string {
  if (typeof c !== 'string' || c.length !== 3) return false
  for (let i = 0; i < 3; i++) {
    const k = c.charCodeAt(i) | 32
    if (k < 97 || k > 122) return false
  }

  return true
}

/**
 * A custom currency code `Intl` cannot take: 2 to 12 upper-case letters or digits starting with a letter, not three
 * letters (what `defineCurrency` in `@pyreon/money` registers: `USDT`, `PTS1`, `LOYALTY`).
 */
function isCustomCode(c: unknown): c is string {
  return typeof c === 'string' && !isCurrencyCode(c) && /^[A-Z][A-Z0-9]{1,11}$/.test(c)
}

/** Text of a custom-code format: the placeholder code replaced by the real one. */
function relabel(text: string, code: string): string {
  return code === PLACEHOLDER ? text : text.replaceAll(PLACEHOLDER, code)
}

function relabelParts(parts: Intl.NumberFormatPart[], code: string): Intl.NumberFormatPart[] {
  return parts.map((part) => (part.type === 'currency' && part.value === PLACEHOLDER ? { type: 'currency', value: code } : part))
}

/** The structural shape of a `@pyreon/money` Money: `{ amount: "9.99", currency: "EUR" }` (no dependency on that package). */
export function isMoneyLike(value: unknown): value is MoneyLike {
  return typeof value === 'object' && value !== null && typeof (value as MoneyLike).amount === 'string' && typeof (value as MoneyLike).currency === 'string'
}

/** The fraction digits of a decimal string. */
function scaleOf(amount: string): number {
  const dot = amount.indexOf('.')

  return dot === -1 ? 0 : amount.length - dot - 1
}

/** The options of `formatCurrency`'s two forms: `(money, options?)` and `(value, currency, options?)`. */
export function currencyOptions(value: unknown, a: unknown, b: unknown): CurrencyOptions | CurrencyPreset | undefined {
  return (isMoneyLike(value) ? a : b) as CurrencyOptions | CurrencyPreset | undefined
}

const EXPECTED_CODE = 'an ISO 4217 code such as "EUR", or a custom code of 2 to 12 upper-case letters or digits such as "USDT"'

function badCurrency(fn: string, currency: unknown, fallback: string): string {
  if (process.env.NODE_ENV !== 'production') warnInvalid(fn, currency, EXPECTED_CODE)

  return fallback
}

/** A known code shape: ISO (three letters) or custom. */
function isCode(c: unknown): c is string {
  return isCurrencyCode(c) || isCustomCode(c)
}

/**
 * The format of `code` with `digits` forced (`undefined`: the currency's own), or `undefined` when the engine cannot show
 * that many digits (more than {@link MAX_SCALE}, or more than 20 on an engine without ES2023 `Intl`): data never throws.
 */
function currencyFormat(fn: string, locale: string, code: string, digits: number | undefined, options: CurrencyOptions | CurrencyPreset | undefined): Intl.NumberFormat | undefined {
  const variant = (isCustomCode(code) ? '#' : code) + (digits === undefined ? '' : String(digits))
  if (digits === undefined || digits <= 20) return resolve(currencyTable, locale, variant, options)
  try {
    if (digits <= MAX_SCALE) return resolve(currencyTable, locale, variant, options)
  } catch {
    // An engine before ES2023 Intl takes at most 20 fraction digits.
  }
  if (process.env.NODE_ENV !== 'production') warnInvalid(fn, digits, `an amount with at most ${MAX_SCALE} fraction digits (at most 20 on engines before ES2023 Intl)`)

  return undefined
}

/** Format a Money with its own digits; `expected` (a currency formatter's code) must match its currency. */
function moneyText(fn: string, locale: string, m: MoneyLike, options: CurrencyOptions | CurrencyPreset | undefined, expected: string | undefined): string {
  const fallback = fallbackOf(options)
  if (!isUsable(m.amount)) return badNumber(fn, m.amount, fallback)
  if (!isCode(m.currency)) return badCurrency(fn, m.currency, fallback)
  if (expected !== undefined && m.currency !== expected) {
    if (process.env.NODE_ENV !== 'production') {
      warnInvalid(fn, m, `a Money in ${expected} (this formatter is for ${expected}; use formatCurrency(m) for any currency)`)
    }

    return fallback
  }
  const format = currencyFormat(fn, locale, m.currency, scaleOf(m.amount), options)

  return format === undefined ? fallback : relabel(format.format(m.amount as `${number}`), m.currency)
}

export function currencyIn(locale: string, value: CurrencyInput, a: unknown, b: unknown): string {
  if (isMoneyLike(value)) {
    if (typeof a === 'string' && isCode(a) && !Object.hasOwn(CURRENCY_PRESETS, a)) {
      throw programmerError('formatCurrency', `a Money carries its currency: call formatCurrency(m) or formatCurrency(m, options), not formatCurrency(m, ${quote(a)}).`)
    }
    const options = a as CurrencyOptions | CurrencyPreset | undefined

    return moneyText('formatCurrency', locale, value, options, undefined)
  }
  const options = b as CurrencyOptions | CurrencyPreset | undefined
  if (!isUsable(value)) return badNumber('formatCurrency', value, fallbackOf(options))
  if (!isCode(a)) return badCurrency('formatCurrency', a, fallbackOf(options))

  return relabel((currencyFormat('formatCurrency', locale, a, undefined, options) as Intl.NumberFormat).format(value), a)
}

// ─── formatPercent ───────────────────────────────────────────────────────────

const percentTable = /* @__PURE__ */ createTable<Intl.NumberFormat>((locale, _variant, options) =>
  make('formatPercent', locale, {
    signDisplay: 'negative',
    ...optionsOf<PercentOptions>(options, NO_PRESETS, 'formatPercent'),
    style: 'percent',
  }),
)

export function percentIn(locale: string, value: NumberInput, options: PercentOptions | undefined): string {
  if (!isUsable(value)) return badNumber('formatPercent', value, fallbackOf(options))
  return resolve(percentTable, locale, '', options).format(value)
}

// ─── formatCompact ───────────────────────────────────────────────────────────

const COMPACT_PRESETS: Record<CompactPreset, Opts> = {
  short: { compactDisplay: 'short' },
  long: { compactDisplay: 'long' },
}

const compactTable = /* @__PURE__ */ createTable<Intl.NumberFormat>((locale, _variant, options) =>
  make('formatCompact', locale, {
    signDisplay: 'negative',
    ...optionsOf<Opts>(options, COMPACT_PRESETS, 'formatCompact'),
    notation: 'compact',
  }),
)

export function compactIn(
  locale: string,
  value: NumberInput,
  options: CompactOptions | CompactPreset | undefined,
): string {
  if (!isUsable(value)) return badNumber('formatCompact', value, fallbackOf(options))
  return resolve(compactTable, locale, '', options).format(value)
}

// ─── formatUnit ──────────────────────────────────────────────────────────────

const UNIT_PRESETS: Record<UnitPreset, Opts> = {
  short: { unitDisplay: 'short' },
  narrow: { unitDisplay: 'narrow' },
  long: { unitDisplay: 'long' },
}

const unitTable = /* @__PURE__ */ createTable<Intl.NumberFormat>((locale, unit, options) =>
  make('formatUnit', locale, {
    signDisplay: 'negative',
    unitDisplay: 'short',
    ...optionsOf<Opts>(options, UNIT_PRESETS, 'formatUnit'),
    style: 'unit',
    unit,
  }, ": Intl.supportedValuesOf('unit') lists the units"),
)

export function unitIn(
  locale: string,
  value: NumberInput,
  unit: Unit,
  options: UnitOptions | UnitPreset | undefined,
): string {
  if (!isUsable(value)) return badNumber('formatUnit', value, fallbackOf(options))
  if (typeof unit !== 'string' || !unit) {
    throw programmerError('formatUnit', `the unit must be a string such as "kilometer" or "kilometer-per-hour", got ${describe(unit)}. See Intl.supportedValuesOf('unit').`)
  }

  return resolve(unitTable, locale, unit, options).format(value)
}

// ─── formatBytes ─────────────────────────────────────────────────────────────

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'] as const
/** IEC symbols are language-neutral, so they stand in for the unit text of the nearest `Intl` unit (up to YiB). */
const BYTE_SYMBOLS_BINARY = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'] as const
const BIG_PREFIXES = ['E', 'Z', 'Y'] as const

type UnitDisplay = 'short' | 'narrow' | 'long'

/**
 * One cache entry per (locale, options): the options and, filled lazily, one
 * `Intl.NumberFormat` per byte unit. A `Pack` is built once per cached options
 * shape; the per-call work is picking the unit and one `format()`.
 *
 * `Intl` has no unit above petabyte and writes a lone byte as a word ("999 byte") next to symbols ("1 kB"). So:
 * - `byteSymbol` is the locale's own narrow byte symbol ("B"), set when the locale writes short units as symbols
 *   (its short and narrow kilobyte text are the same); `bytePre` / `bytePost` are the locale's short kilobyte pattern
 *   (number order, spacing, bidi marks) around that symbol. Locales that write words (ar, he, th) keep `Intl`'s word.
 * - `bigSymbols` (EB, ZB, YB) derive from the locale's petabyte text by swapping its leading "P" (fr: Po -> Eo), only
 *   when it starts with "P"; otherwise (ru, ar) the scale stops at petabytes. `long` display never leaves petabytes
 *   (the unit word cannot be derived); IEC symbols (EiB, ZiB, YiB) are language neutral and always allowed.
 */
interface BytesPack {
  readonly locale: string
  readonly options: Opts
  readonly binary: boolean
  readonly digits: number
  readonly display: UnitDisplay
  readonly formats: (Intl.NumberFormat | undefined)[]
  readonly byteSymbol: string | undefined
  readonly bytePre: string
  readonly bytePost: string
  readonly byteNumber: Intl.NumberFormat | undefined
  readonly bigSymbols: readonly string[] | undefined
  /** The highest byte-unit index this pack scales to (5 = petabyte, 8 = yotta). */
  readonly maxIndex: number
}

const NUMERIC_PARTS = new Set(['integer', 'group', 'decimal', 'fraction', 'minusSign', 'plusSign'])

function unitText(format: Intl.NumberFormat): string {
  return format.formatToParts(5).find((p) => p.type === 'unit')?.value ?? ''
}

const bytesTable = /* @__PURE__ */ createTable<BytesPack>(/* @__PURE__ */ guarded((locale, _variant, options) => {
  const o = optionsOf<BytesOptions>(options, NO_PRESETS, 'formatBytes') ?? {}
  const digits = o.maximumFractionDigits ?? Math.max(1, o.minimumFractionDigits ?? 0)
  const display: UnitDisplay = o.unitDisplay ?? 'short'
  const base: Opts = { signDisplay: 'negative', ...o, maximumFractionDigits: digits, unitDisplay: display }
  const unitFormat = (unit: string, unitDisplay: UnitDisplay) => make('formatBytes', locale, { ...base, style: 'unit', unit, unitDisplay })
  // Validate the options now (and fall a bad locale back) with the cheapest unit.
  const first = unitFormat('byte', display)
  const formats: (Intl.NumberFormat | undefined)[] = [first, undefined, undefined, undefined, undefined, undefined]
  let byteSymbol: string | undefined
  let bytePre = ''
  let bytePost = ''
  let byteNumber: Intl.NumberFormat | undefined
  let bigSymbols: string[] | undefined
  let maxIndex = 5
  if (display === 'short') {
    const kilo = unitFormat('kilobyte', 'short')
    formats[1] = kilo
    if (unitText(kilo).toLowerCase() === unitText(unitFormat('kilobyte', 'narrow')).toLowerCase()) {
      byteSymbol = unitFormat('byte', 'narrow').formatToParts(5).find((p) => p.type === 'unit')?.value
      if (byteSymbol !== undefined) {
        // The locale's kilobyte pattern with the byte symbol in the unit's place, around a plain number.
        const parts = kilo.formatToParts(5)
        const firstNum = parts.findIndex((p) => NUMERIC_PARTS.has(p.type))
        let lastNum = firstNum
        parts.forEach((p, i) => {
          if (NUMERIC_PARTS.has(p.type)) lastNum = i
        })
        const text = (from: number, to: number) => parts.slice(from, to).map((p) => (p.type === 'unit' ? (byteSymbol as string) : p.value)).join('')
        bytePre = text(0, firstNum)
        bytePost = text(lastNum + 1, parts.length)
        byteNumber = make('formatBytes', locale, { ...base, style: 'decimal' })
      }
    }
  }
  if (display !== 'long') {
    if (o.binary === true) maxIndex = 8
    else {
      const peta = unitText(unitFormat('petabyte', display))
      if (peta.startsWith('P')) {
        bigSymbols = BIG_PREFIXES.map((prefix) => `${prefix}${peta.slice(1)}`)
        maxIndex = 8
      }
    }
  }

  return { locale, options: base, binary: o.binary === true, digits, display, formats, byteSymbol, bytePre, bytePost, byteNumber, bigSymbols, maxIndex }
}))

function bytesFormatter(pack: BytesPack, index: number): Intl.NumberFormat {
  const at = index > 5 ? 5 : index

  return (pack.formats[at] ??= make('formatBytes', pack.locale, {
    ...pack.options,
    style: 'unit',
    unit: BYTE_UNITS[at] as string,
  }))
}

/** The unit text `Intl` would not give for this index (a language-neutral or derived symbol), or `undefined`. */
function replacementSymbol(pack: BytesPack, index: number): string | undefined {
  if (index === 0) return pack.byteSymbol
  if (pack.binary) return BYTE_SYMBOLS_BINARY[index]

  return index > 5 ? pack.bigSymbols?.[index - 6] : undefined
}

/** The unit chosen by {@link bytesPick}: the scaled value and the byte-unit index (module scratch: synchronous, no allocation). */
let pickedValue = 0
let pickedIndex = 0

/** Scale `value` to the largest fitting unit (carrying when rounding reaches the next step); returns that unit's formatter. */
function bytesPick(pack: BytesPack, value: number): Intl.NumberFormat {
  const base = pack.binary ? 1024 : 1000
  const top = pack.maxIndex
  let scaled = value < 0 ? -value : value
  let index = 0
  while (scaled >= base && index < top) {
    scaled /= base
    index++
  }
  // Rounding can carry a value over the next step (999.96 kB at one digit is
  // "1000 kB", never shown): bump the unit instead.
  if (index < top) {
    const factor = 10 ** pack.digits
    if (Math.round(scaled * factor) / factor >= base) {
      scaled /= base
      index++
    }
  }
  pickedValue = value < 0 ? -scaled : scaled
  pickedIndex = index

  return bytesFormatter(pack, index === 0 && pack.byteSymbol !== undefined ? 1 : index)
}

/** The parts of the picked value with the unit text replaced where `Intl` has none (or only a word). */
function bytesParts(pack: BytesPack, format: Intl.NumberFormat): Intl.NumberFormatPart[] {
  const parts = format.formatToParts(pickedValue)
  const symbol = replacementSymbol(pack, pickedIndex)
  if (symbol === undefined) return parts

  return parts.map((part) => (part.type === 'unit' ? { type: 'unit', value: symbol } : part))
}

function bytesText(pack: BytesPack, format: Intl.NumberFormat): string {
  if (pickedIndex === 0 && pack.byteNumber !== undefined) return pack.bytePre + pack.byteNumber.format(pickedValue) + pack.bytePost
  if (replacementSymbol(pack, pickedIndex) === undefined) return format.format(pickedValue)
  let out = ''
  for (const part of bytesParts(pack, format)) out += part.value

  return out
}

/** A finite byte count, or `undefined` (with a dev warning for non-nullish input). */
function bytesValue(bytes: NumberInput): number | undefined {
  if (bytes == null) return undefined
  const value = typeof bytes === 'bigint' || (typeof bytes === 'string' && isDecimal(bytes)) ? Number(bytes) : bytes
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (process.env.NODE_ENV !== 'production') warnInvalid('formatBytes', bytes, 'a finite number of bytes (a number, a bigint or a decimal string)')

  return undefined
}

export function bytesIn(locale: string, bytes: NumberInput, options: BytesOptions | undefined): string {
  const value = bytesValue(bytes)
  if (value === undefined) return fallbackOf(options)
  const pack = resolve(bytesTable, locale, '', options)

  return bytesText(pack, bytesPick(pack, value))
}

// ─── Formatters as values ────────────────────────────────────────────────────

/** Spec of `numberFormatter`: an options object, or a preset name resolved once. */
export function numberSpec(options: NumberOptions | NumberPreset | undefined): NumberOptions {
  return optionsOf<NumberOptions>(options, NUMBER_PRESETS, 'numberFormatter') ?? {}
}

export function currencySpec(currency: string, options: CurrencyOptions | CurrencyPreset | undefined): KindInfo['currency']['spec'] {
  return { ...optionsOf<CurrencyOptions>(options, CURRENCY_PRESETS, 'currencyFormatter'), currency }
}

export function percentSpec(options: PercentOptions | undefined): PercentOptions {
  return optionsOf<PercentOptions>(options, NO_PRESETS, 'percentFormatter') ?? {}
}

export function compactSpec(options: CompactOptions | CompactPreset | undefined): CompactOptions {
  return optionsOf<CompactOptions>(options, COMPACT_PRESETS, 'compactFormatter') ?? {}
}

export function unitSpec(unit: Unit, options: UnitOptions | UnitPreset | undefined): KindInfo['unit']['spec'] {
  if (typeof unit !== 'string' || !unit) {
    throw programmerError('unitFormatter', `the unit must be a string such as "kilometer" or "kilometer-per-hour", got ${describe(unit)}. See Intl.supportedValuesOf('unit').`)
  }

  return { ...optionsOf<UnitOptions>(options, UNIT_PRESETS, 'unitFormatter'), unit }
}

export function bytesSpec(options: BytesOptions | undefined): BytesOptions {
  return optionsOf<BytesOptions>(options, NO_PRESETS, 'bytesFormatter') ?? {}
}

/**
 * The core of every number-style formatter: the `Intl.NumberFormat` is looked up
 * once per locale (a cheap string compare per call) and then `format()`.
 */
function numberCore(
  table: Table<Intl.NumberFormat>,
  fn: string,
  variant: string,
  spec: Readonly<BaseOptions>,
  locale: () => string,
): Core<NumberInput> {
  const fb = fallbackText(spec.fallback)
  let at = ''
  let intl: Intl.NumberFormat | undefined
  const get = (l: string): Intl.NumberFormat => {
    if (intl === undefined || l !== at) {
      intl = resolve(table, l, variant, spec)
      at = l
    }

    return intl
  }

  return {
    call: (value) => {
      const l = locale()
      if (!isUsable(value)) return badNumber(fn, value, fb)

      return get(l).format(value)
    },
    parts: (value) => {
      const l = locale()
      if (!isUsable(value)) return []

      return get(l).formatToParts(value)
    },
    range: (start, end) => {
      const l = locale()
      if (!isUsable(start) || !isUsable(end)) return fb

      return greater(start, end) ? exactRange(get(l), end, start) : exactRange(get(l), start, end)
    },
  }
}

export const numberKind: KindDef<'number'> = {
  create: (spec, locale) => numberCore(numberTable, 'numberFormatter', '', spec, locale),
}

export const currencyKind: KindDef<'currency'> = {
  create(spec, locale) {
    const fb = fallbackText(spec.fallback)
    const code = spec.currency
    if (!isCode(code)) {
      return {
        call: () => {
          locale()

          return badCurrency('currencyFormatter', code, fb)
        },
        parts: () => [],
        range: () => fb,
      }
    }
    const fn = 'currencyFormatter'
    /** A Money in another currency or with a malformed amount: warn (dev) and give the fallback. */
    const wrong = (m: MoneyLike): boolean => m.currency !== code || !isUsable(m.amount)
    /** The format for a value (a Money uses its digits); `undefined` for too many digits. */
    const formatFor = (l: string, digits: number | undefined): Intl.NumberFormat | undefined => currencyFormat(fn, l, code, digits, spec)

    return {
      call: (v) => {
        if (isMoneyLike(v)) return moneyText(fn, locale(), v, spec, code)
        const l = locale()
        if (!isUsable(v)) return badNumber(fn, v, fb)

        return relabel((formatFor(l, undefined) as Intl.NumberFormat).format(v), code)
      },
      parts: (v) => {
        const l = locale()
        const money = isMoneyLike(v)
        if (money ? wrong(v) : !isUsable(v)) return []
        const format = formatFor(l, money ? scaleOf(v.amount) : undefined)

        return format === undefined ? [] : relabelParts(format.formatToParts((money ? v.amount : v) as `${number}`), code)
      },
      range: (start, end) => {
        const l = locale()
        if (isMoneyLike(start) && wrong(start)) return moneyText(fn, l, start, spec, code)
        if (isMoneyLike(end) && wrong(end)) return moneyText(fn, l, end, spec, code)
        // A range with a Money shows the Money's digits (the larger scale when both are Money).
        const a = isMoneyLike(start) ? start.amount : start
        const b = isMoneyLike(end) ? end.amount : end
        if (!isUsable(a) || !isUsable(b)) return fb
        const money = isMoneyLike(start) || isMoneyLike(end)
        const digits = Math.max(isMoneyLike(start) ? scaleOf(start.amount) : 0, isMoneyLike(end) ? scaleOf(end.amount) : 0)
        const format = formatFor(l, money ? digits : undefined)
        if (format === undefined) return fb

        return relabel(greater(a, b) ? exactRange(format, b, a) : exactRange(format, a, b), code)
      },
    }
  },
}

export const percentKind: KindDef<'percent'> = {
  create: (spec, locale) => numberCore(percentTable, 'percentFormatter', '', spec, locale),
}

export const compactKind: KindDef<'compact'> = {
  create: (spec, locale) => numberCore(compactTable, 'compactFormatter', '', spec, locale),
}

export const unitKind: KindDef<'unit'> = {
  create: (spec, locale) => numberCore(unitTable, 'unitFormatter', spec.unit, spec, locale),
}

export const bytesKind: KindDef<'bytes'> = {
  create(spec, locale) {
    const fb = fallbackText(spec.fallback)
    let at = ''
    let pack: BytesPack | undefined
    const get = (l: string): BytesPack => {
      if (pack === undefined || l !== at) {
        pack = resolve(bytesTable, l, '', spec)
        at = l
      }

      return pack
    }

    return {
      call: (value) => {
        const l = locale()
        const v = bytesValue(value)
        if (v === undefined) return fb
        const p = get(l)

        return bytesText(p, bytesPick(p, v))
      },
      parts: (value) => {
        const l = locale()
        const v = bytesValue(value)
        if (v === undefined) return []
        const p = get(l)

        return bytesParts(p, bytesPick(p, v))
      },
    }
  },
}

/** Test hooks. */
export function _numberTables() {
  return { number: numberTable, currency: currencyTable, unit: unitTable, bytes: bytesTable, percent: percentTable, compact: compactTable, range: rangeTable }
}

export function _clearNumberTables(): void {
  for (const t of Object.values(_numberTables())) clearTable(t as never)
}

export { tableStats }
