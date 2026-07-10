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
import type { PathSegment } from '../core/issue'
import type { ParseCtx } from '../core/ops'
import { Schema as SchemaBase, registerUnionFactory } from '../core/schema'
import type { Schema } from '../core/schema'
import { EnumSchema, LiteralSchema, NativeEnumSchema } from '../primitives/literal'
import { ObjectSchema } from './object'

type AnySchema = Schema<unknown>
type InferUnion<T extends readonly AnySchema[]> = T[number] extends Schema<infer U> ? U : never

export class UnionSchema<T extends readonly AnySchema[]> extends SchemaBase<InferUnion<T>> {
  readonly _kind = 'union' as const
  readonly members: T

  constructor(members: T) {
    super()
    // Guard non-schema members with a clear, actionable message. Without
    // this, a bad member (e.g. a nested array from the wrong call form, or
    // `undefined` from a typo) surfaces at PARSE time as a cryptic
    // `member['~standard'] is undefined` deep in `_compileType`. A union of
    // fewer than two members is almost always a mistake, too.
    if (process.env.NODE_ENV !== 'production') {
      if (!Array.isArray(members) || members.length < 2) {
        throw new Error(
          `[Pyreon] s.union(...) needs at least two member schemas — got ${
            Array.isArray(members) ? members.length : typeof members
          }. Call as s.union(a, b) or s.union([a, b]).`,
        )
      }
      for (const m of members) {
        if (!m || typeof (m as { ['~standard']?: unknown })['~standard'] !== 'object') {
          throw new Error(
            '[Pyreon] s.union(...) received a non-schema member. Each member must be a schema, e.g. s.union(s.string(), s.number()) or s.union([s.string(), s.number()]).',
          )
        }
      }
    }
    this.members = members
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    // Members run against the SHARED ctx (no per-member ctx/result-object
    // allocation — the old `~standard.validate`-per-member form allocated a
    // fresh ctx + result envelope per member per parse, and DROPPED a winning
    // member's `pending` serverCheck entries). A failed member's issues (and
    // any pending entries it deferred) are truncated back before trying the
    // next member; only the single `invalid_union` issue survives a full miss.
    const members = this.members
    const issuesBefore = ctx.issues.length
    const pendingBefore = ctx.pending?.length ?? 0
    for (let i = 0; i < members.length; i++) {
      const v = members[i]!._runInto(input, ctx)
      if (v instanceof Promise) {
        // Async member (async `.refine`/`.transform`/registered `.serverCheck`)
        // — continue the member scan asynchronously. `parseAsync` awaits this;
        // a sync `parse()` sees the Promise at the root and reports the
        // async-in-sync issue (same contract as async object fields).
        return this._continueAsync(v, i, input, ctx, issuesBefore, pendingBefore, ctx.path.slice())
      }
      if (ctx.issues.length === issuesBefore) return v
      truncate(ctx, issuesBefore, pendingBefore)
    }
    ctx.issues.push(unionMissIssue(ctx.path))
    return input
  }

  /** Resume the member scan after member `i` returned a Promise. */
  private async _continueAsync(
    first: Promise<unknown>,
    i: number,
    input: unknown,
    ctx: ParseCtx,
    issuesBefore: number,
    pendingBefore: number,
    pathSnap: PathSegment[],
  ): Promise<unknown> {
    const v = await first
    if (ctx.issues.length === issuesBefore) return v
    truncate(ctx, issuesBefore, pendingBefore)
    const members = this.members
    for (let j = i + 1; j < members.length; j++) {
      // The parse's sync frame has unwound by now, so ctx.path no longer
      // reflects this union's position — reinstate the snapshot around the
      // member's SYNC run (its own async parts snapshot internally, per the
      // serverCheck pattern), then restore whatever was there.
      const saved = ctx.path.splice(0, ctx.path.length, ...pathSnap)
      const r = members[j]!._runInto(input, ctx)
      ctx.path.splice(0, ctx.path.length, ...saved)
      const vv = r instanceof Promise ? await r : r
      if (ctx.issues.length === issuesBefore) return vv
      truncate(ctx, issuesBefore, pendingBefore)
    }
    ctx.issues.push(unionMissIssue(pathSnap))
    return input
  }
}

