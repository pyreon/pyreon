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

/**
 * Accepts NO value (type `never`) — every input is a validation error. Used
 * for exhaustiveness / "this field must not be present" shapes (e.g. an
 * `.extend({ legacy: s.never() })` that forbids a key). Mirrors Zod's `z.never()`.
 */
export class NeverSchema extends SchemaBase<never> {
  readonly _kind = 'never' as const
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    ctx.issues.push(
      makeIssue({
        code: 'wrong_type',
        key: 'validate.never.forbidden',
        fallback: 'No value is allowed here',
        message: 'No value is allowed here',
        path: ctx.path,
      }),
    )
    return input
  }
}

/**
 * Escape-hatch primitive validated by a user predicate (mirrors Zod's
 * `z.custom<T>(check?)`). With NO check it accepts everything as `T` (a pure
 * type assertion); with a check it emits a `custom` issue when the predicate
 * returns false. The output type is the caller-supplied `T` — Pyreon never
 * narrows it, since the predicate is opaque.
 */
export class CustomSchema<T> extends SchemaBase<T> {
  readonly _kind = 'custom' as const
  /** The user predicate (named `_check` so the base `.check(...actions)` method doesn't collide). */
  readonly _check: ((value: unknown) => boolean) | undefined
  readonly message: string

  constructor(check?: (value: unknown) => boolean, message = 'Invalid value') {
    super()
    this._check = check
    this.message = message
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (this._check && !this._check(input)) {
      ctx.issues.push(
        makeIssue({
          code: 'custom',
          key: 'validate.custom.failed',
          fallback: this.message,
          message: this.message,
          path: ctx.path,
        }),
      )
    }
    return input
  }
}

/** Constructor type for {@link InstanceofSchema}. */
// oxlint-disable-next-line typescript/no-explicit-any
type Constructor<T> = new (...args: any[]) => T

/**
 * Asserts `input instanceof Ctor` (mirrors Zod's `z.instanceof(Class)`). The
 * canonical way to validate runtime class instances — `s.instanceof(File)`,
 * `s.instanceof(Date)`, `s.instanceof(URL)`, user classes, etc.
 */
export class InstanceofSchema<T> extends SchemaBase<T> {
  readonly _kind = 'instanceof' as const
  readonly ctor: Constructor<T>
  readonly message: string | undefined

  constructor(ctor: Constructor<T>, message?: string) {
    super()
    this.ctor = ctor
    this.message = message
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (!(input instanceof this.ctor)) {
      const name = this.ctor.name || 'the expected class'
      const msg = this.message ?? `Expected an instance of ${name}`
      ctx.issues.push(
        makeIssue({
          code: 'wrong_type',
          key: 'validate.instanceof.required',
          params: { class: name },
          fallback: msg,
          message: msg,
          path: ctx.path,
        }),
      )
    }
    return input
  }
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
export function never(): NeverSchema {
  return new NeverSchema()
}
/**
 * `s.custom<T>(check?, message?)` — assert `T` via an optional predicate.
 * Without a predicate it accepts everything as `T`.
 */
export function custom<T = unknown>(check?: (value: unknown) => boolean, message?: string): CustomSchema<T> {
  return new CustomSchema<T>(check, message)
}
/** `s.instanceof(Ctor, message?)` — assert `input instanceof Ctor`. */
export function instanceof_<T>(ctor: Constructor<T>, message?: string): InstanceofSchema<T> {
  return new InstanceofSchema<T>(ctor, message)
}
