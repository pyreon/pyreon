/**
 * `ObjectSchema<T>` — validates plain objects with named fields, each
 * field's value validated by its own schema. The most-used composition
 * in real apps (forms, API payloads, route params, etc.).
 *
 * Type inference: `s.object({ a: s.string(), b: s.number() })` infers
 * as `Schema<{ a: string; b: number }>`. We use a single mapped type
 * (`{ [K in keyof TShape]: Schema<TShape[K]> }`) — flat, no recursive
 * blowup at tsc time.
 *
 * Unknown keys are STRIPPED by default (Pyreon convention — matches
 * `@pyreon/store`'s schema-mode behaviour). Future PR may add `.strict()`
 * (Zod-style "fail on unknown") and `.passthrough()` (Zod-style "keep
 * unknown values").
 */

import { Schema as SchemaBase } from '../core/schema'
import type { Schema } from '../core/schema'
import { typeIssue } from '../core/issue'
import type { ParseCtx } from '../core/ops'

/**
 * Internal helper — extract the output type from a shape definition.
 * `{ a: Schema<string>, b: Schema<number> }` → `{ a: string; b: number }`.
 */
type Shape = Record<string, Schema<unknown>>

type InferShape<TShape extends Shape> = {
  [K in keyof TShape]: TShape[K] extends Schema<infer T> ? T : never
}

export class ObjectSchema<TShape extends Shape> extends SchemaBase<InferShape<TShape>> {
  readonly _kind = 'object' as const
  readonly shape: TShape

  constructor(shape: TShape) {
    super()
    this.shape = shape
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      ctx.issues.push(typeIssue('object', input, ctx.path))
      return input
    }
    // Per-field validation. Strip unknown keys.
    const result: Record<string, unknown> = {}
    const source = input as Record<string, unknown>
    for (const key of Object.keys(this.shape)) {
      const fieldSchema = this.shape[key]!
      ctx.path.push(key)
      try {
        // Invoke the field's compiled validator via its parse() entry
        // point — captures issues into THIS schema's ctx via a custom
        // ctx push (field schemas accumulate into the same path-aware
        // issues array).
        const fieldCtx = { issues: ctx.issues, path: ctx.path }
        const validate = (fieldSchema as unknown as { _internalCompiledFor: (c: ParseCtx) => (i: unknown, c: ParseCtx) => unknown })
        // Cheap: call the field's compiled validator directly. We
        // emulate the parse flow but share the parent ctx so paths +
        // issues are merged.
        const value = runFieldValidator(fieldSchema, source[key], fieldCtx)
        if (value !== undefined || key in source) {
          result[key] = value
        }
        void validate // keep reference to satisfy lint (used in older shapes)
      } finally {
        ctx.path.pop()
      }
    }
    return result
  }
}

/**
 * Call a child schema's compiled validator with the PARENT's ctx so
 * paths + issues merge into one place. Internal to ObjectSchema (and
 * ArraySchema below).
 */
function runFieldValidator<T>(
  schema: Schema<T>,
  input: unknown,
  parentCtx: ParseCtx,
): unknown {
  // Standard Schema's validate respects modifiers (optional/nullable/
  // default) via the prelude in `_getCompiled`. We invoke through that
  // path by reading the schema's `~standard.validate` which exists on
  // every Schema<T> instance.
  const r = schema['~standard'].validate(input)
  // We don't await — async parse needs `parseAsync` upstream. Here we
  // just check shape; if it's a Promise, we record an issue.
  if (r instanceof Promise) {
    parentCtx.issues.push({
      message: '[Pyreon] async schema used in sync parse — use parseAsync',
      path: parentCtx.path,
    })
    return input
  }
  if ('issues' in r && r.issues) {
    for (const issue of r.issues) {
      // Merge child's path into parent's path.
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
