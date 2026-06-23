/**
 * `NumberSchema` — chainable number validator.
 *
 * Built-in checks: `min`, `max`, `int`, `finite`, `positive`,
 * `negative`, `nonNegative`, `nonPositive`, `between`, `multipleOf`.
 */

import { Schema as SchemaBase, attachCheck, makeCheckIssue } from '../core/schema'
import { typeIssue } from '../core/issue'
import type { CheckOpts, ParseCtx } from '../core/ops'

export class NumberSchema extends SchemaBase<number> {
  readonly _kind = 'number' as const

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'number' || Number.isNaN(input)) {
      ctx.issues.push(typeIssue('number', input, ctx.path))
      return input
    }
    return input
  }

  min(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:min', n, opts }, (value, ctx) => {
        if (typeof value !== 'number' || value >= n) return
        ctx.issues.push(
          makeCheckIssue(
            'too_small',
            `Must be at least ${n}`,
            'validate.number.too-small',
            { min: n, actual: value },
            `Must be at least ${n}`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  max(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:max', n, opts }, (value, ctx) => {
        if (typeof value !== 'number' || value <= n) return
        ctx.issues.push(
          makeCheckIssue(
            'too_big',
            `Must be at most ${n}`,
            'validate.number.too-big',
            { max: n, actual: value },
            `Must be at most ${n}`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  int(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:int', opts }, (value, ctx) => {
        if (typeof value !== 'number' || Number.isInteger(value)) return
        ctx.issues.push(
          makeCheckIssue(
            'not_integer',
            'Must be an integer',
            'validate.number.not-integer',
            { actual: value },
            'Must be an integer',
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  finite(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:finite', opts }, (value, ctx) => {
        if (typeof value !== 'number' || Number.isFinite(value)) return
        ctx.issues.push(
          makeCheckIssue(
            'not_finite',
            'Must be finite',
            'validate.number.not-finite',
            { actual: value },
            'Must be finite',
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  positive(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:positive', opts }, (value, ctx) => {
        if (typeof value !== 'number' || value > 0) return
        ctx.issues.push(
          makeCheckIssue(
            'not_positive',
            'Must be positive',
            'validate.number.not-positive',
            { actual: value },
            'Must be positive',
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  negative(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:negative', opts }, (value, ctx) => {
        if (typeof value !== 'number' || value < 0) return
        ctx.issues.push(
          makeCheckIssue(
            'not_negative',
            'Must be negative',
            'validate.number.not-negative',
            { actual: value },
            'Must be negative',
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  nonNegative(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:non-negative', opts }, (value, ctx) => {
        if (typeof value !== 'number' || value >= 0) return
        ctx.issues.push(
          makeCheckIssue(
            'not_non_negative',
            'Must be ≥ 0',
            'validate.number.not-non-negative',
            { actual: value },
            'Must be ≥ 0',
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  nonPositive(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:non-positive', opts }, (value, ctx) => {
        if (typeof value !== 'number' || value <= 0) return
        ctx.issues.push(
          makeCheckIssue(
            'not_non_positive',
            'Must be ≤ 0',
            'validate.number.not-non-positive',
            { actual: value },
            'Must be ≤ 0',
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  between(lo: number, hi: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:between', lo, hi, opts }, (value, ctx) => {
        if (typeof value !== 'number' || (value >= lo && value <= hi)) return
        ctx.issues.push(
          makeCheckIssue(
            'out_of_range',
            `Must be between ${lo} and ${hi}`,
            'validate.number.out-of-range',
            { min: lo, max: hi, actual: value },
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

  multipleOf(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:multiple-of', n, opts }, (value, ctx) => {
        if (typeof value !== 'number' || value % n === 0) return
        ctx.issues.push(
          makeCheckIssue(
            'not_multiple_of',
            `Must be a multiple of ${n}`,
            'validate.number.not-multiple-of',
            { divisor: n, actual: value },
            `Must be a multiple of ${n}`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /** Strictly greater than `n` (exclusive lower bound). `gte` is the inclusive form. */
  gt(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:gt', n, opts }, (value, ctx) => {
        if (typeof value !== 'number' || value > n) return
        ctx.issues.push(
          makeCheckIssue(
            'too_small',
            `Must be greater than ${n}`,
            'validate.number.gt',
            { min: n, actual: value },
            `Must be greater than ${n}`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /** Greater than or equal to `n` (inclusive) — alias for {@link min}. */
  gte(n: number, opts?: CheckOpts): this {
    return this.min(n, opts)
  }

  /** Strictly less than `n` (exclusive upper bound). `lte` is the inclusive form. */
  lt(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:lt', n, opts }, (value, ctx) => {
        if (typeof value !== 'number' || value < n) return
        ctx.issues.push(
          makeCheckIssue(
            'too_big',
            `Must be less than ${n}`,
            'validate.number.lt',
            { max: n, actual: value },
            `Must be less than ${n}`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /** Less than or equal to `n` (inclusive) — alias for {@link max}. */
  lte(n: number, opts?: CheckOpts): this {
    return this.max(n, opts)
  }

  /** Multiple of `n` — alias for {@link multipleOf} (Zod's `.step`). */
  step(n: number, opts?: CheckOpts): this {
    return this.multipleOf(n, opts)
  }

  /**
   * Within the IEEE-754 safe-integer RANGE (`Number.MIN_SAFE_INTEGER` …
   * `MAX_SAFE_INTEGER`). Matches Zod's `.safe()` — a bounds check, NOT an
   * integer-ness check (a fractional value inside the range passes; compose
   * with `.int()` if you need an integer).
   */
  safe(opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:number:safe', opts }, (value, ctx) => {
        if (
          typeof value !== 'number' ||
          (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER)
        ) {
          return
        }
        ctx.issues.push(
          makeCheckIssue(
            'too_big',
            'Must be within the safe-integer range',
            'validate.number.safe',
            { actual: value },
            'Must be within the safe-integer range',
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

export function number(): NumberSchema {
  return new NumberSchema()
}
