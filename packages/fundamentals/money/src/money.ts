import { type CurrencyCode, digitsOf } from './currency'
import { badRange, badValue } from './errors'
import { checkMode, divRound, formatScaled, MAX_DIGITS, pow10, readDecimal, type RoundingMode, type Scaled, toScaled, wholeIn } from './scaled'

/** Exact money as plain data: a canonical decimal string with exactly the currency's minor digits, and its currency code. */
export interface Money {
  readonly amount: string
  readonly currency: CurrencyCode
}

const MONEY_HINT = 'a Money such as { amount: "9.99", currency: "EUR" }'

// ─── reading and writing minor units ──────────────────────────────────────────────────────────────────────────────────────
// A Money amount is minor units written with a decimal point. Reading it is one char-code loop that also validates it; an
// amount of 15 digits or fewer becomes a `number` (so add, subtract and compare allocate nothing), longer ones a `bigint`.

/** The digits of a Money's currency, after checking it is shaped like one. */
function digitsOfMoney(fn: string, m: unknown): number {
  if (typeof m !== 'object' || m === null || typeof (m as Money).amount !== 'string' || typeof (m as Money).currency !== 'string') {
    return badValue(fn, MONEY_HINT, m, 'Check data with isMoney() before using it.')
  }

  return digitsOf(fn, (m as Money).currency)
}

function notCanonical(fn: string, m: Money, digits: number): never {
  return badValue(fn, `an amount written with exactly ${digits} fraction digit${digits === 1 ? '' : 's'} for ${m.currency}`, m.amount, 'Build a Money with money(), fromMinor() or zero(), and check data with isMoney().')
}

/** The minor units of an amount: a `number` when it has at most 15 digits, else a `bigint`. Validates the canonical shape. */
/** The cheap checks of a canonical amount: length, a dot where the digits say, an integer part without a leading zero. */
function shapeOk(text: string, start: number, dot: number, digits: number): boolean {
  const intEnd = digits > 0 ? dot : text.length

  if (text.length > MAX_DIGITS + 2 || intEnd - start < 1) return false
  if (digits > 0 && text.charCodeAt(dot) !== 46) return false

  return intEnd - start === 1 || text.charCodeAt(start) !== 48
}

function readMinor(fn: string, m: Money, digits: number): number | bigint {
  const text = m.amount
  const len = text.length
  const neg = len > 0 && text.charCodeAt(0) === 45
  const start = neg ? 1 : 0
  const dot = digits > 0 ? len - digits - 1 : -1

  if (!shapeOk(text, start, dot, digits)) return notCanonical(fn, m, digits)
  let n = 0
  let nonzero = false

  for (let i = start; i < len; i++) {
    if (i === dot) continue
    const d = text.charCodeAt(i) - 48

    if (d >>> 0 > 9) return notCanonical(fn, m, digits)
    n = n * 10 + d
    if (d !== 0) nonzero = true
  }
  if (neg && !nonzero) return notCanonical(fn, m, digits)
  if (len - start - (digits > 0 ? 1 : 0) <= 15) return neg ? -n : n
  const big = BigInt(digits > 0 ? text.slice(start, dot) + text.slice(dot + 1) : text.slice(start))

  return neg ? -big : big
}

/** An amount's minor units as a bigint, for the paths that need one. */
function minorBig(fn: string, m: Money, digits: number): bigint {
  const v = readMinor(fn, m, digits)

  return typeof v === 'bigint' ? v : BigInt(v)
}

function writeMinor(minor: number | bigint, digits: number): string {
  const neg = minor < 0
  let text = String(neg ? -minor : minor)

  if (digits > 0) {
    if (text.length <= digits) text = '0'.repeat(digits - text.length + 1) + text
    text = `${text.slice(0, text.length - digits)}.${text.slice(text.length - digits)}`
  }

  return neg ? `-${text}` : text
}

