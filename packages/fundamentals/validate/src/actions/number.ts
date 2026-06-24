/**
 * Tree-shakeable number check ACTIONS for `@pyreon/validate/mini`.
 *
 * Standalone, function-composition twins of the `NumberSchema` methods — push
 * byte-identical ops (parity-locked by `tests/actions-parity.test.ts`). Naming
 * follows the Valibot convention so string vs number bounds are unambiguous as
 * named imports: `minLength`/`maxLength` (string) vs `minValue`/`maxValue`
 * (number); `gte`/`lte` are aliases.
 */
import type { CheckOpts } from '../core/ops'
import type { Action } from '../core/schema'
import { defineCheck } from './_core'

/** Minimum value (inclusive). Alias: {@link gte}. */
export const minValue = (n: number, opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:min', n, opts },
    (v) => typeof v !== 'number' || v >= n,
    (v) => ({
      code: 'too_small',
      message: `Must be at least ${n}`,
      key: 'validate.number.too-small',
      params: { min: n, actual: v },
    }),
  )
/** Inclusive lower bound — alias for {@link minValue}. */
export const gte = minValue

/** Maximum value (inclusive). Alias: {@link lte}. */
export const maxValue = (n: number, opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:max', n, opts },
    (v) => typeof v !== 'number' || v <= n,
    (v) => ({
      code: 'too_big',
      message: `Must be at most ${n}`,
      key: 'validate.number.too-big',
      params: { max: n, actual: v },
    }),
  )
/** Inclusive upper bound — alias for {@link maxValue}. */
export const lte = maxValue

/** Strictly greater than `n` (exclusive). */
export const gt = (n: number, opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:gt', n, opts },
    (v) => typeof v !== 'number' || v > n,
    (v) => ({
      code: 'too_small',
      message: `Must be greater than ${n}`,
      key: 'validate.number.gt',
      params: { min: n, actual: v },
    }),
  )

/** Strictly less than `n` (exclusive). */
export const lt = (n: number, opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:lt', n, opts },
    (v) => typeof v !== 'number' || v < n,
    (v) => ({
      code: 'too_big',
      message: `Must be less than ${n}`,
      key: 'validate.number.lt',
      params: { max: n, actual: v },
    }),
  )

/** In `[lo, hi]` (inclusive). */
export const between = (lo: number, hi: number, opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:between', lo, hi, opts },
    (v) => typeof v !== 'number' || (v >= lo && v <= hi),
    (v) => ({
      code: 'out_of_range',
      message: `Must be between ${lo} and ${hi}`,
      key: 'validate.number.out-of-range',
      params: { min: lo, max: hi, actual: v },
    }),
  )

/** Integer. */
export const integer = (opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:int', opts },
    (v) => typeof v !== 'number' || Number.isInteger(v),
    (v) => ({
      code: 'not_integer',
      message: 'Must be an integer',
      key: 'validate.number.not-integer',
      params: { actual: v },
    }),
  )

/** Finite (not `NaN`/`±Infinity`). */
export const finite = (opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:finite', opts },
    (v) => typeof v !== 'number' || Number.isFinite(v),
    (v) => ({
      code: 'not_finite',
      message: 'Must be finite',
      key: 'validate.number.not-finite',
      params: { actual: v },
    }),
  )

/** Greater than zero. */
export const positive = (opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:positive', opts },
    (v) => typeof v !== 'number' || v > 0,
    (v) => ({
      code: 'not_positive',
      message: 'Must be positive',
      key: 'validate.number.not-positive',
      params: { actual: v },
    }),
  )

/** Less than zero. */
export const negative = (opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:negative', opts },
    (v) => typeof v !== 'number' || v < 0,
    (v) => ({
      code: 'not_negative',
      message: 'Must be negative',
      key: 'validate.number.not-negative',
      params: { actual: v },
    }),
  )

/** Greater than or equal to zero. */
export const nonNegative = (opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:non-negative', opts },
    (v) => typeof v !== 'number' || v >= 0,
    (v) => ({
      code: 'not_non_negative',
      message: 'Must be ≥ 0',
      key: 'validate.number.not-non-negative',
      params: { actual: v },
    }),
  )

/** Less than or equal to zero. */
export const nonPositive = (opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:non-positive', opts },
    (v) => typeof v !== 'number' || v <= 0,
    (v) => ({
      code: 'not_non_positive',
      message: 'Must be ≤ 0',
      key: 'validate.number.not-non-positive',
      params: { actual: v },
    }),
  )

/** Divisible by `n`. */
export const multipleOf = (n: number, opts?: CheckOpts): Action<number> =>
  defineCheck<number>(
    { kind: 'check:number:multiple-of', n, opts },
    (v) => typeof v !== 'number' || v % n === 0,
    (v) => ({
      code: 'not_multiple_of',
      message: `Must be a multiple of ${n}`,
      key: 'validate.number.not-multiple-of',
      params: { divisor: n, actual: v },
    }),
  )
