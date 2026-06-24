/**
 * `TupleSchema` — a fixed-length array with a per-position element schema
 * (`s.tuple([s.string(), s.number()])` → `[string, number]`). Validates
 * length + each position; extra elements are rejected.
 */

import type { ParseCtx } from '../core/ops'
import { makeIssue, typeIssue } from '../core/issue'
import { Schema as SchemaBase } from '../core/schema'
import type { Schema } from '../core/schema'

type AnySchema = Schema<unknown>
type InferTuple<T extends readonly AnySchema[]> = {
  -readonly [K in keyof T]: T[K] extends Schema<infer U> ? U : never
}

export class TupleSchema<T extends readonly AnySchema[], Rest = never> extends SchemaBase<
  [Rest] extends [never] ? InferTuple<T> : [...InferTuple<T>, ...Rest[]]
> {
  readonly _kind = 'tuple' as const
  readonly items: T
  /** When set, EXTRA elements past the fixed positions are validated against this (Zod's `.rest`). */
  readonly restSchema: Schema<Rest> | undefined

  constructor(items: T, restSchema?: Schema<Rest>) {
    super()
    this.items = items
    this.restSchema = restSchema
  }

  /**
   * Allow a variadic tail validated against `schema` — `s.tuple([s.string()]).rest(s.number())`
   * accepts `[string, ...number[]]` (Zod's `.rest`). Without it, extra elements are rejected.
   */
  rest<R>(schema: Schema<R>): TupleSchema<T, R> {
    return new TupleSchema(this.items, schema)
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (!Array.isArray(input)) {
      ctx.issues.push(typeIssue('array', input, ctx.path))
      return input
    }
    const fixed = this.items.length
    // With a rest schema, length must be AT LEAST the fixed count; without, exact.
    const lengthBad = this.restSchema ? input.length < fixed : input.length !== fixed
    if (lengthBad) {
      const expected = this.restSchema ? `at least ${fixed}` : `${fixed}`
      ctx.issues.push(
        makeIssue({
          code: 'wrong_size',
          key: 'validate.tuple.wrong-length',
          params: { expected: fixed, actual: input.length, rest: Boolean(this.restSchema) },
          fallback: `Expected a tuple of length ${expected}, got ${input.length}`,
          message: `Expected a tuple of length ${expected}, got ${input.length}`,
          path: ctx.path,
        }),
      )
      return input
    }
    const out: unknown[] = []
    for (let i = 0; i < fixed; i++) {
      ctx.path.push(i)
      try {
        const before = ctx.issues.length
        const v = this.items[i]!._runInto(input[i], ctx)
        if (v instanceof Promise) {
          ctx.issues.push({ message: '[Pyreon] async element in sync parse — use parseAsync', path: ctx.path })
        } else if (ctx.issues.length === before) {
          out.push(v)
        }
      } finally {
        ctx.path.pop()
      }
    }
    // Validate the variadic tail (if any) against the rest schema.
    if (this.restSchema) {
      for (let i = fixed; i < input.length; i++) {
        ctx.path.push(i)
        try {
          const before = ctx.issues.length
          const v = this.restSchema._runInto(input[i], ctx)
          if (v instanceof Promise) {
            ctx.issues.push({ message: '[Pyreon] async element in sync parse — use parseAsync', path: ctx.path })
          } else if (ctx.issues.length === before) {
            out.push(v)
          }
        } finally {
          ctx.path.pop()
        }
      }
    }
    return out
  }
}

export function tuple<T extends readonly [AnySchema, ...AnySchema[]]>(items: T): TupleSchema<T> {
  return new TupleSchema(items)
}
