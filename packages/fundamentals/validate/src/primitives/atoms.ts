/**
 * Atomic primitives with no checks beyond their type guard:
 * `null` / `undefined` / `void` / `nan` / `any` / `unknown` / `symbol`.
 * (`null`/`undefined`/`void` are reserved words → factories are suffixed
 * `_`; the `s.` namespace aliases them to the bare names.)
 */

import { makeIssue, typeIssue } from '../core/issue'
import type { ParseCtx } from '../core/ops'
import { Schema as SchemaBase } from '../core/schema'

export class NullSchema extends SchemaBase<null> {
  readonly _kind = 'null' as const
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (input !== null) ctx.issues.push(typeIssue('null', input, ctx.path))
    return input
  }
}

export class UndefinedSchema extends SchemaBase<undefined> {
  readonly _kind = 'undefined' as const
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (input !== undefined) ctx.issues.push(typeIssue('undefined', input, ctx.path))
    return input
  }
}

export class VoidSchema extends SchemaBase<void> {
  readonly _kind = 'void' as const
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (input !== undefined) ctx.issues.push(typeIssue('void', input, ctx.path))
    return input
  }
}

export class NanSchema extends SchemaBase<number> {
  readonly _kind = 'nan' as const
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'number' || !Number.isNaN(input)) {
      ctx.issues.push(
        makeIssue({
          code: 'wrong_type',
          key: 'validate.nan.required',
          fallback: 'Expected NaN',
          message: 'Expected NaN',
          path: ctx.path,
        }),
      )
    }
    return input
  }
}

export class SymbolSchema extends SchemaBase<symbol> {
  readonly _kind = 'symbol' as const
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'symbol') ctx.issues.push(typeIssue('symbol', input, ctx.path))
    return input
  }
}

/** Accepts any input (type `any`). Escape hatch — no validation performed. */
// oxlint-disable-next-line typescript/no-explicit-any
export class AnySchema extends SchemaBase<any> {
  readonly _kind = 'any' as const
}

/** Accepts any input (type `unknown`). Like `any` but keeps the output opaque. */
export class UnknownSchema extends SchemaBase<unknown> {
  readonly _kind = 'unknown' as const
}

export function null_(): NullSchema {
  return new NullSchema()
}
export function undefined_(): UndefinedSchema {
  return new UndefinedSchema()
}
export function void_(): VoidSchema {
  return new VoidSchema()
}
export function nan(): NanSchema {
  return new NanSchema()
}
export function symbol(): SymbolSchema {
  return new SymbolSchema()
}
// oxlint-disable-next-line typescript/no-explicit-any
export function any(): AnySchema {
  return new AnySchema()
}
export function unknown(): UnknownSchema {
  return new UnknownSchema()
}
