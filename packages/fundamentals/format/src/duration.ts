/**
 * `formatDuration`: `Intl.DurationFormat` when the runtime has it, a correct
 * fallback built from `Intl.NumberFormat` (unit style) + `Intl.ListFormat`
 * (unit type) otherwise. The fallback produces the same text as
 * `Intl.DurationFormat` for the `long` / `short` / `narrow` / `digital` styles
 * in the locales the tests compare.
 */
import type { KindDef } from './formatter'
import { clearTable, construct, createTable, guarded, resolve } from './cache'
import { badLocale, fallbackOf, fallbackText } from './number'
import { describe, programmerError, quote, warnInvalid } from './warn'
import type { Duration, DurationInput, DurationOptions, DurationStyle } from './types'

const STYLES = ['long', 'short', 'narrow', 'digital'] as const

interface DurationFormatLike {
  format(duration: Duration): string
}

type DurationFormatCtor = new (locale: string | undefined, options?: object) => DurationFormatLike

const UNITS = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds'] as const
const UNIT_NAMES = ['year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'] as const

/** Everything needed to format one (locale, options) shape. Built once, cached. */
interface DurationPack {
  readonly locale: string
  readonly style: DurationStyle
  readonly largest: number
  readonly fractionalDigits: number | undefined
  /** Index into {@link UNIT_NAMES} of the finest unit shown, or `undefined` for the default (seconds, milliseconds only below one second). */
  readonly smallest: number | undefined
  /** `Intl.DurationFormat`, or `undefined` when the runtime has none (checked when the pack is built). */
  readonly native: DurationFormatLike | undefined
  readonly units: (Intl.NumberFormat | undefined)[]
  list: Intl.ListFormat | undefined
  digits: Intl.NumberFormat | undefined
}

function nativeCtor(): DurationFormatCtor | undefined {
  const c: unknown = Reflect.get(Intl, 'DurationFormat')
  return typeof c === 'function' ? (c as DurationFormatCtor) : undefined
}

function badOptions(error: unknown): Error {
  return programmerError(
    'formatDuration',
    `${error instanceof Error ? error.message : String(error)}. Options: style 'long' | 'short' | 'narrow' | 'digital', largest a positive integer, smallest a unit name.`,
  )
}

const durationTable = /* @__PURE__ */ createTable<DurationPack>(/* @__PURE__ */ guarded((locale, _variant, options) => {
  const o: DurationOptions =
    options === undefined ? {} : typeof options === 'string' ? { style: options as DurationStyle } : options
  const style = o.style ?? 'short'
  if (!(STYLES as readonly string[]).includes(style)) {
    throw programmerError('formatDuration', `unknown style ${quote(style)}. Use 'long', 'short', 'narrow' or 'digital'.`)
  }
  if (o.largest !== undefined && !(Number.isInteger(o.largest) && o.largest >= 1)) {
    throw programmerError('formatDuration', `largest must be a positive integer (the number of units to show), got ${describe(o.largest)}.`)
  }
  let smallest: number | undefined
  if (o.smallest !== undefined) {
    smallest = (UNIT_NAMES as readonly string[]).indexOf(o.smallest)
    if (smallest < 0) {
      throw programmerError('formatDuration', `unknown smallest unit ${quote(o.smallest)}. Use ${UNIT_NAMES.map((u) => `'${u}'`).join(', ')}.`)
    }
  }
  if (o.fractionalDigits !== undefined && !(Number.isInteger(o.fractionalDigits) && o.fractionalDigits >= 0 && o.fractionalDigits <= 9)) {
    throw programmerError('formatDuration', `fractionalDigits must be an integer from 0 to 9, got ${describe(o.fractionalDigits)}.`)
  }
  // The digital style is written here (one convention in every runtime); only the word styles use Intl.DurationFormat.
  const Ctor = style === 'digital' ? undefined : nativeCtor()
  const native =
    Ctor === undefined
      ? undefined
      : construct(
          (l, opts) => new Ctor(l, opts),
          locale,
          { style, ...(o.fractionalDigits === undefined ? {} : { fractionalDigits: o.fractionalDigits }) },
          badOptions,
          badLocale('formatDuration'),
        )

  return {
    locale,
    style,
    largest: o.largest ?? 8,
    fractionalDigits: o.fractionalDigits,
    smallest,
    native,
    units: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
    list: undefined,
    digits: undefined,
  }
}))

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return construct((l, o) => new Intl.NumberFormat(l, o), locale, options, badOptions, badLocale('formatDuration'))
}

function unitFormat(pack: DurationPack, index: number): Intl.NumberFormat {
  return (pack.units[index] ??= numberFormat(pack.locale, {
    style: 'unit',
    unit: UNIT_NAMES[index] as string,
    unitDisplay: pack.style === 'digital' ? 'short' : pack.style,
  }))
}

const MS = { day: 86400000, hour: 3600000, minute: 60000, second: 1000 }

