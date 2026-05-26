/**
 * `LiteralSchema<L>` — matches one specific literal value via `===`.
 * `LiteralUnionSchema<L>` (via `s.enum(...)`) matches any of a small
 * set of literals.
 */

import { Schema as SchemaBase } from '../core/schema'
import { makeIssue } from '../core/issue'
import type { ParseCtx } from '../core/ops'

export class LiteralSchema<L extends string | number | boolean> extends SchemaBase<L> {
  readonly _kind = 'literal' as const
  readonly value: L

  constructor(value: L) {
    super()
    this.value = value
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (input !== this.value) {
      ctx.issues.push(
        makeIssue({
          code: 'invalid_literal',
          key: 'validate.literal.mismatch',
          params: { expected: this.value, actual: input },
          fallback: `Expected ${String(this.value)}`,
          message: `Expected ${String(this.value)}`,
          path: ctx.path,
        }),
      )
    }
    return input
  }
}

export function literal<L extends string | number | boolean>(value: L): LiteralSchema<L> {
  return new LiteralSchema(value)
}

export class EnumSchema<L extends readonly (string | number)[]> extends SchemaBase<L[number]> {
  readonly _kind = 'enum' as const
  readonly values: L

  constructor(values: L) {
    super()
    this.values = values
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (!this.values.includes(input as L[number])) {
      ctx.issues.push(
        makeIssue({
          code: 'invalid_enum',
          key: 'validate.enum.mismatch',
          params: { allowed: this.values, actual: input },
          fallback: `Expected one of ${this.values.join(', ')}`,
          message: `Expected one of ${this.values.join(', ')}`,
          path: ctx.path,
        }),
      )
    }
    return input
  }
}

/**
 * `enum` is a reserved word in TypeScript; export as `enum_` to avoid
 * the parse error. The chainable `s.enum([...])` alias is added on the
 * namespace export.
 */
export function enum_<L extends readonly (string | number)[]>(values: L): EnumSchema<L> {
  return new EnumSchema(values)
}
