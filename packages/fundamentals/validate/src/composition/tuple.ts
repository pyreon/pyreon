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

export class TupleSchema<T extends readonly AnySchema[]> extends SchemaBase<InferTuple<T>> {
  readonly _kind = 'tuple' as const
  readonly items: T

  constructor(items: T) {
    super()
    this.items = items
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (!Array.isArray(input)) {
      ctx.issues.push(typeIssue('array', input, ctx.path))
      return input
    }
    if (input.length !== this.items.length) {
      ctx.issues.push(
        makeIssue({
          code: 'wrong_size',
          key: 'validate.tuple.wrong-length',
          params: { expected: this.items.length, actual: input.length },
          fallback: `Expected a tuple of length ${this.items.length}, got ${input.length}`,
          message: `Expected a tuple of length ${this.items.length}, got ${input.length}`,
          path: ctx.path,
        }),
      )
      return input
    }
    const out: unknown[] = []
    for (let i = 0; i < this.items.length; i++) {
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
    return out
  }
}

export function tuple<T extends readonly [AnySchema, ...AnySchema[]]>(items: T): TupleSchema<T> {
  return new TupleSchema(items)
}
