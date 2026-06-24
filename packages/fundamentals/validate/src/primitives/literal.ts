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

/** A TS native enum object (string / numeric) or a const value-object. */
export type EnumLike = Record<string, string | number>

/**
 * Extract the VALID member values of a TS enum object — filtering out the
 * numeric reverse-mappings TS auto-generates (a numeric `enum { A }` compiles
 * to `{ A: 0, 0: 'A' }`, so the `'A'` value must NOT be accepted as input).
 * Mirrors Zod's `getValidEnumValues`: a key whose value indexes back to a
 * number is a reverse-mapping key and is skipped.
 */
export function getValidEnumValues(obj: EnumLike): Array<string | number> {
  const out: Array<string | number> = []
  for (const key of Object.keys(obj)) {
    const reverse = (obj as Record<string | number, unknown>)[obj[key] as string | number]
    if (typeof reverse === 'number') continue
    out.push(obj[key] as string | number)
  }
  return out
}

/**
 * `NativeEnumSchema` — validates that `input` is a VALUE of a TS native enum
 * (or a `const` value-object). Output type is the enum's value union
 * (`E[keyof E]`).
 */
export class NativeEnumSchema<E extends EnumLike> extends SchemaBase<E[keyof E]> {
  readonly _kind = 'nativeEnum' as const
  readonly enumObject: E
  readonly values: Array<string | number>

  constructor(enumObject: E) {
    super()
    this.enumObject = enumObject
    this.values = getValidEnumValues(enumObject)
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (!this.values.includes(input as string | number)) {
      ctx.issues.push(
        makeIssue({
          code: 'invalid_enum',
          key: 'validate.native-enum.mismatch',
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

/** `s.nativeEnum(MyEnum)` — validate a value of a TS native enum (Zod's `z.nativeEnum`). */
export function nativeEnum<E extends EnumLike>(enumObject: E): NativeEnumSchema<E> {
  return new NativeEnumSchema(enumObject)
}
