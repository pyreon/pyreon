/**
 * Unit conversion for the units `Intl` can format. Pure: no `@pyreon/*` import, nothing built at import, and nothing in
 * `@pyreon/format/core` imports this file, so an app that never converts pays nothing.
 *
 * Every factor is an EXACT rational (a pair of integers), and a conversion multiplies the value by ONE combined, reduced
 * rational, so the result is as accurate as a multiply and a divide allow (for a small integer value, a single correctly
 * rounded division: `convert(5, 'mile', 'kilometer')` is exactly the double nearest 8.04672). Nothing chains through an
 * intermediate unit in floating point.
 *
 * Definitions (each unit's comment names its source):
 *  - SI and the CLDR/ECMA-402 unit identifiers: NIST SP 811 (2008), Appendices B.8 and B.9.
 *  - The international yard and pound (1 yd = 0.9144 m, 1 lb = 0.45359237 kg), agreed 1959: NIST SP 811 B.6.
 *  - `gallon` and `fluid-ounce` are the US liquid units (231 cubic inches; 1/128 gallon): ECMA-402 sanctions only those two
 *    spellings, and CLDR formats them as the US units (the imperial ones are `gallon-imperial` and `fluid-ounce-imperial`,
 *    which ECMA-402 does not sanction, so they are not convertible here).
 *  - Digital units are the decimal ones CLDR and `Intl` use: kilobyte = 1000 bytes, not 1024 (that is the kibibyte).
 */
import { describe, programmerError, quote } from './warn'
import type { MeasurementSystem, Unit } from './types'

type Dimension = 'length' | 'mass' | 'volume' | 'area' | 'duration' | 'digital' | 'temperature' | 'angle' | 'proportion'

/** The public name of a dimension: a simple one, a named compound (`speed`), or `<a>-per-<b>`. */
export type UnitDimension =
  | Dimension
  | 'speed'
  | 'pace'
  | 'fuel-economy'
  | 'fuel-consumption'
  | 'density'
  | 'flow-rate'
  | 'mass-flow'
  | 'data-rate'
  | `${string}-per-${string}`

/** A factor to the dimension's base unit (metre, kilogram, second, cubic metre, square metre, bit), as an exact rational. */
interface Def {
  dim: Dimension
  num: bigint
  den: bigint
}

const d = (dim: Dimension, num: bigint, den: bigint = 1n): Def => ({ dim, num, den })

/** `undefined` until first use: a table built at import would sit in every bundle that reaches this module. */
let defs: Record<string, Def> | undefined

function table(): Record<string, Def> {
  return (defs ??= Object.assign(Object.create(null) as Record<string, Def>, {
    // length, metre. inch: 0.0254 m exactly (1959). foot = 12 in, yard = 3 ft, mile = 1760 yd = 1609.344 m (NIST SP 811 B.6).
    millimeter: d('length', 1n, 1000n),
    centimeter: d('length', 1n, 100n),
    meter: d('length', 1n),
    kilometer: d('length', 1000n),
    inch: d('length', 254n, 10000n),
    foot: d('length', 3048n, 10000n),
    yard: d('length', 9144n, 10000n),
    mile: d('length', 1609344n, 1000n),
    // The Scandinavian mile (mil) is 10 km (CLDR unit `mile-scandinavian`).
    'mile-scandinavian': d('length', 10000n),
    // mass, kilogram. pound = 0.45359237 kg exactly; ounce = 1/16 lb; stone = 14 lb (avoirdupois, NIST SP 811 B.6).
    gram: d('mass', 1n, 1000n),
    kilogram: d('mass', 1n),
    ounce: d('mass', 45359237n, 1600000000n),
    pound: d('mass', 45359237n, 100000000n),
    stone: d('mass', 635029318n, 100000000n),
    // volume, cubic metre. litre = 1 dm3 exactly. US gallon = 231 in3 = 231 * 0.0254^3 m3 = 0.003785411784 m3 exactly; the US
    // fluid ounce is 1/128 gallon (NIST SP 811 B.8: 3.785 411 784 E-03 m3).
    liter: d('volume', 1n, 1000n),
    milliliter: d('volume', 1n, 1000000n),
    gallon: d('volume', 3785411784n, 1000000000000n),
    'fluid-ounce': d('volume', 3785411784n, 128000000000000n),
    // area, square metre. hectare = 10,000 m2. The (international) acre is 43,560 ft2 = 4046.8564224 m2 exactly (NIST SP 811 B.8);
    // the US survey acre differs by about 2 parts per million and is not modelled.
    hectare: d('area', 10000n),
    acre: d('area', 40468564224n, 10000000n),
    // duration, second. `month` and `year` have no fixed length and are deliberately absent (see `parse`).
    nanosecond: d('duration', 1n, 1000000000n),
    microsecond: d('duration', 1n, 1000000n),
    millisecond: d('duration', 1n, 1000n),
    second: d('duration', 1n),
    minute: d('duration', 60n),
    hour: d('duration', 3600n),
    day: d('duration', 86400n),
    week: d('duration', 604800n),
    // digital, bit. Decimal prefixes, as CLDR and Intl: kilobyte = 1000 bytes = 8000 bits.
    bit: d('digital', 1n),
    byte: d('digital', 8n),
    kilobit: d('digital', 1000n),
    kilobyte: d('digital', 8000n),
    megabit: d('digital', 1000000n),
    megabyte: d('digital', 8000000n),
    gigabit: d('digital', 1000000000n),
    gigabyte: d('digital', 8000000000n),
    terabit: d('digital', 1000000000000n),
    terabyte: d('digital', 8000000000000n),
    petabyte: d('digital', 8000000000000000n),
    // Temperature is affine (an offset as well as a scale): handled in `convert`, never through a factor.
    celsius: d('temperature', 1n),
    fahrenheit: d('temperature', 1n),
    // `degree` is the only angle unit ECMA-402 sanctions, `percent` the only proportion: each converts only to itself.
    degree: d('angle', 1n),
    percent: d('proportion', 1n),
  }))
}

