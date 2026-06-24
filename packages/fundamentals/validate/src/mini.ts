/**
 * `@pyreon/validate/mini` — the tree-shakeable, function-composition validator.
 *
 * Same core, same Standard-Schema output, same DX helpers — but the bundle
 * pays only for what you import. The chainable `s.string().email()` (main
 * entry) is the most ergonomic API, but it CANNOT tree-shake: every string
 * format lives on `StringSchema`'s prototype, so `string()` drags all 17
 * regexes in. `mini` fixes that with **lean base constructors** + **standalone
 * check actions**:
 *
 * ```ts
 * import { object, string, number, email, minLength, minValue, integer } from '@pyreon/validate/mini'
 *
 * // `.check()` — reads like chaining, prunes to only what you import:
 * const User = object({
 *   name: string().check(minLength(2)),
 *   email: string().check(email()),
 *   age: number().check(integer(), minValue(0)),
 * })
 *
 * // …or point-free with `pipe`:
 * import { pipe } from '@pyreon/validate/mini'
 * const name = pipe(string(), minLength(2))
 * ```
 *
 * Schemas built here are Standard Schema-native, so `withField` / `parseReactive`
 * / `formatErrors` work on them exactly as on the chainable API.
 */
import { typeIssue } from './core/issue'
import type { ParseCtx } from './core/ops'
import { Schema } from './core/schema'

// ─── Lean base constructors (no format/range methods → tree-shakeable) ───────

/**
 * Lean string schema: the is-string type-check + the generic `.check(...)`,
 * with NO format/length methods on the prototype. Contrast `StringSchema`
 * (main entry), whose `.email()`/`.url()`/… pull every regex.
 */
class MiniStringSchema extends Schema<string> {
  readonly _kind = 'string' as const
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'string') {
      ctx.issues.push(typeIssue('string', input, ctx.path))
    }
    return input
  }
}

/** Lean number schema — is-number type-check + `.check(...)`, no range methods. */
class MiniNumberSchema extends Schema<number> {
  readonly _kind = 'number' as const
  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'number') {
      ctx.issues.push(typeIssue('number', input, ctx.path))
    }
    return input
  }
}

/** A string. Add constraints with `.check(...)` or `pipe()` + the string actions. */
export const string = (): MiniStringSchema => new MiniStringSchema()
/** A number. Add constraints with `.check(...)` or `pipe()` + the number actions. */
export const number = (): MiniNumberSchema => new MiniNumberSchema()

export { MiniNumberSchema, MiniStringSchema }

// ─── Constructors with no format-method weight — re-exported as-is ───────────
// (boolean / literal / enum / composition have no per-format prototype methods,
//  so they already tree-shake by named import — there's no lean variant to make.)
export { array } from './composition/array'
export { map, set } from './composition/collections'
export { intersection } from './composition/intersection'
export { lazy } from './composition/lazy'
export { object } from './composition/object'
export { record } from './composition/record'
export { tuple } from './composition/tuple'
export { discriminatedUnion, union } from './composition/union'
export {
  any,
  custom,
  instanceof_,
  nan,
  never,
  null_,
  symbol,
  undefined_,
  unknown,
  void_,
} from './primitives/atoms'
export { bigint } from './primitives/bigint'
export { boolean } from './primitives/boolean'
export { coerce } from './primitives/coerce'
export { date } from './primitives/date'
export { enum_, literal, nativeEnum } from './primitives/literal'

// ─── Composition helpers (function-comp wrappers over the base methods) ──────

/** `optional(schema)` — the point-free form of `schema.optional()`. */
export const optional = <T>(schema: Schema<T>): Schema<T | undefined> => schema.optional()
/** `nullable(schema)` — the point-free form of `schema.nullable()`. */
export const nullable = <T>(schema: Schema<T>): Schema<T | null> => schema.nullable()
/** `nullish(schema)` — the point-free form of `schema.nullish()`. */
export const nullish = <T>(schema: Schema<T>): Schema<T | null | undefined> => schema.nullish()

// ─── pipe — apply actions point-free ─────────────────────────────────────────

/**
 * Apply a sequence of actions to a schema, left-to-right, returning it.
 *
 * @example
 * import { pipe, string, minLength, email } from '@pyreon/validate/mini'
 * const schema = pipe(string(), minLength(2), email())
 */
export function pipe<S extends Schema<unknown>>(
  schema: S,
  ...actions: ReadonlyArray<(s: S) => S>
): S {
  for (const action of actions) action(schema)
  return schema
}

// ─── Check actions ───────────────────────────────────────────────────────────

export * from './actions/string'
export * from './actions/number'

// ─── Shared types + core surface ─────────────────────────────────────────────

export { type Action, type Result, Schema } from './core/schema'
export { type Infer, type Input, type Output } from './core/infer'
export { type PyreonIssue, type StandardSchemaIssue, ValidationError } from './core/issue'
export type { CheckOpts } from './core/ops'