function make(minor: number | bigint, currency: CurrencyCode, digits: number): Money {
  return { amount: writeMinor(minor, digits), currency }
}

function mixed(fn: string, a: Money, b: Money): never {
  return badRange(fn, `cannot combine ${a.currency} with ${b.currency}: a Money has one currency. Convert one side first with convert(money, "${a.currency}", rate).`)
}

/** Check both are Money of one currency and return its digits. */
function pair(fn: string, a: Money, b: Money): number {
  const digits = digitsOfMoney(fn, a)

  digitsOfMoney(fn, b)
  if (a.currency !== b.currency) return mixed(fn, a, b)

  return digits
}

// ─── construct and convert ────────────────────────────────────────────────────────────────────────────────────────────────

/** Options of `money`, `multiply`, `divide`, `percentage`, `convert`. */
export interface RoundingOptions {
  /** How an inexact result is rounded to the currency's digits. Default `'halfExpand'` (round half away from zero). */
  rounding?: RoundingMode
}

/** Options of `money`: without `rounding`, a value with more decimals than the currency has throws. */
export interface MoneyOptions {
  /** Round an amount with too many decimals instead of throwing. */
  rounding?: RoundingMode
}

/** What `toMinorScaled` needs to know about the call: the currency, the explicit rounding, and the value as it was given. */
interface MinorContext {
  currency: string
  digits: number
  mode: RoundingMode | undefined
  original: unknown
}

function toMinorScaled(fn: string, value: Scaled, ctx: MinorContext): bigint {
  const { currency, digits, mode, original } = ctx

  if (value.s <= digits) return value.n * pow10(digits - value.s)
  const unit = pow10(value.s - digits)

  if (value.n % unit === 0n) return value.n / unit
  if (mode !== undefined) return divRound(value.n, unit, mode)
  const why = typeof original === 'number'
    ? `${String(original)} has more decimals than ${currency} has (${digits}): that is floating-point noise (0.1 + 0.2 is 0.30000000000000004 in binary floating point), not an amount.`
    : `${JSON.stringify(original)} has more decimals than ${currency} has (${digits}), so it would lose value.`

  return badRange(fn, `${why} Round it deliberately: money(x, "${currency}", { rounding: "halfExpand" }). Better, keep amounts as decimal strings or minor units.`)
}

/**
 * Build a Money. A string is exact; a number is read by its shortest round-trip text (`9.99` is exactly 9.99, not the binary
 * float near it); a bigint is whole units. A value with more decimals than the currency has throws unless `rounding` is given
 * (so `money(0.1 + 0.2, 'EUR')` throws and explains floating point, instead of hiding the bug). The amount of the result has
 * exactly the currency's digits: `"9.90"`, `"100"` for JPY, `"0.123"` for KWD.
 *
 * @example money(9.99, 'EUR') // => { amount: '9.99', currency: 'EUR' }
 * @example money('10', 'EUR') // => { amount: '10.00', currency: 'EUR' }
 * @example money(100, 'JPY') // => { amount: '100', currency: 'JPY' }
 * @example money(0.1 + 0.2, 'EUR', { rounding: 'halfExpand' }) // => { amount: '0.30', currency: 'EUR' }
 */
export function money(amount: number | string | bigint, currency: CurrencyCode, options?: MoneyOptions): Money {
  const digits = digitsOf('money', currency)
  const mode = options?.rounding === undefined ? undefined : checkMode('money', options.rounding)
  const value = toScaled('money', 'amount', amount)

  return { amount: formatScaled(toMinorScaled('money', value, { currency, digits, mode, original: amount }), digits), currency }
}

/**
 * A Money from minor units (cents): `fromMinor(999, 'EUR')` is 9.99. A number must be a safe integer; use a bigint or a
 * digit string above 2^53.
 *
 * @example fromMinor(999, 'EUR') // => { amount: '9.99', currency: 'EUR' }
 * @example fromMinor('123456789012345678901', 'EUR') // => { amount: '1234567890123456789.01', currency: 'EUR' }
 */
