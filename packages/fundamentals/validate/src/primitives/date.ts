/**
 * `DateSchema` — chainable `Date` validator. Accepts only real `Date`
 * instances whose time is valid (rejects `new Date('nonsense')`, whose
 * `.getTime()` is `NaN`). `.min(d)` / `.max(d)` bound the instant.
 */

import { typeIssue } from '../core/issue'
import type { CheckOpts, ParseCtx } from '../core/ops'
import { Schema as SchemaBase, attachCheck, makeCheckIssue } from '../core/schema'

export class DateSchema extends SchemaBase<Date> {
  readonly _kind = 'date' as const

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
      ctx.issues.push(typeIssue('date', input, ctx.path))
    }
    return input
  }

  /** Earliest allowed instant (inclusive). */
  min(d: Date, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:date:min', d, opts }, (value, ctx) => {
        if (!(value instanceof Date) || value.getTime() >= d.getTime()) return
        ctx.issues.push(
          makeCheckIssue(
            'too_small',
            `Must be on or after ${d.toISOString()}`,
            'validate.date.too-early',
            { min: d.toISOString() },
            `Must be on or after ${d.toISOString()}`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  /** Latest allowed instant (inclusive). */
  max(d: Date, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:date:max', d, opts }, (value, ctx) => {
        if (!(value instanceof Date) || value.getTime() <= d.getTime()) return
        ctx.issues.push(
          makeCheckIssue(
            'too_big',
            `Must be on or before ${d.toISOString()}`,
            'validate.date.too-late',
            { max: d.toISOString() },
            `Must be on or before ${d.toISOString()}`,
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

export function date(): DateSchema {
  return new DateSchema()
}
