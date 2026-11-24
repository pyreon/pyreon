import type { CurrencyCode } from './currency'
import * as core from './money'
import type { Money, MoneyRoundOptions, RoundingOptions } from './money'

/**
 * Value-last forms of the Money operations: each call takes the configuration and returns a plain `(m: Money) => Money`, so an
 * operation can be built once, named, passed to `map` and composed with any `pipe` (`pipe` from `@pyreon/time/fp` or
 * `@pyreon/rx`; this package ships none, so that it has no dependencies). Thin wrappers over the core functions.
 */

/**
 * `add(b)` is a function that adds `b` to a Money.
 *
 * @example add({ amount: '1.00', currency: 'EUR' })({ amount: '2.50', currency: 'EUR' }) // => { amount: '3.50', currency: 'EUR' }
 */
export function add(b: Money): (m: Money) => Money {
  return (m) => core.add(m, b)
}

/**
 * `subtract(b)` subtracts `b`.
 *
 * @example subtract({ amount: '1.00', currency: 'EUR' })({ amount: '2.50', currency: 'EUR' }) // => { amount: '1.50', currency: 'EUR' }
 */
export function subtract(b: Money): (m: Money) => Money {
  return (m) => core.subtract(m, b)
}

/**
 * `multiply('1.21')` multiplies by a factor, rounded to the currency's digits.
 *
 * @example multiply('1.21')({ amount: '10.00', currency: 'EUR' }) // => { amount: '12.10', currency: 'EUR' }
 */
export function multiply(factor: number | string | bigint, options?: RoundingOptions): (m: Money) => Money {
  return (m) => core.multiply(m, factor, options)
}

/**
 * `divide(3)` divides, rounded to the currency's digits.
 *
 * @example divide(3)({ amount: '10.00', currency: 'EUR' }) // => { amount: '3.33', currency: 'EUR' }
 */
export function divide(divisor: number | string | bigint, options?: RoundingOptions): (m: Money) => Money {
  return (m) => core.divide(m, divisor, options)
}

/**
 * `percentage(21)` takes 21 percent.
 *
 * @example percentage(21)({ amount: '200.00', currency: 'EUR' }) // => { amount: '42.00', currency: 'EUR' }
 */
export function percentage(percent: number | string | bigint, options?: RoundingOptions): (m: Money) => Money {
  return (m) => core.percentage(m, percent, options)
}

/**
 * `round({ increment: '0.05' })` rounds (cash rounding, fewer digits, any mode).
 *
 * @example round({ increment: '0.05' })({ amount: '1.23', currency: 'CHF' }) // => { amount: '1.25', currency: 'CHF' }
 */
export function round(options?: MoneyRoundOptions): (m: Money) => Money {
  return (m) => core.round(m, options)
}

/**
 * `convert('USD', '1.0842')` converts with a rate.
 *
 * @example convert('USD', '1.0842')({ amount: '100.00', currency: 'EUR' }) // => { amount: '108.42', currency: 'USD' }
 */
export function convert(to: CurrencyCode, rate: number | string | bigint, options?: RoundingOptions): (m: Money) => Money {
  return (m) => core.convert(m, to, rate, options)
}

/**
 * `allocate([1, 1, 1])` shares an amount into parts that sum exactly to it.
 *
 * @example allocate([1, 1, 1])({ amount: '100.00', currency: 'EUR' }).map((p) => p.amount) // => ['33.34', '33.33', '33.33']
 */
export function allocate(ratios: readonly (number | string)[]): (m: Money) => Money[] {
  return (m) => core.allocate(m, ratios)
}

/**
 * `split(3)` splits into equal parts that sum exactly to the amount.
 *
 * @example split(2)({ amount: '0.01', currency: 'EUR' }).map((p) => p.amount) // => ['0.01', '0.00']
 */
export function split(parts: number): (m: Money) => Money[] {
  return (m) => core.split(m, parts)
}

/**
 * `equals(other)` is a predicate: true for an amount equal to `other`.
 *
 * @example equals({ amount: '1.00', currency: 'EUR' })({ amount: '1.00', currency: 'EUR' }) // => true
 */
export function equals(other: Money): (m: Money) => boolean {
  return (m) => core.equals(m, other)
}

// Operations that already take one value are the same function in both entries.
export { abs, compare, isNegative, isPositive, isZero, negate } from './money'
export type { Money, MoneyRoundOptions, RoundingOptions } from './money'
