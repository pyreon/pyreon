/**
 * `UnionSchema` — matches if the input satisfies ANY member schema
 * (`s.union(s.string(), s.number())` → `string | number`). Tries members
 * in order; the first that validates wins. If none match, emits a single
 * `invalid_union` issue (member issues are not surfaced individually to
 * avoid noise — same UX as Zod's union).
 *
 * `DiscriminatedUnionSchema` — an O(1) union over object members keyed by
 * a shared literal discriminant field (`s.discriminatedUnion('kind', [...])`).
 * Reads the discriminant off the input, dispatches to the one matching
 * member — faster and yields a precise error instead of "matched nothing".
 */

import { makeIssue } from '../core/issue'
import type { ParseCtx } from '../core/ops'
import { Schema as SchemaBase } from '../core/schema'
import type { Schema } from '../core/schema'
import { LiteralSchema } from '../primitives/literal'
import { ObjectSchema } from './object'

type AnySchema = Schema<unknown>
type InferUnion<T extends readonly AnySchema[]> = T[number] extends Schema<infer U> ? U : never

export class UnionSchema<T extends readonly AnySchema[]> extends SchemaBase<InferUnion<T>> {
  readonly _kind = 'union' as const
  readonly members: T

  constructor(members: T) {
    super()
    this.members = members
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    for (const member of this.members) {
      const r = member['~standard'].validate(input)
      if (r instanceof Promise) {
        ctx.issues.push({
          message: '[Pyreon] async member in sync union parse — use parseAsync',
          path: ctx.path,
        })
        return input
      }
      if (!('issues' in r) || !r.issues) return r.value
    }
    ctx.issues.push(
      makeIssue({
        code: 'invalid_union',
        key: 'validate.union.no-match',
        fallback: 'Did not match any allowed type',
        message: 'Did not match any allowed type',
        path: ctx.path,
      }),
    )
    return input
  }
}

export function union<T extends readonly [AnySchema, AnySchema, ...AnySchema[]]>(
  ...members: T
): UnionSchema<T> {
  return new UnionSchema(members)
}

// ─── Discriminated union ───────────────────────────────────────────────

// Constraint only — kept permissive so `.partial()`'s mapped return type
// doesn't make `ObjectSchema` invariant and reject concrete members. The
// actual member tuple `T` is still inferred concretely at the call site,
// so `InferObjUnion<T>` stays strict.
// oxlint-disable-next-line typescript/no-explicit-any
type AnyObject = ObjectSchema<any>
type InferObjUnion<T extends readonly AnyObject[]> = T[number] extends Schema<infer U> ? U : never

export class DiscriminatedUnionSchema<
  K extends string,
  T extends readonly AnyObject[],
> extends SchemaBase<InferObjUnion<T>> {
  readonly _kind = 'discriminatedUnion' as const
  readonly discriminant: K
  readonly members: T
  /** discriminant literal value → member object schema */
  private readonly _map: Map<unknown, AnyObject>

  constructor(discriminant: K, members: T) {
    super()
    this.discriminant = discriminant
    this.members = members
    this._map = new Map()
    for (const member of members) {
      const field = member.shape[discriminant]
      if (field instanceof LiteralSchema) this._map.set(field.value, member)
    }
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      ctx.issues.push(
        makeIssue({
          code: 'invalid_type',
          key: 'validate.discriminated-union.not-object',
          fallback: 'Expected an object',
          message: 'Expected an object',
          path: ctx.path,
        }),
      )
      return input
    }
    const tag = (input as Record<string, unknown>)[this.discriminant]
    const member = this._map.get(tag)
    if (!member) {
      ctx.issues.push(
        makeIssue({
          code: 'invalid_union_discriminator',
          key: 'validate.discriminated-union.bad-discriminator',
          params: { discriminant: this.discriminant, received: tag, expected: [...this._map.keys()] },
          fallback: `Invalid discriminator value for "${this.discriminant}"`,
          message: `Invalid discriminator value for "${this.discriminant}"`,
          path: [...ctx.path, this.discriminant],
        }),
      )
      return input
    }
    const r = member['~standard'].validate(input)
    if (r instanceof Promise) {
      ctx.issues.push({ message: '[Pyreon] async member in sync parse — use parseAsync', path: ctx.path })
      return input
    }
    if ('issues' in r && r.issues) {
      for (const issue of r.issues) {
        ctx.issues.push({ ...issue, path: [...ctx.path, ...(issue.path ?? [])] })
      }
      return input
    }
    return r.value
  }
}

export function discriminatedUnion<K extends string, T extends readonly [AnyObject, ...AnyObject[]]>(
  discriminant: K,
  members: T,
): DiscriminatedUnionSchema<K, T> {
  return new DiscriminatedUnionSchema(discriminant, members)
}
