import { badRange, badValue } from './errors'
import { checkMode, divRound, formatScaled, pow10, readDecimal, type RoundingMode, type Scaled, toScaled, wholeIn } from './scaled'

/**
 * Exact decimals on text: `Decimal` is canonical decimal text (`"-"`, digits, optional `"." digits`; no exponent, no `+`, no
 * leading zeros, never `-0`). Every operation is exact at any size and returns canonical text; inputs may use the lenient
 * forms `normalize` accepts (`+1.5`, `.5`, `1e-3`). Math runs on `bigint` scaled integers.
 */
export type Decimal = string

export type { RoundingMode }

function operand(fn: string, value: unknown): Scaled {
  return toScaled(fn, 'a decimal', value)
}

function align(a: Scaled, b: Scaled): [bigint, bigint, number] {
  if (a.s === b.s) return [a.n, b.n, a.s]

  return a.s > b.s ? [a.n, b.n * pow10(a.s - b.s), a.s] : [a.n * pow10(b.s - a.s), b.n, b.s]
}

/**
 * Whether `x` is a canonical decimal string. Never throws.
 *
 * @example isDecimal('9.90') // => true
 * @example isDecimal('.5') // => false
 * @example isDecimal('1e3') // => false
 */
export function isDecimal(x: unknown): x is Decimal {
  try {
    return typeof x === 'string' && readDecimal('isDecimal', x, false) !== null
  } catch {
    return false
  }
}

/**
 * The canonical form of a decimal given as text, a number (by its shortest text) or a bigint. The scale is kept: `"1.50"`
 * stays `"1.50"`. Throws on anything that is not a decimal.
 *
 * @example normalize('+.5') // => '0.5'
 * @example normalize('1.5e2') // => '150'
 * @example normalize('-0.00') // => '0.00'
 */
export function normalize(value: number | string | bigint): Decimal {
  const x = operand('normalize', value)

  return formatScaled(x.n, x.s)
}

/**
 * Exact sum.
 *
 * @example add('0.1', '0.2') // => '0.3'
 */
export function add(a: number | string | bigint, b: number | string | bigint): Decimal {
  const [x, y, s] = align(operand('add', a), operand('add', b))

  return formatScaled(x + y, s)
}

/**
 * Exact difference.
 *
 * @example subtract('0.3', '0.1') // => '0.2'
 */
export function subtract(a: number | string | bigint, b: number | string | bigint): Decimal {
  const [x, y, s] = align(operand('subtract', a), operand('subtract', b))

  return formatScaled(x - y, s)
}

/**
 * Exact product (the scale is the sum of the scales).
 *
 * @example multiply('19.99', '3') // => '59.97'
 */
export function multiply(a: number | string | bigint, b: number | string | bigint): Decimal {
  const x = operand('multiply', a)
  const y = operand('multiply', b)

  return formatScaled(x.n * y.n, x.s + y.s)
}

/** Options of `divide`. */
export interface DivideOptions {
  /** Digits after the decimal point in the result. Default 20. */
  scale?: number
  /** Default `'halfExpand'`. */
  rounding?: RoundingMode
}

/**
 * Quotient rounded to `scale` digits (default 20). A zero divisor throws.
 *
 * @example divide('1', '3', { scale: 4 }) // => '0.3333'
 * @example divide('2', '3', { scale: 2, rounding: 'floor' }) // => '0.66'
 */
export function divide(a: number | string | bigint, b: number | string | bigint, options?: DivideOptions): Decimal {
  const x = operand('divide', a)
  const y = operand('divide', b)
  const scale = options?.scale === undefined ? 20 : wholeIn('divide', 'scale', options.scale, 0, 1000)
  const mode = options?.rounding === undefined ? 'halfExpand' : checkMode('divide', options.rounding)

  if (y.n === 0n) return badRange('divide', `the divisor ${JSON.stringify(String(b))} is zero`)

  return formatScaled(divRound(x.n * pow10(scale + y.s), y.n * pow10(x.s), mode), scale)
}

/**
 * -1, 0 or 1.
 *
 * @example compare('9.90', '9.9') // => 0
 * @example compare('-1', '0.5') // => -1
 */
export function compare(a: number | string | bigint, b: number | string | bigint): -1 | 0 | 1 {
  const [x, y] = align(operand('compare', a), operand('compare', b))

  return x < y ? -1 : x > y ? 1 : 0
}

/** Options of `round`. */
export interface RoundOptions {
  /** Digits after the decimal point to keep. Default 0 (or the increment's scale). */
  digits?: number
  /** Round to a multiple of this decimal instead (`'0.05'` for cash rounding). */
  increment?: number | string
  /** Default `'halfExpand'`. */
  mode?: RoundingMode
}

/**
 * Round to `digits` fraction digits (default 0) or to a multiple of `increment`, by `mode` (default `'halfExpand'`, round
 * half away from zero; `'halfEven'` is banker's rounding). The result has the target scale.
 *
 * @example round('2.5') // => '3'
 * @example round('2.5', { mode: 'halfEven' }) // => '2'
 * @example round('1.2345', { digits: 2 }) // => '1.23'
 * @example round('1.23', { increment: '0.05' }) // => '1.25'
 */
export function round(value: number | string | bigint, options?: RoundOptions): Decimal {
  const x = operand('round', value)
  const mode = options?.mode === undefined ? 'halfExpand' : checkMode('round', options.mode)

  if (options?.increment !== undefined) {
    const inc = operand('round', options.increment)

    if (inc.n <= 0n) return badRange('round', `increment must be greater than zero, got ${JSON.stringify(String(options.increment))}`)
    const s = Math.max(inc.s, options.digits === undefined ? 0 : wholeIn('round', 'digits', options.digits, 0, 1000), x.s)
    const unit = inc.n * pow10(s - inc.s)

    return formatScaled(divRound(x.n * pow10(s - x.s), unit, mode) * unit, s)
  }
  const digits = options?.digits === undefined ? 0 : wholeIn('round', 'digits', options.digits, 0, 1000)

  if (digits >= x.s) return formatScaled(x.n * pow10(digits - x.s), digits)

  return formatScaled(divRound(x.n, pow10(x.s - digits), mode), digits)
}