export function fromMinor(units: number | bigint | string, currency: CurrencyCode): Money {
  const digits = digitsOf('fromMinor', currency)
  let n: bigint

  if (typeof units === 'bigint') n = units
  else if (typeof units === 'number') {
    if (!Number.isSafeInteger(units)) return badValue('fromMinor', 'a safe integer number of minor units', units, 'Above 2^53 a number is not exact: pass a bigint or a string of digits.')
    n = BigInt(units)
  } else {
    const parsed = typeof units === 'string' ? readDecimal('fromMinor', units, true) : null

    if (parsed === null || parsed.s !== 0) return badValue('fromMinor', 'minor units as a whole number', units)
    n = parsed.n
  }

  return { amount: formatScaled(n, digits), currency }
}

/**
 * The amount in minor units as a bigint: `toMinor(money('9.99', 'EUR'))` is `999n`.
 *
 * @example toMinor(money('9.99', 'EUR')) // => 999n
 */
export function toMinor(m: Money): bigint {
  return minorBig('toMinor', m, digitsOfMoney('toMinor', m))
}

/**
 * The amount in minor units as a number; throws beyond the safe integer range, where a number would not be exact.
 *
 * @example toMinorNumber(money('9.99', 'EUR')) // => 999
 */
export function toMinorNumber(m: Money): number {
  const v = readMinor('toMinorNumber', m, digitsOfMoney('toMinorNumber', m))

  if (typeof v === 'number') return v

  return v >= -9007199254740991n && v <= 9007199254740991n ? Number(v) : badRange('toMinorNumber', `${m.amount} ${m.currency} is ${v} minor units, beyond the safe integer range of a number. Use toMinor(), which returns a bigint.`)
}

/**
 * Whether `x` is a Money: exactly the fields `amount` and `currency`, a known currency, and a canonical amount with exactly
 * that currency's digits. Never throws.
 *
 * @example isMoney({ amount: '9.99', currency: 'EUR' }) // => true
 * @example isMoney({ amount: '9.9', currency: 'EUR' }) // => false
 * @example isMoney({ amount: 9.99, currency: 'EUR' }) // => false
 */
export function isMoney(x: unknown): x is Money {
  try {
    if (typeof x !== 'object' || x === null || Object.keys(x).length !== 2) return false
    const m = x as Money

    if (typeof m.amount !== 'string' || typeof m.currency !== 'string') return false
    readMinor('isMoney', m, digitsOf('isMoney', m.currency))

    return true
  } catch {
    return false
  }
}

/**
 * Zero in a currency.
 *
 * @example zero('EUR') // => { amount: '0.00', currency: 'EUR' }
 */
export function zero(currency: CurrencyCode): Money {
  return { amount: writeMinor(0, digitsOf('zero', currency)), currency }
}

// ─── arithmetic ───────────────────────────────────────────────────────────────────────────────────────────────────────────

function combine(fn: string, a: Money, b: Money, sign: 1 | -1): Money {
  const digits = pair(fn, a, b)
  const x = readMinor(fn, a, digits)
  const y = readMinor(fn, b, digits)

  if (typeof x === 'number' && typeof y === 'number') {
    const r = sign === 1 ? x + y : x - y

    if (Number.isSafeInteger(r)) return make(r, a.currency, digits)
  }
  const bx = typeof x === 'bigint' ? x : BigInt(x)
  const by = typeof y === 'bigint' ? y : BigInt(y)

  return make(sign === 1 ? bx + by : bx - by, a.currency, digits)
}

/**
 * Exact sum of two amounts of one currency. Mixing currencies throws and names both.
 *
 * @example add(money('0.10', 'EUR'), money('0.20', 'EUR')) // => { amount: '0.30', currency: 'EUR' }
 */
export function add(a: Money, b: Money): Money {
  return combine('add', a, b, 1)
}