interface Parsed {
  top: Def
  bottom: Def | undefined
}

function lookup(fn: string, name: string, whole: string): Def {
  const found = table()[name]

  if (found !== undefined) return found
  if (name === 'month' || name === 'year') {
    throw programmerError(fn, `${quote(whole)}: a ${name} has no fixed length (months differ, and so do years), so it cannot be converted. Use { months } or { years } with @pyreon/time for calendar arithmetic.`)
  }
  const kelvin = name === 'kelvin' ? ' Kelvin is not an Intl unit (ECMA-402 sanctions only celsius and fahrenheit).' : ''

  throw programmerError(fn, `unknown unit ${quote(whole)}.${kelvin} Use a unit Intl can format (Intl.supportedValuesOf('unit')) or two of them joined by "-per-", such as "kilometer-per-hour".`)
}

function parse(fn: string, unit: unknown): Parsed {
  if (typeof unit !== 'string' || unit === '') {
    throw programmerError(fn, `the unit must be a string such as "mile" or "kilometer-per-hour", got ${describe(unit)}.`)
  }
  const at = unit.indexOf('-per-')

  if (at < 0) return { top: lookup(fn, unit, unit), bottom: undefined }
  const top = lookup(fn, unit.slice(0, at), unit)
  const bottom = lookup(fn, unit.slice(at + 5), unit)

  if (top.dim === 'temperature' || bottom.dim === 'temperature') {
    throw programmerError(fn, `${quote(unit)}: a temperature inside a compound unit is not a ratio and cannot be converted.`)
  }

  return { top, bottom }
}

const NAMED: Record<string, UnitDimension> = {
  'length/duration': 'speed',
  'duration/length': 'pace',
  'length/volume': 'fuel-economy',
  'volume/length': 'fuel-consumption',
  'mass/volume': 'density',
  'volume/duration': 'flow-rate',
  'mass/duration': 'mass-flow',
  'digital/duration': 'data-rate',
}

function nameOf(p: Parsed): UnitDimension {
  if (p.bottom === undefined) return p.top.dim

  return NAMED[`${p.top.dim}/${p.bottom.dim}`] ?? `${p.top.dim}-per-${p.bottom.dim}`
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b

  while (y !== 0n) [x, y] = [y, x % y]

  return x
}

/** The exact rational factor of a unit to its base: a simple unit's, or the numerator's over the denominator's. */
function factor(p: Parsed): [bigint, bigint] {
  return p.bottom === undefined ? [p.top.num, p.top.den] : [p.top.num * p.bottom.den, p.top.den * p.bottom.num]
}

function reduced(num: bigint, den: bigint): [bigint, bigint] {
  const g = gcd(num, den)

  return [num / g, den / g]
}