/** Reset the shared ctx back to a failed member's entry state. */
function truncate(ctx: ParseCtx, issuesBefore: number, pendingBefore: number): void {
  ctx.issues.length = issuesBefore
  if (ctx.pending && ctx.pending.length > pendingBefore) ctx.pending.length = pendingBefore
}

function unionMissIssue(path: ReadonlyArray<PathSegment>) {
  return makeIssue({
    code: 'invalid_union',
    key: 'validate.union.no-match',
    fallback: 'Did not match any allowed type',
    message: 'Did not match any allowed type',
    path,
  })
}

// `s.union` accepts BOTH the rest-args form (`s.union(a, b)` — also the
// `.or()` path) AND the array form (`s.union([a, b])` — matching Zod /
// Valibot / ArkType, and consistent with `s.tuple([...])` / `s.enum([...])`).
// A single array argument is treated as the member list; otherwise the args
// ARE the members. Unambiguous: a schema is never an array, and the ≥2
// constraint holds for both forms. The array overload is additive — the prior
// rest-only signature made `s.union([a, b])` a type error, so no valid call
// breaks.
export interface UnionFactory {
  <T extends readonly [AnySchema, AnySchema, ...AnySchema[]]>(...members: T): UnionSchema<T>
  <T extends readonly [AnySchema, AnySchema, ...AnySchema[]]>(members: T): UnionSchema<T>
}

// Self-registers the factory from this initializer (tree-shake-safe).
export const union: UnionFactory = registerUnionFactory(((...args: unknown[]) => {
  const members =
    args.length === 1 && Array.isArray(args[0]) ? (args[0] as readonly AnySchema[]) : args
  return new UnionSchema(members as readonly [AnySchema, AnySchema, ...AnySchema[]])
}) as UnionFactory)

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
      // A discriminant may be a literal (`s.literal('a')`), an enum
      // (`s.enum(['a','b'])` — the member owns several tag values), or a
      // native enum. Register every value → member.
      const values =
        field instanceof LiteralSchema
          ? [field.value]
          : field instanceof EnumSchema || field instanceof NativeEnumSchema
            ? field.values
            : undefined
      if (process.env.NODE_ENV !== 'production') {
        if (values === undefined) {
          throw new Error(
            `[Pyreon] s.discriminatedUnion('${discriminant}', ...): a member's "${discriminant}" field is not a literal/enum/nativeEnum schema — its tag value(s) cannot be registered, so that member would be unreachable. Use s.literal(...) (or s.enum([...])) for the discriminant field.`,
          )
        }
        for (const v of values) {
          if (this._map.has(v)) {
            throw new Error(
              `[Pyreon] s.discriminatedUnion('${discriminant}', ...): duplicate discriminant value ${String(v)} — two members claim the same tag, the second would be unreachable.`,
            )
          }
        }
      }
      if (values) for (const v of values) this._map.set(v, member)
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
    // The discriminant has selected the one definitive member — validate it
    // against the shared ctx (its issues should surface), zero extra alloc.
    // An async member (async `.refine`/`.transform`/registered `.serverCheck`)
    // returns its Promise through — `parseAsync` awaits it; a sync `parse()`
    // sees the Promise at the root and reports the async-in-sync issue.
    return member._runInto(input, ctx)
  }
}

export function discriminatedUnion<K extends string, T extends readonly [AnyObject, ...AnyObject[]]>(
  discriminant: K,
  members: T,
): DiscriminatedUnionSchema<K, T> {
  return new DiscriminatedUnionSchema(discriminant, members)
}