/**
 * Exact difference `a - b` of two amounts of one currency.
 *
 * @example subtract(money('1.00', 'EUR'), money('0.01', 'EUR')) // => { amount: '0.99', currency: 'EUR' }
 */
export function subtract(a: Money, b: Money): Money {
  return combine('subtract', a, b, -1)
}

/**
 * The same amount with the opposite sign.
 *
 * @example negate(money('5', 'EUR')) // => { amount: '-5.00', currency: 'EUR' }
 */
export function negate(m: Money): Money {
  const digits = digitsOfMoney('negate', m)
  const v = readMinor('negate', m, digits)

  return make(typeof v === 'number' ? -v + 0 : -v, m.currency, digits)
}

/**
 * The amount without its sign.
 *
 * @example abs(money('-5', 'EUR')) // => { amount: '5.00', currency: 'EUR' }
 */
export function abs(m: Money): Money {
  const digits = digitsOfMoney('abs', m)
  const v = readMinor('abs', m, digits)

  return make(v < 0 ? -v : v, m.currency, digits)
}

/**
 * The sum of a list of one currency. An empty list needs `currency`.
 *
 * @example sum([money('1.10', 'EUR'), money('2.20', 'EUR')]) // => { amount: '3.30', currency: 'EUR' }
 * @example sum([], 'EUR') // => { amount: '0.00', currency: 'EUR' }
 */
export function sum(list: Iterable<Money>, currency?: CurrencyCode): Money {
  if (list === null || list === undefined || typeof (list as Iterable<Money>)[Symbol.iterator] !== 'function') return badValue('sum', 'a list of Money', list)
  let code = currency
  let digits = code === undefined ? -1 : digitsOf('sum', code)
  let total = 0n

  for (const m of list) {
    if (code === undefined) {
      digits = digitsOfMoney('sum', m)
      code = m.currency
    } else if (digitsOfMoney('sum', m) !== digits || m.currency !== code) {
      return badRange('sum', `cannot sum ${code} with ${(m as Money).currency}: a list of Money must be one currency. Convert first with convert().`)
    }
    total += minorBig('sum', m, digits)
  }

  return code === undefined ? badRange('sum', 'an empty list has no currency. Pass it: sum([], "EUR").') : make(total, code, digits)
}

function rounding(fn: string, options: RoundingOptions | undefined): RoundingMode {
  return options?.rounding === undefined ? 'halfExpand' : checkMode(fn, options.rounding)
}

/**
 * The amount times a plain number, rounded to the currency's digits (default `'halfExpand'`). The factor is a pure number: a
 * number is read by its shortest text, so `1.21` is exactly 1.21; prefer a string. For a Money times a Money there is no
 * operation, because it has no meaning.
 *
 * @example multiply(money('19.99', 'EUR'), 3) // => { amount: '59.97', currency: 'EUR' }
 * @example multiply(money('10.00', 'EUR'), '1.21') // => { amount: '12.10', currency: 'EUR' }
 * @example multiply(money('0.05', 'EUR'), '0.5') // => { amount: '0.03', currency: 'EUR' }
 */
export function multiply(m: Money, factor: number | string | bigint, options?: RoundingOptions): Money {
  const digits = digitsOfMoney('multiply', m)
  const f = toScaled('multiply', 'factor', factor)
  const mode = rounding('multiply', options)

  return make(divRound(minorBig('multiply', m, digits) * f.n, pow10(f.s), mode), m.currency, digits)
}

/**
 * The amount divided by a plain number, rounded to the currency's digits. A zero divisor throws. To split an amount without
 * losing a cent use `allocate` or `split`: dividing three ways and multiplying back does not give the amount.
 *
 * @example divide(money('10.00', 'EUR'), 3) // => { amount: '3.33', currency: 'EUR' }
 */
