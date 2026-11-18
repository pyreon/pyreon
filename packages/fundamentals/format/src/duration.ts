/**
 * `formatDuration`: `Intl.DurationFormat` when the runtime has it, a correct
 * fallback built from `Intl.NumberFormat` (unit style) + `Intl.ListFormat`
 * (unit type) otherwise. The fallback produces the same text as
 * `Intl.DurationFormat` for the `long` / `short` / `narrow` / `digital` styles
 * in the locales the tests compare.
 */
import { clearTable, construct, createTable, resolve } from './cache'
import { badLocale, fallbackOf } from './number'
import { programmerError, warnInvalid } from './warn'
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
    `${error instanceof Error ? error.message : String(error)}. Check the options: style is 'long' | 'short' | 'narrow' | 'digital', largest is a positive integer.`,
  )
}

const durationTable = /* @__PURE__ */ createTable<DurationPack>((locale, _variant, options) => {
  const o: DurationOptions =
    options === undefined ? {} : typeof options === 'string' ? { style: options as DurationStyle } : options
  const style = o.style ?? 'short'
  if (!(STYLES as readonly string[]).includes(style)) {
    throw programmerError('formatDuration', `unknown style ${JSON.stringify(style)}. Use 'long', 'short', 'narrow' or 'digital'.`)
  }
  if (o.largest !== undefined && !(Number.isInteger(o.largest) && o.largest >= 1)) {
    throw programmerError('formatDuration', `largest must be a positive integer (the number of units to show), got ${String(o.largest)}.`)
  }
  const Ctor = nativeCtor()
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
    native,
    units: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
    list: undefined,
    digits: undefined,
  }
})

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
    let ms = Math.round(Math.abs(value))
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

function formatDigital(pack: DurationPack, f: number[], sign: -1 | 1): string | undefined {
  // weeks/days fold into hours; months and years have no fixed length.
  if (f[0]! !== 0 || f[1]! !== 0) return undefined
  const hours = f[2]! * 168 + f[3]! * 24 + f[4]!
  const ms = f[7]!
  const sc = sign === -1 ? -1 : 1
  if (pack.native !== undefined) {
    const d: Duration = {
      hours: hours * sc,
      minutes: f[5]! * sc,
      seconds: f[6]! * sc,
      milliseconds: ms * sc,
    }

    return pack.native.format(d)
  }
  const digits = (pack.digits ??= numberFormat(pack.locale, { minimumIntegerDigits: 2, useGrouping: false }))
  const plain = unitlessInt(pack)
  let out = `${sign === -1 ? '-' : ''}${plain.format(hours)}:${digits.format(f[5]!)}:${digits.format(f[6]!)}`
  if (ms !== 0 || pack.fractionalDigits !== undefined) {
    let frac = String(ms).padStart(3, '0')
    if (pack.fractionalDigits === undefined) frac = frac.replace(/0+$/, '')
    else frac = frac.slice(0, pack.fractionalDigits).padEnd(pack.fractionalDigits, '0')
    if (frac !== '') out += `.${frac}`
  }

  return out
}

function unitlessInt(pack: DurationPack): Intl.NumberFormat {
  return (pack.units[0] ??= numberFormat(pack.locale, { useGrouping: false }))
}

/** Test hook. */
export function _clearDurationTable(): void {
  clearTable(durationTable)
}

export function durationIn(locale: string, value: DurationInput, options: DurationOptions | DurationStyle | undefined): string {
  if (value == null) return fallbackOf(options)
  const f: number[] = [0, 0, 0, 0, 0, 0, 0, 0]
  const sign = fieldsOf(value, f)
  if (sign === undefined) {
    if (process.env.NODE_ENV !== 'production') warnInvalid('formatDuration', value, 'a Duration object (finite numbers sharing one sign) or a finite number of milliseconds')
    return fallbackOf(options)
  }
  const pack = resolve(durationTable, locale, '', options)
  if (pack.style === 'digital') {
    const text = formatDigital(pack, f, sign)
    if (text === undefined) {
      if (process.env.NODE_ENV !== 'production') warnInvalid('formatDuration', value, "a duration without years or months for style 'digital' (they have no fixed length)")
      return fallbackOf(options)
    }

    return text
  }
  const first = truncateTo(f, pack.largest)
  if (first === -1) return unitFormat(pack, 6).format(0)

  return formatUnits(pack, f, sign, first)
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

    return pack.native.format(d)
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
