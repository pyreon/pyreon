import { badRange, badValue } from './errors'

/**
 * Exact decimals as scaled integers: a value is `n / 10^s` with a `bigint` numerator and a whole scale. Parsing and printing
 * read char codes; no regex, no `Number()` on a piece of text, no `BigInt()` on text that could be malformed (a `SyntaxError`
 * never reaches a caller).
 */
export interface Scaled {
  /** Signed numerator. */
  n: bigint
  /** Digits after the decimal point. */
  s: number
}

/** The most digits an input may have (and the largest scale an option may ask for): a guard against `1e999999999`. */
export const MAX_DIGITS = 4096

/** The nine rounding modes, named as `Intl.NumberFormat`'s `roundingMode` names them. */
export type RoundingMode = 'ceil' | 'floor' | 'expand' | 'trunc' | 'halfCeil' | 'halfFloor' | 'halfExpand' | 'halfTrunc' | 'halfEven'

const MODES = ['ceil', 'floor', 'expand', 'trunc', 'halfCeil', 'halfFloor', 'halfExpand', 'halfTrunc', 'halfEven']

export function checkMode(fn: string, mode: unknown): RoundingMode {
  return typeof mode === 'string' && MODES.includes(mode)
    ? (mode as RoundingMode)
    : badValue(fn, `a rounding mode (${MODES.join(', ')})`, mode, `The default is 'halfExpand' (round half away from zero); 'halfEven' is banker's rounding.`)
}

const POWERS: bigint[] = [1n]

/** `10n ** k`, cached for small `k` (a fixed table of at most 64 entries). */
export function pow10(k: number): bigint {
  if (k < 64) {
    for (let i = POWERS.length; i <= k; i++) POWERS.push(POWERS[i - 1]! * 10n)

    return POWERS[k]!
  }

  return 10n ** BigInt(k)
}

/**
 * Read decimal text. Strict mode accepts exactly the canonical form (`-?(0|[1-9][0-9]*)(\.[0-9]+)?`, no `-0`). Lenient mode
 * also accepts a leading `+`, `.5`, `5.`, leading zeros and an exponent (`1e-3`, `1.5E+2`). Returns `null` when the text is not
 * a decimal in that mode, and throws a RangeError when it is one that is larger than `MAX_DIGITS`.
 */
export function readDecimal(fn: string, text: string, lenient: boolean): Scaled | null {
  const len = text.length
  let i = 0
  let neg = false

  if (len === 0) return null
  const first = text.charCodeAt(0)

  if (first === 45) {
    neg = true
    i = 1
  } else if (first === 43 && lenient) i = 1
  const intStart = i

  while (i < len && text.charCodeAt(i) - 48 >>> 0 <= 9) i++
  const intLen = i - intStart
  let fracStart = i
  let fracLen = 0

  if (i < len && text.charCodeAt(i) === 46) {
    fracStart = ++i
    while (i < len && text.charCodeAt(i) - 48 >>> 0 <= 9) i++
    fracLen = i - fracStart
    if (fracLen === 0 && !lenient) return null
  }
  if (intLen === 0 && fracLen === 0) return null
  if (!lenient) return i === len && intLen > 0 ? strictShape(text, neg, intStart, intLen, fracLen, fn) : null
  let exp = 0

  if (i < len && (text.charCodeAt(i) | 32) === 101) {
    let j = i + 1
    let eneg = false

    if (j < len && (text.charCodeAt(j) === 43 || text.charCodeAt(j) === 45)) eneg = text.charCodeAt(j++) === 45
    const expStart = j

    while (j < len && text.charCodeAt(j) - 48 >>> 0 <= 9) j++
    if (j === expStart || j - expStart > 9) return j === expStart ? null : badRange(fn, `the exponent in ${JSON.stringify(text.slice(0, 40))} is too large`)
    exp = Number(text.slice(expStart, j)) * (eneg ? -1 : 1)
    i = j
  }
  if (i !== len) return null

  return build(fn, text, neg, intStart, intLen, fracStart, fracLen, exp)
}

