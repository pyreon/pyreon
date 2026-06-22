/**
 * `ObjectSchema<T>` — validates plain objects with named fields, each
 * field's value validated by its own schema. The most-used composition
 * in real apps (forms, API payloads, route params, etc.).
 *
 * Type inference: `s.object({ a: s.string(), b: s.number() })` infers
 * as `Schema<{ a: string; b: number }>`. `.optional()` fields infer as
 * optional keys (`b?:`). We use a single mapped type — flat, no recursive
 * blowup at tsc time.
 *
 * Unknown-key policy (Zod-style):
 *   - `.strip()` (DEFAULT) — unknown keys are dropped from the output.
 *   - `.strict()` — unknown keys are a validation error.
 *   - `.passthrough()` — unknown keys are kept on the output verbatim.
 *
 * Object algebra: `.pick` / `.omit` / `.partial` / `.extend` / `.merge`
 * / `.keyof` — each returns a NEW schema (immutable).
 */

import { makeIssue, typeIssue } from '../core/issue'
import type { ParseCtx } from '../core/ops'
import { NullishSchema, OptionalSchema, Schema as SchemaBase } from '../core/schema'
import type { Schema } from '../core/schema'
import { EnumSchema } from '../primitives/literal'

type Shape = Record<string, Schema<unknown>>

/** Collapse an intersection into a single object literal for readable types. */
type Prettify<T> = { [K in keyof T]: T[K] } & {}

/**
 * Keys whose schema is `.optional()` / `.nullish()` — these become
 * OPTIONAL keys (`k?:`) in the inferred type, matching Zod. (`.nullable()`
 * stays a required key of type `T | null`.)
 */
type OptionalFieldKeys<TShape extends Shape> = {
  [K in keyof TShape]: TShape[K] extends OptionalSchema<unknown>
    ? K
    : TShape[K] extends NullishSchema<unknown>
      ? K
      : never
}[keyof TShape]

/**
 * Extract the output type from a shape. `.optional()` / `.nullish()`
 * fields produce true optional keys (`k?: T`); all others are required.
 * Flat split mapped type — no recursive blowup at tsc time.
 */
type InferShape<TShape extends Shape> = Prettify<
  {
    [K in Exclude<keyof TShape, OptionalFieldKeys<TShape>>]: TShape[K] extends Schema<infer T> ? T : never
  } & {
    [K in OptionalFieldKeys<TShape>]?: TShape[K] extends Schema<infer T> ? T : never
  }
>

type UnknownKeys = 'strip' | 'strict' | 'passthrough'

/** Make every field of a shape optional (for `.partial()`). */
type PartialShape<TShape extends Shape> = {
  [K in keyof TShape]: TShape[K] extends Schema<infer T> ? OptionalSchema<T> : never
}

export class ObjectSchema<TShape extends Shape> extends SchemaBase<InferShape<TShape>> {
  readonly _kind = 'object' as const
  readonly shape: TShape
  readonly _unknownKeys: UnknownKeys