export function divide(m: Money, divisor: number | string | bigint, options?: RoundingOptions): Money {
  const digits = digitsOfMoney('divide', m)
  const d = toScaled('divide', 'divisor', divisor)
  const mode = rounding('divide', options)

  if (d.n === 0n) return badRange('divide', `the divisor ${JSON.stringify(String(divisor))} is zero`)

  return make(divRound(minorBig('divide', m, digits) * pow10(d.s), d.n, mode), m.currency, digits)
}

/**
 * `percent` percent of an amount, rounded to the currency's digits.
 *
 * @example percentage(money('200.00', 'EUR'), 21) // => { amount: '42.00', currency: 'EUR' }
 * @example percentage(money('9.99', 'EUR'), '7.5') // => { amount: '0.75', currency: 'EUR' }
 */
export function percentage(m: Money, percent: number | string | bigint, options?: RoundingOptions): Money {
  const digits = digitsOfMoney('percentage', m)
  const p = toScaled('percentage', 'percent', percent)
  const mode = rounding('percentage', options)

  return make(divRound(minorBig('percentage', m, digits) * p.n, pow10(p.s) * 100n, mode), m.currency, digits)
}

function ratiosOf(fn: string, ratios: unknown): bigint[] {
  if (!Array.isArray(ratios) || ratios.length === 0 || ratios.length > 100_000) {
    return badValue(fn, 'a non-empty array of ratios such as [1, 1, 2] or ["0.5", "0.5"]', ratios)
  }
  const parsed = ratios.map((r) => toScaled(fn, 'every ratio', r))
  const scale = parsed.reduce((s, r) => (r.s > s ? r.s : s), 0)
  const ints = parsed.map((r) => r.n * pow10(scale - r.s))

  if (ints.some((n) => n < 0n)) return badRange(fn, `ratios must not be negative, got ${JSON.stringify(ratios.map(String))}`)
  if (ints.every((n) => n === 0n)) return badRange(fn, `the ratios are all zero (${JSON.stringify(ratios.map(String))}), so there is nothing to share by. Give at least one ratio above zero.`)

  return ints
}

/**
 * Share an amount by ratios so that the parts sum EXACTLY to the amount. Each part is its floor share in minor units; the
 * minor units left over go one each to the parts with the largest fractional remainders, ties to the first. A negative amount
 * is shared by its absolute value and the parts take its sign. A ratio of zero gets zero. All-zero or negative ratios throw.
 * Each part is within one minor unit of its exact share. Reordering the ratios reorders the parts, but a tie can move a cent.
 *
 * @example allocate(money('100.00', 'EUR'), [1, 1, 1]).map((p) => p.amount) // => ['33.34', '33.33', '33.33']
 * @example allocate(money('0.05', 'EUR'), [3, 7]).map((p) => p.amount) // => ['0.02', '0.03']
 * @example allocate(money('10.00', 'EUR'), [0, 1]).map((p) => p.amount) // => ['0.00', '10.00']
 */
export function allocate(m: Money, ratios: readonly (number | string)[]): Money[] {
  const digits = digitsOfMoney('allocate', m)
  const weights = ratiosOf('allocate', ratios)
  const minor = minorBig('allocate', m, digits)
  const negative = minor < 0n
  const total = negative ? -minor : minor
  let weightSum = 0n

  for (const w of weights) weightSum += w
  const floors: bigint[] = []
  const rests: bigint[] = []
  let given = 0n

  for (const w of weights) {
    const product = total * w

    floors.push(product / weightSum)
    rests.push(product % weightSum)
    given += product / weightSum
  }
  const order = weights.map((_, i) => i).sort((i, j) => (rests[i]! === rests[j]! ? i - j : rests[i]! > rests[j]! ? -1 : 1))

  for (let k = 0n; k < total - given; k++) floors[order[Number(k)]!]! += 1n

  return floors.map((part) => make(negative ? -part : part, m.currency, digits))
}

/**
 * Split an amount into `parts` equal parts that sum exactly to it: the first parts get the extra cent.
 *
 * @example split(money('100.00', 'EUR'), 3).map((p) => p.amount) // => ['33.34', '33.33', '33.33']
 */