/** How two parsed units relate: the same dimension, the inverse one (litres per kilometre and miles per gallon), or neither. */
function relation(a: Parsed, b: Parsed): 'same' | 'inverse' | undefined {
  if (a.top.dim === b.top.dim && a.bottom?.dim === b.bottom?.dim) return 'same'
  if (a.bottom !== undefined && b.bottom !== undefined && a.top.dim === b.bottom.dim && a.bottom.dim === b.top.dim) return 'inverse'

  return undefined
}

/**
 * Convert a number between two units of the same dimension. Compound units (`-per-`) convert when their parts do:
 * `convert(72, 'kilometer-per-hour', 'mile-per-hour')`. A compound and its inverse (fuel consumption `liter-per-kilometer` and
 * fuel economy `mile-per-gallon`, a pace `minute-per-kilometer` and a speed `kilometer-per-hour`) are reciprocals, not ratios,
 * so the value is inverted: `convert(8, 'liter-per-kilometer', 'mile-per-gallon')`. A zero in an inversion is `Infinity`.
 * A mismatch throws a `[Pyreon]` error naming both dimensions. `month` and `year` have no fixed length and throw.
 *
 * The factor is exact and applied once, so the result is as accurate as one multiply and one divide allow.
 *
 * @example
 * ```ts
 * convert(5, 'mile', 'kilometer') // 8.04672
 * convert(100, 'celsius', 'fahrenheit') // 212
 * convert(1, 'gallon', 'liter') // 3.785411784
 * convert(72, 'kilometer-per-hour', 'mile-per-hour') // 44.73872584108805
 * ```
 */
export function convert(value: number, from: Unit, to: Unit): number {
  if (typeof value !== 'number') throw programmerError('convert', `the value must be a number, got ${describe(value)}.`)
  const a = parse('convert', from)
  const b = parse('convert', to)
  const how = relation(a, b)

  if (how === undefined) {
    throw programmerError('convert', `cannot convert ${nameOf(a)} (${from}) to ${nameOf(b)} (${to}): they measure different things. canConvert(from, to) checks first.`)
  }
  if (from === to) return value
  if (a.top.dim === 'temperature' && a.bottom === undefined) {
    const toF = b.top === table().fahrenheit

    // celsius <-> fahrenheit: F = C * 9/5 + 32 (the Fahrenheit scale is defined from the Celsius scale).
    if (from === 'celsius' && toF) return (value * 9) / 5 + 32
    if (from === 'fahrenheit' && !toF) return ((value - 32) * 5) / 9

    return value
  }
  const [fa, fb] = [factor(a), factor(b)]

  if (how === 'same') {
    const [p, q] = reduced(fa[0] * fb[1], fa[1] * fb[0])

    return apply(value, p, q)
  }
  // inverse: result = 1 / (value * Ra * Rb)
  const [p, q] = reduced(fa[1] * fb[1], fa[0] * fb[0])

  return Number(p) / (Number(q) * value)
}

/** One multiply and one divide by exact integers: a single correctly rounded operation for an integer value and exact `p`, `q`. */
function apply(value: number, p: bigint, q: bigint): number {
  if (q === 1n) return value * Number(p)
  if (p === 1n) return value / Number(q)

  return (value * Number(p)) / Number(q)
}

/**
 * Whether `convert(x, from, to)` is defined: both are convertible units of the same (or the inverse) dimension. Never throws.
 *
 * @example
 * ```ts
 * canConvert('mile', 'kilometer') // true
 * canConvert('mile', 'kilogram') // false
 * canConvert('month', 'day') // false
 * ```
 */
export function canConvert(from: Unit, to: Unit): boolean {
  try {
    return relation(parse('canConvert', from), parse('canConvert', to)) !== undefined
  } catch {
    return false
  }
}

/**
 * What a unit measures: `length`, `mass`, `volume`, `temperature`, `area`, `duration`, `digital`, `angle`, `proportion`, or for a
 * compound `speed`, `pace`, `fuel-economy`, `fuel-consumption`, `density`, `flow-rate`, `mass-flow`, `data-rate`, else
 * `<a>-per-<b>`. `month` and `year` are `duration` for the name but are not convertible. An unknown unit throws.
 *
 * @example
 * ```ts
 * unitDimension('mile') // "length"
 * unitDimension('kilometer-per-hour') // "speed"
 * unitDimension('celsius') // "temperature"
 * ```
 */
export function unitDimension(unit: Unit): UnitDimension {
  if (unit === 'month' || unit === 'year') return 'duration'

  return nameOf(parse('unitDimension', unit))
}