/**
 * Normalize the input into the eight fields (all the same sign, absolute
 * values here and the sign returned separately), or `undefined` when invalid.
 * A number of milliseconds is broken down into days/hours/minutes/seconds/ms.
 */
function fieldsOf(value: Duration | number, out: number[]): -1 | 1 | undefined {
  let sign: -1 | 1 = 1
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined
    let ms = Math.abs(value)
    sign = value < 0 ? -1 : 1
    out[3] = Math.floor(ms / MS.day)
    ms -= out[3] * MS.day
    out[4] = Math.floor(ms / MS.hour)
    ms -= out[4] * MS.hour
    out[5] = Math.floor(ms / MS.minute)
    ms -= out[5] * MS.minute
    out[6] = Math.floor(ms / MS.second)
    out[7] = ms - out[6] * MS.second

    return sign
  }
  if (typeof value !== 'object' || value === null) return undefined
  let seen = false
  for (let i = 0; i < 8; i++) {
    const v = value[UNITS[i] as keyof Duration]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
    if (v !== 0) {
      const s = v < 0 ? -1 : 1
      if (seen && s !== sign) return undefined
      sign = s
      seen = true
    }
    out[i] = Math.abs(v)
  }

  return sign
}

const UNIT_MS = [31557600000, 2629800000, 604800000, 86400000, 3600000, 60000, 1000, 1] as const
/** Units of one field in the next larger field, for carrying; `0` = never carried (weeks and days have no neat parent). */
const CARRY_LIMIT = [0, 12, 0, 0, 24, 60, 60, 1000] as const
/** Fractions of a field flow down: years -> months, months -> days, weeks -> days, days -> hours, ... */
const FRACTION_TO = [1, 3, 3, 4, 5, 6, 7] as const
const FRACTION_FACTOR = [12, 30.4375, 7, 24, 60, 60, 1000] as const

/** Balance a fractional field down into smaller units (1.5 h is 1 h 30 min), so every field but the last is whole. */
function balanceFractions(f: number[]): void {
  for (let i = 0; i < 7; i++) {
    const v = f[i] as number
    const whole = Math.floor(v)
    if (whole === v) continue
    f[i] = whole
    f[FRACTION_TO[i] as number] = (f[FRACTION_TO[i] as number] as number) + (v - whole) * (FRACTION_FACTOR[i] as number)
  }
}

/** Round the fields to the unit at `s` (half up), then carry upward (59 min 59.6 s with smallest minute is 1 hr). */
function roundTo(f: number[], s: number, roundMs: number, numberInput: boolean): void {
  let rest = 0
  for (let j = s + 1; j < 8; j++) {
    rest += (f[j] as number) * (UNIT_MS[j] as number)
    f[j] = 0
  }
  let bumped = false
  if (s === 7) {
    f[7] = Math.round((f[7] as number) / roundMs) * roundMs
    bumped = (f[7] as number) >= 1000
  } else if (rest * 2 >= (UNIT_MS[s] as number)) {
    f[s] = (f[s] as number) + 1
    bumped = true
  }
  // Only a round-up carries: a field given as `{ minutes: 90 }` stays as given.
  if (!bumped) return
  for (let j = s; j >= 1; j--) {
    const limit = CARRY_LIMIT[j] as number
    const v = f[j] as number
    if (limit === 0 || v < limit) continue
    // Hours roll into days and months into years only where that unit is already part of the value.
    if ((j === 4 || j === 1) && !numberInput && f[j - 1] === 0) continue
    f[j - 1] = (f[j - 1] as number) + Math.floor(v / limit)
    f[j] = v % limit
  }
}

/** The digital text: `h:mm:ss` (minutes unpadded below one hour: `1:05`), a fraction only when milliseconds were asked for. */
function formatDigital(pack: DurationPack, f: number[], sign: -1 | 1, showMs: boolean): string | undefined {
  // weeks and days fold into hours; months and years have no fixed length.
  if (f[0] !== 0 || f[1] !== 0) return undefined
  const hours = (f[2] as number) * 168 + (f[3] as number) * 24 + (f[4] as number)
  const pad = (pack.digits ??= numberFormat(pack.locale, { minimumIntegerDigits: 2, useGrouping: false }))
  const plain = unitlessInt(pack)
  const minutes = f[5] as number
  let out = hours > 0 ? `${plain.format(hours)}:${pad.format(minutes)}` : plain.format(minutes)
  out += `:${pad.format(f[6] as number)}`
  if (showMs) {
    const digits = pack.fractionalDigits
    let frac = String(f[7]).padStart(3, '0')
    if (digits === undefined) frac = frac.replace(/0+$/, '')
    else frac = frac.slice(0, digits).padEnd(digits, '0')
    if (frac !== '') out += `.${frac}`
  }

  return `${sign === -1 ? '-' : ''}${out}`
}

function unitlessInt(pack: DurationPack): Intl.NumberFormat {
  return (pack.units[0] ??= numberFormat(pack.locale, { useGrouping: false }))
}