export function split(m: Money, parts: number): Money[] {
  const n = wholeIn('split', 'parts', parts, 1, 100_000)

  return allocate(m, new Array<number>(n).fill(1))
}

/** Options of `ratio`. */
export interface RatioOptions {
  /** Digits after the decimal point. Default 10. */
  scale?: number
  /** Default `'halfExpand'`. */
  rounding?: RoundingMode
}

/**
 * `a / b` as a decimal string with trailing zeros removed, rounded to `scale` digits (default 10). Both amounts must be one
 * currency; a zero `b` throws.
 *
 * @example ratio(money('1.00', 'EUR'), money('4.00', 'EUR')) // => '0.25'
 * @example ratio(money('1.00', 'EUR'), money('3.00', 'EUR'), { scale: 4 }) // => '0.3333'
 */
export function ratio(a: Money, b: Money, options?: RatioOptions): string {
  const digits = pair('ratio', a, b)
  const scale = options?.scale === undefined ? 10 : wholeIn('ratio', 'scale', options.scale, 0, 1000)
  const mode = options?.rounding === undefined ? 'halfExpand' : checkMode('ratio', options.rounding)
  const y = minorBig('ratio', b, digits)

  if (y === 0n) return badRange('ratio', `the second amount is zero (${b.amount} ${b.currency}), so the ratio is undefined`)
  const text = formatScaled(divRound(minorBig('ratio', a, digits) * pow10(scale), y, mode), scale)

  return scale === 0 || !text.includes('.') ? text : text.replace(/0+$/, '').replace(/\.$/, '')
}

// ─── compare ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * -1, 0 or 1. Different currencies throw (they cannot be ordered without a rate).
 *
 * @example compare(money('1.00', 'EUR'), money('2.00', 'EUR')) // => -1
 */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  const digits = pair('compare', a, b)
  const x = readMinor('compare', a, digits)
  const y = readMinor('compare', b, digits)

  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Whether two amounts are equal. Amounts of different currencies are not equal (this does not throw).
 *
 * @example equals(money('1.5', 'EUR'), money('1.50', 'EUR')) // => true
 * @example equals(money('1', 'EUR'), money('1', 'USD')) // => false
 */
export function equals(a: Money, b: Money): boolean {
  const digits = digitsOfMoney('equals', a)
  const other = digitsOfMoney('equals', b)

  if (a.currency !== b.currency) return false
  readMinor('equals', a, digits)
  readMinor('equals', b, other)

  return a.amount === b.amount
}

function extreme(fn: string, list: readonly Money[], sign: -1 | 1): Money {
  if (list.length === 0) return badRange(fn, 'needs at least one amount')
  let best = list[0]!

  digitsOfMoney(fn, best)
  for (let i = 1; i < list.length; i++) {
    if (compare(list[i]!, best) === sign) best = list[i]!
  }

  return best
}

/**
 * The smallest amount. At least one is required; currencies must match.
 *
 * @example min(money('3', 'EUR'), money('2', 'EUR')) // => { amount: '2.00', currency: 'EUR' }
 */
export function min(...amounts: [Money, ...Money[]]): Money {
  return extreme('min', amounts, -1)
}

/**
 * The largest amount. At least one is required; currencies must match.
 *
 * @example max(money('3', 'EUR'), money('2', 'EUR')) // => { amount: '3.00', currency: 'EUR' }
 */
export function max(...amounts: [Money, ...Money[]]): Money {
  return extreme('max', amounts, 1)
}

/**
 * Whether the amount is zero.
 *
 * @example isZero(zero('EUR')) // => true
 */
export function isZero(m: Money): boolean {
  return readMinor('isZero', m, digitsOfMoney('isZero', m)) == 0
}

/**
 * Whether the amount is above zero.
 *
 * @example isPositive(money('0.01', 'EUR')) // => true
 */