/** Regions whose customary system is not metric: CLDR supplemental `measurementData` (US system: LR, MM, US; UK system: GB). */
const REGION_SYSTEM: Record<string, MeasurementSystem> = { US: 'us', LR: 'us', MM: 'us', GB: 'uk' }

const systems = new Map<string, MeasurementSystem>()
const SYSTEM_CAP = 64

/**
 * The measurement system of a locale's region: `us` (US, Liberia, Myanmar), `uk` (Great Britain: metric for most things, miles
 * and miles per hour on the road) or `metric` (everywhere else), from CLDR's `measurementData`. A locale with no region
 * (`en`, `de`) is resolved by its likely region (`en` is `en-US`, `de` is `de-DE`). `locale` defaults to the runtime's.
 *
 * @example
 * ```ts
 * measurementSystem('en-US') // "us"
 * measurementSystem('en-GB') // "uk"
 * measurementSystem('cs') // "metric"
 * ```
 */
export function measurementSystem(locale?: string): MeasurementSystem {
  const key = locale ?? ''
  const hit = systems.get(key)

  if (hit !== undefined) return hit
  let region: string | undefined

  try {
    const tag = key === '' ? new Intl.DateTimeFormat(undefined, {}).resolvedOptions().locale : key
    const parsed = new Intl.Locale(tag)

    region = parsed.region ?? parsed.maximize().region
  } catch {
    region = undefined
  }
  const system = (region === undefined ? undefined : REGION_SYSTEM[region]) ?? 'metric'

  if (systems.size >= SYSTEM_CAP) systems.delete(systems.keys().next().value as string)
  systems.set(key, system)

  return system
}

/** What a unit becomes in each system: the same scale of thing a person in that system reads. A unit not listed stays as it is. */
const TO_US: Record<string, string> = {
  millimeter: 'inch',
  centimeter: 'inch',
  meter: 'foot',
  kilometer: 'mile',
  'mile-scandinavian': 'mile',
  gram: 'ounce',
  kilogram: 'pound',
  milliliter: 'fluid-ounce',
  liter: 'gallon',
  celsius: 'fahrenheit',
  hectare: 'acre',
  'kilometer-per-hour': 'mile-per-hour',
  'meter-per-second': 'mile-per-hour',
}

const TO_METRIC: Record<string, string> = {
  inch: 'centimeter',
  foot: 'meter',
  yard: 'meter',
  mile: 'kilometer',
  'mile-scandinavian': 'kilometer',
  ounce: 'gram',
  pound: 'kilogram',
  stone: 'kilogram',
  'fluid-ounce': 'milliliter',
  gallon: 'liter',
  fahrenheit: 'celsius',
  acre: 'hectare',
  'mile-per-hour': 'kilometer-per-hour',
}

/** Great Britain, simplified from CLDR `unitPreferenceData`: metric, except that road distances and speeds are miles. */
const TO_UK: Record<string, string> = { ...TO_METRIC, mile: 'mile', kilometer: 'mile', 'mile-scandinavian': 'mile', 'kilometer-per-hour': 'mile-per-hour', 'meter-per-second': 'mile-per-hour', 'mile-per-hour': 'mile-per-hour' }

/** The unit a person in `system` reads for `unit` (`kilometer` is `mile` in `us`, `fahrenheit` is `celsius` in `metric`). */
export function systemUnit(unit: Unit, system: MeasurementSystem): Unit {
  const map = system === 'us' ? TO_US : system === 'uk' ? TO_UK : TO_METRIC

  return (Object.hasOwn(map, unit) ? map[unit] : unit) as Unit
}

/**
 * The unit a person in the locale's region reads for `unit`: `kilometer` becomes `mile` and `celsius` becomes `fahrenheit` in
 * `en-US`; `mile` becomes `kilometer` and `fahrenheit` becomes `celsius` in `cs`; in `en-GB` distances and speeds stay miles and
 * the rest is metric. A unit with no counterpart (`second`, `byte`) comes back unchanged. The table is deliberately small and
 * simplified from CLDR's unit preferences: it maps a unit to the same scale in the other system, not to a use-case rule
 * (a person's height in feet and inches, a road in miles, a fabric in metres).
 *
 * @example
 * ```ts
 * preferredUnit('kilometer', 'en-US') // "mile"
 * preferredUnit('celsius', 'en-US') // "fahrenheit"
 * preferredUnit('mile', 'cs') // "kilometer"
 * ```
 */
export function preferredUnit(unit: Unit, locale?: string): Unit {
  return systemUnit(unit, measurementSystem(locale))
}