  constructor(shape: TShape, unknownKeys: UnknownKeys = 'strip') {
    super()
    this.shape = shape
    this._unknownKeys = unknownKeys
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      ctx.issues.push(typeIssue('object', input, ctx.path))
      return input
    }
    const result: Record<string, unknown> = {}
    const source = input as Record<string, unknown>
    const known = this.shape
    for (const key of Object.keys(known)) {
      ctx.path.push(key)
      try {
        const value = runFieldValidator(known[key]!, source[key], ctx)
        if (value !== undefined || key in source) {
          assignSafe(result, key, value)
        }
      } finally {
        ctx.path.pop()
      }
    }
    // Unknown-key policy.
    if (this._unknownKeys !== 'strip') {
      for (const key of Object.keys(source)) {
        if (key in known) continue
        if (this._unknownKeys === 'strict') {
          ctx.issues.push(
            makeIssue({
              code: 'unrecognized_keys',
              key: 'validate.object.unrecognized-key',
              params: { key },
              fallback: `Unrecognized key "${key}"`,
              message: `Unrecognized key "${key}"`,
              path: [...ctx.path, key],
            }),
          )
        } else {
          assignSafe(result, key, source[key]) // passthrough
        }
      }
    }
    return result
  }

  // ─── Unknown-key policy ────────────────────────────────────────────

  /** Drop unknown keys from the output (the default). */
  strip(): ObjectSchema<TShape> {
    return new ObjectSchema(this.shape, 'strip')
  }

  /** Treat unknown keys as a validation error. */
  strict(): ObjectSchema<TShape> {
    return new ObjectSchema(this.shape, 'strict')
  }

  /** Keep unknown keys on the output verbatim. */
  passthrough(): ObjectSchema<TShape> {
    return new ObjectSchema(this.shape, 'passthrough')
  }

  // ─── Object algebra (each returns a new schema) ────────────────────

  /** Keep only the named keys. */
  pick<K extends keyof TShape>(keys: readonly K[]): ObjectSchema<Pick<TShape, K>> {
    const next = {} as Pick<TShape, K>
    for (const k of keys) next[k] = this.shape[k]
    return new ObjectSchema(next, this._unknownKeys)
  }

  /** Drop the named keys. */
  omit<K extends keyof TShape>(keys: readonly K[]): ObjectSchema<Omit<TShape, K>> {
    const drop = new Set<PropertyKey>(keys)
    const next: Record<string, Schema<unknown>> = {}
    for (const k of Object.keys(this.shape)) {
      if (!drop.has(k)) next[k] = this.shape[k]!
    }
    return new ObjectSchema(next as Omit<TShape, K>, this._unknownKeys)
  }

  /** Make every field optional. */
  partial(): ObjectSchema<PartialShape<TShape>> {
    const next: Record<string, Schema<unknown>> = {}
    for (const k of Object.keys(this.shape)) {
      const field = this.shape[k]!
      next[k] = field instanceof OptionalSchema ? field : field.optional()
    }
    return new ObjectSchema(next as PartialShape<TShape>, this._unknownKeys)
  }

  /** Add / override fields. */
  extend<TExt extends Shape>(ext: TExt): ObjectSchema<Omit<TShape, keyof TExt> & TExt> {
    return new ObjectSchema({ ...this.shape, ...ext } as Omit<TShape, keyof TExt> & TExt, this._unknownKeys)
  }

  /** Merge another object schema's shape into this one (other wins on conflict). */
  merge<TOther extends Shape>(other: ObjectSchema<TOther>): ObjectSchema<Omit<TShape, keyof TOther> & TOther> {
    return this.extend(other.shape)
  }

  /** An enum schema over this object's keys. */
  keyof(): EnumSchema<readonly (keyof TShape & string)[]> {
    return new EnumSchema(Object.keys(this.shape) as readonly (keyof TShape & string)[])
  }
}

/** Prototype-pollution-safe property assignment. */
function assignSafe(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
  } else {
    target[key] = value
  }
}

/**
 * Call a child schema's compiled validator with the PARENT's ctx so
 * paths + issues merge into one place. Internal to ObjectSchema (and
 * ArraySchema below).
 */
function runFieldValidator<T>(schema: Schema<T>, input: unknown, parentCtx: ParseCtx): unknown {
  const r = schema['~standard'].validate(input)
  if (r instanceof Promise) {
    parentCtx.issues.push({
      message: '[Pyreon] async schema used in sync parse — use parseAsync',
      path: parentCtx.path,
    })
    return input
  }
  if ('issues' in r && r.issues) {
    for (const issue of r.issues) {
      parentCtx.issues.push({
        ...issue,
        path: [...parentCtx.path, ...(issue.path ?? [])],
      })
    }
    return input
  }
  return r.value
}

export function object<TShape extends Shape>(shape: TShape): ObjectSchema<TShape> {
  return new ObjectSchema(shape)
}