export function isPositive(m: Money): boolean {
  return readMinor('isPositive', m, digitsOfMoney('isPositive', m)) > 0
}

/**
 * Whether the amount is below zero.
 *
 * @example isNegative(money('-0.01', 'EUR')) // => true
 */
export function isNegative(m: Money): boolean {
  return readMinor('isNegative', m, digitsOfMoney('isNegative', m)) < 0
}

// ─── rounding and conversion ──────────────────────────────────────────────────────────────────────────────────────────────

/** Options of `round`. */
export interface MoneyRoundOptions {
  /** Keep fewer fraction digits than the currency has (`0` rounds to whole units). */
  digits?: number
  /** Round to a multiple of this amount (`'0.05'` for cash rounding in CHF). Not together with `digits`. */
  increment?: string | number
  /** Default `'halfExpand'`. */
  mode?: RoundingMode
}

/**
 * Round to fewer digits or to a multiple of an increment (cash rounding), by `mode` (default `'halfExpand'`, round half away
 * from zero; `'halfEven'` is banker's rounding). With no options it is the amount itself, because a Money always has exactly
 * its currency's digits.
 *
 * @example round(money('12.34', 'EUR'), { digits: 0 }) // => { amount: '12.00', currency: 'EUR' }
 * @example round(money('1.23', 'CHF'), { increment: '0.05' }) // => { amount: '1.25', currency: 'CHF' }
 * @example round(money('2.50', 'EUR'), { digits: 0, mode: 'halfEven' }) // => { amount: '2.00', currency: 'EUR' }
 */
export function round(m: Money, options?: MoneyRoundOptions): Money {
  const digits = digitsOfMoney('round', m)
  const mode = options?.mode === undefined ? 'halfExpand' : checkMode('round', options.mode)
  const minor = minorBig('round', m, digits)

  if (options?.increment !== undefined && options.digits !== undefined) return badValue('round', 'either digits or increment', options, 'Pass one: digits to keep fewer digits, increment for cash rounding.')
  let unit = 1n

  if (options?.increment !== undefined) {
    const inc = toScaled('round', 'increment', options.increment)
    const scaled = inc.n * pow10(digits)

    if (inc.n <= 0n) return badRange('round', `increment must be greater than zero, got ${JSON.stringify(String(options.increment))}`)
    if (scaled % pow10(inc.s) !== 0n) return badRange('round', `the increment ${JSON.stringify(String(options.increment))} is smaller than a ${m.currency} minor unit (${digits} digits)`)
    unit = scaled / pow10(inc.s)
  } else if (options?.digits !== undefined) {
    const keep = wholeIn('round', 'digits', options.digits, 0, 1000)

    if (keep < digits) unit = pow10(digits - keep)
  }

  return make(divRound(minor, unit, mode) * unit, m.currency, digits)
}

/**
 * Convert to another currency with a rate (`1 unit of m.currency = rate units of to`), rounded to the target's digits. Give
 * the rate as a decimal string; a number is read by its shortest text. Keep `{ from, to, rate }` next to the result: it is the
 * audit trail.
 *
 * @example convert(money('100.00', 'EUR'), 'USD', '1.0842') // => { amount: '108.42', currency: 'USD' }
 * @example convert(money('100.00', 'EUR'), 'JPY', '162.5') // => { amount: '16250', currency: 'JPY' }
 */
export function convert(m: Money, to: CurrencyCode, rate: number | string | bigint, options?: RoundingOptions): Money {
  const from = digitsOfMoney('convert', m)
  const target = digitsOf('convert', to)
  const r = toScaled('convert', 'rate', rate)
  const mode = rounding('convert', options)

  if (r.n <= 0n) return badRange('convert', `the rate must be greater than zero, got ${JSON.stringify(String(rate))}`)

  return make(divRound(minorBig('convert', m, from) * r.n * pow10(target), pow10(from + r.s), mode), to, target)
}