function strictShape(text: string, neg: boolean, intStart: number, intLen: number, fracLen: number, fn: string): Scaled | null {
  // Canonical: no leading zero before other digits, and no negative zero.
  if (intLen > 1 && text.charCodeAt(intStart) === 48) return null
  const scaled = build(fn, text, neg, intStart, intLen, intStart + intLen + 1, fracLen, 0)

  return scaled !== null && scaled.n === 0n && neg ? null : scaled
}

function build(fn: string, text: string, neg: boolean, intStart: number, intLen: number, fracStart: number, fracLen: number, exp: number): Scaled | null {
  let digits = text.slice(intStart, intStart + intLen) + (fracLen > 0 ? text.slice(fracStart, fracStart + fracLen) : '')
  let s = fracLen - exp

  if (s < 0) {
    if (digits.length - s > MAX_DIGITS) return badRange(fn, `${JSON.stringify(text.slice(0, 40))} has more than ${MAX_DIGITS} digits once its exponent is applied`)
    digits += '0'.repeat(-s)
    s = 0
  }
  if (digits.length > MAX_DIGITS || s > MAX_DIGITS) return badRange(fn, `${JSON.stringify(text.slice(0, 40))} has more than ${MAX_DIGITS} digits`)
  const n = BigInt(digits)

  return { n: neg ? -n : n, s }
}

/** The canonical text of `n / 10^s` with exactly `s` fraction digits. Zero is never written with a sign. */
export function formatScaled(n: bigint, s: number): string {
  const neg = n < 0n
  let digits = (neg ? -n : n).toString()

  if (s > 0) {
    if (digits.length <= s) digits = '0'.repeat(s - digits.length + 1) + digits
    digits = `${digits.slice(0, digits.length - s)}.${digits.slice(digits.length - s)}`
  }

  return neg ? `-${digits}` : digits
}

/**
 * `n / d` rounded to an integer by `mode`, on integers: the one place rounding is implemented. `d` must not be zero. The
 * quotient truncates toward zero; the remainder says whether the exact value is a tie or on which side of one, and the mode
 * picks between the truncated value and the next integer away from zero.
 */
export function divRound(n: bigint, d: bigint, mode: RoundingMode): bigint {
  if (d < 0n) {
    n = -n
    d = -d
  }
  const q = n / d
  const r = n % d

  if (r === 0n) return q
  const negative = n < 0n
  const away = negative ? q - 1n : q + 1n
  const twice = (r < 0n ? -r : r) * 2n

  switch (mode) {
    case 'trunc':
      return q
    case 'expand':
      return away
    case 'ceil':
      return negative ? q : away
    case 'floor':
      return negative ? away : q
    default:
      if (twice < d) return q
      if (twice > d) return away

      return tie(mode, q, away, negative)
  }
}

/** The half-way cases of the five `half*` modes. */
function tie(mode: RoundingMode, q: bigint, away: bigint, negative: boolean): bigint {
  if (mode === 'halfExpand') return away
  if (mode === 'halfTrunc') return q
  if (mode === 'halfCeil') return negative ? q : away

  return mode === 'halfFloor' ? (negative ? away : q) : (q % 2n === 0n ? q : away)
}

/** A whole number in `lo..hi`, or a thrown error naming the function and option. */
export function wholeIn(fn: string, name: string, value: unknown, lo: number, hi: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= lo && value <= hi ? value : badValue(fn, `${name} to be a whole number from ${lo} to ${hi}`, value)
}

/**
 * A number, decimal string or bigint as a `Scaled`. A number is read by its shortest round-trip text (`0.1` is exactly one
 * tenth, not the binary float nearest to it); `lenient` text may carry a sign, an exponent and so on.
 */
export function toScaled(fn: string, what: string, value: unknown): Scaled {
  if (typeof value === 'bigint') return { n: value, s: 0 }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return badValue(fn, `${what} to be a finite number`, value)

    return readDecimal(fn, Object.is(value, -0) ? '0' : String(value), true)!
  }
  const parsed = typeof value === 'string' ? readDecimal(fn, value, true) : null

  return parsed ?? badValue(fn, `${what} to be a number, a decimal string such as "1.21" or a bigint`, value)
}