/** Test hook. */
export function _clearDurationTable(): void {
  clearTable(durationTable)
}

/** The fields of a non-nullish input and its sign, or `undefined` (with a dev warning). */
function durationFields(value: Duration | number, f: number[]): -1 | 1 | undefined {
  const sign = fieldsOf(value, f)
  if (sign === undefined && process.env.NODE_ENV !== 'production') {
    warnInvalid('formatDuration', value, 'a Duration object (finite numbers sharing one sign) or a finite number of milliseconds')
  }

  return sign
}

/**
 * Format the fields. Fractions balance down, then the value is rounded to the finest unit shown (default: seconds,
 * and milliseconds only when the whole duration is under one second) with carries, then the `largest` units are kept.
 */
function durationRender(pack: DurationPack, f: number[], sign: -1 | 1, value: Duration | number, fb: string): string {
  balanceFractions(f)
  let total = 0
  for (let i = 0; i < 8; i++) total += (f[i] as number) * (UNIT_MS[i] as number)
  const digital = pack.style === 'digital'
  const wantsMs = pack.smallest === 7 || (digital && pack.fractionalDigits !== undefined && pack.smallest === undefined)
  const s = pack.smallest ?? (wantsMs || (!digital && total > 0 && total < 1000) ? 7 : 6)
  const digits = pack.fractionalDigits
  roundTo(f, s, s === 7 && digital && digits !== undefined && digits < 3 ? 10 ** (3 - digits) : 1, typeof value === 'number')
  if (!f.every(Number.isFinite)) {
    if (process.env.NODE_ENV !== 'production') warnInvalid('formatDuration', value, 'a duration small enough to represent in milliseconds')

    return fb
  }
  if (digital) {
    const text = formatDigital(pack, f, sign, s === 7)
    if (text === undefined) {
      if (process.env.NODE_ENV !== 'production') warnInvalid('formatDuration', value, "a duration without years or months for style 'digital' (they have no fixed length)")

      return fb
    }

    return text
  }
  const first = truncateTo(f, pack.largest)
  if (first === -1) return unitFormat(pack, s).format(0)

  return formatUnits(pack, f, sign, first)
}

export function durationIn(locale: string, value: DurationInput, options: DurationOptions | DurationStyle | undefined): string {
  if (value == null) return fallbackOf(options)
  const f: number[] = [0, 0, 0, 0, 0, 0, 0, 0]
  const sign = durationFields(value, f)
  if (sign === undefined) return fallbackOf(options)

  return durationRender(resolve(durationTable, locale, '', options), f, sign, value, fallbackOf(options))
}

/** Spec of `durationFormatter`: an options object, or a style name. */
export function durationSpec(options: DurationOptions | DurationStyle | undefined): DurationOptions {
  if (typeof options === 'string') return { style: options }

  return options ?? {}
}

export const durationKind: KindDef<'duration'> = {
  create(spec, locale) {
    const fb = fallbackText(spec.fallback)
    let at = ''
    let pack: DurationPack | undefined

    return {
      call: (value) => {
        const l = locale()
        if (value == null) return fb
        const f: number[] = [0, 0, 0, 0, 0, 0, 0, 0]
        const sign = durationFields(value, f)
        if (sign === undefined) return fb
        if (pack === undefined || l !== at) {
          pack = resolve(durationTable, l, '', spec)
          at = l
        }

        return durationRender(pack, f, sign, value, fb)
      },
    }
  },
}

/** Zero every field after the `largest` most significant non-zero ones; the index of the first non-zero field, or `-1`. */
function truncateTo(f: number[], largest: number): number {
  let shown = 0
  let first = -1
  for (let i = 0; i < 8; i++) {
    if (f[i] === 0) continue
    if (shown >= largest) {
      f[i] = 0
      continue
    }
    if (first === -1) first = i
    shown++
  }

  return first
}

/** The unit-style text: `Intl.DurationFormat` when present, else unit numbers joined by an `Intl.ListFormat`. */
function formatUnits(pack: DurationPack, f: number[], sign: -1 | 1, first: number): string {
  if (pack.native !== undefined) {
    const d: Record<string, number> = {}
    for (let i = 0; i < 8; i++) if (f[i] !== 0) d[UNITS[i] as string] = sign * (f[i] as number)

    try {
      return pack.native.format(d)
    } catch {
      // Intl.DurationFormat refuses fields beyond its range (2^32 units): the NumberFormat path below has no such limit.
    }
  }
  const parts: string[] = []
  for (let i = 0; i < 8; i++) {
    if (f[i] === 0) continue
    parts.push(unitFormat(pack, i).format(i === first ? sign * (f[i] as number) : (f[i] as number)))
  }
  pack.list ??= construct(
    (l, o) => new Intl.ListFormat(l, o),
    pack.locale,
    { type: 'unit', style: pack.style },
    badOptions,
    badLocale('formatDuration'),
  )

  return pack.list.format(parts)
}
