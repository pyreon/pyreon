/**
 * `BooleanSchema` — chainable boolean validator. No additional checks
 * beyond type — booleans are atomic.
 */

import { Schema as SchemaBase } from '../core/schema'
import { typeIssue } from '../core/issue'
import type { ParseCtx } from '../core/ops'

export class BooleanSchema extends SchemaBase<boolean> {
  readonly _kind = 'boolean' as const

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'boolean') {
      ctx.issues.push(typeIssue('boolean', input, ctx.path))
    }
    return input
  }
}

export function boolean(): BooleanSchema {
  return new BooleanSchema()
}
