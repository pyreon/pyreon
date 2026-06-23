/**
 * `BigIntSchema` — chainable `bigint` validator. `typeof === 'bigint'`
 * (no coercion from number/string — that's `coerce.bigint()`). Checks:
 * `min` / `max` / `positive` / `negative` / `multipleOf`.
 */

import { typeIssue } from '../core/issue'
import type { CheckOpts, ParseCtx } from '../core/ops'
import { Schema as SchemaBase, attachCheck, makeCheckIssue } from '../core/schema'

export class BigIntSchema extends SchemaBase<bigint> {
  readonly _kind = 'bigint' as const

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'bigint') {
      ctx.issues.push(typeIssue('bigint', input, ctx.path))
    }
    return input
  }

  min(n: bigint, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:bigint:min', n, opts }, (value, ctx) => {
        if (typeof value !== 'bigint' || value >= n) return
        ctx.issues.push(
          makeCheckIssue('too_small', `Must be >= ${n}`, 'validate.bigint.too-small', { min: String(n) }, `Must be >= ${n}`, ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  max(n: bigint, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:bigint:max', n, opts }, (value, ctx) => {
        if (typeof value !== 'bigint' || value <= n) return
        ctx.issues.push(
          makeCheckIssue('too_big', `Must be <= ${n}`, 'validate.bigint.too-big', { max: String(n) }, `Must be <= ${n}`, ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  positive(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:bigint:positive', opts }, (value, ctx) => {
        if (typeof value !== 'bigint' || value > 0n) return
        ctx.issues.push(
          makeCheckIssue('too_small', 'Must be positive', 'validate.bigint.not-positive', {}, 'Must be positive', ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  negative(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:bigint:negative', opts }, (value, ctx) => {
        if (typeof value !== 'bigint' || value < 0n) return
        ctx.issues.push(
          makeCheckIssue('too_big', 'Must be negative', 'validate.bigint.not-negative', {}, 'Must be negative', ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  multipleOf(n: bigint, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:bigint:multiple-of', n, opts }, (value, ctx) => {
        if (typeof value !== 'bigint' || value % n === 0n) return
        ctx.issues.push(
          makeCheckIssue('not_multiple_of', `Must be a multiple of ${n}`, 'validate.bigint.not-multiple-of', { multipleOf: String(n) }, `Must be a multiple of ${n}`, ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /** Strictly greater than `n` (exclusive lower bound). `gte` is the inclusive form. */
  gt(n: bigint, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:bigint:gt', n, opts }, (value, ctx) => {
        if (typeof value !== 'bigint' || value > n) return
        ctx.issues.push(
          makeCheckIssue('too_small', `Must be > ${n}`, 'validate.bigint.gt', { min: String(n) }, `Must be > ${n}`, ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /** Greater than or equal to `n` (inclusive) — alias for {@link min}. */
  gte(n: bigint, opts?: CheckOpts): this {
    return this.min(n, opts)
  }

  /** Strictly less than `n` (exclusive upper bound). `lte` is the inclusive form. */
  lt(n: bigint, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:bigint:lt', n, opts }, (value, ctx) => {
        if (typeof value !== 'bigint' || value < n) return
        ctx.issues.push(
          makeCheckIssue('too_big', `Must be < ${n}`, 'validate.bigint.lt', { max: String(n) }, `Must be < ${n}`, ctx, opts),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /** Less than or equal to `n` (inclusive) — alias for {@link max}. */
  lte(n: bigint, opts?: CheckOpts): this {
    return this.max(n, opts)
  }

  /** Multiple of `n` — alias for {@link multipleOf} (Zod's `.step`). */
  step(n: bigint, opts?: CheckOpts): this {
    return this.multipleOf(n, opts)
  }

  /** Inclusive range `lo … hi`. */
  between(lo: bigint, hi: bigint, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:bigint:between', lo, hi, opts }, (value, ctx) => {
        if (typeof value !== 'bigint' || (value >= lo && value <= hi)) return
        ctx.issues.push(
          makeCheckIssue(
            'too_big',
            `Must be between ${lo} and ${hi}`,
            'validate.bigint.between',
            { min: String(lo), max: String(hi) },
            `Must be between ${lo} and ${hi}`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }
}

export function bigint(): BigIntSchema {
  return new BigIntSchema()
}
