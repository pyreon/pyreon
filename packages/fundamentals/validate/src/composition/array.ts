/**
 * `ArraySchema<T>` — validates arrays with a uniform element schema.
 *
 * Built-in checks: `min`, `max`, `length`, `nonEmpty`. Per-element
 * validation runs the element schema's compiled validator against each
 * item; issues are accumulated with `[index, ...path]` paths.
 */

import { Schema as SchemaBase, attachCheck, makeCheckIssue } from '../core/schema'
import type { Schema } from '../core/schema'
import { typeIssue } from '../core/issue'
import type { CheckOpts, ParseCtx } from '../core/ops'

export class ArraySchema<T> extends SchemaBase<T[]> {
  readonly _kind = 'array' as const
  readonly element: Schema<T>

  constructor(element: Schema<T>) {
    super()
    this.element = element
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (!Array.isArray(input)) {
      ctx.issues.push(typeIssue('array', input, ctx.path))
      return input
    }
    const out: unknown[] = []
    for (let i = 0; i < input.length; i++) {
      ctx.path.push(i)
      try {
        const before = ctx.issues.length
        const v = this.element._runInto(input[i], ctx)
        if (v instanceof Promise) {
          ctx.issues.push({
            message: '[Pyreon] async element schema used in sync parse — use parseAsync',
            path: ctx.path,
          })
        } else if (ctx.issues.length === before) {
          out.push(v)
        }
      } finally {
        ctx.path.pop()
      }
    }
    return out
  }

  // ─── Length checks ─────────────────────────────────────────────────

  min(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:array:min', n, opts }, (value, ctx) => {
        if (!Array.isArray(value) || value.length >= n) return
        ctx.issues.push(
          makeCheckIssue(
            'too_small',
            `Must have at least ${n} items`,
            'validate.array.too-short',
            { min: n, actual: value.length },
            `Must have at least ${n} items`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  max(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:array:max', n, opts }, (value, ctx) => {
        if (!Array.isArray(value) || value.length <= n) return
        ctx.issues.push(
          makeCheckIssue(
            'too_big',
            `Must have at most ${n} items`,
            'validate.array.too-long',
            { max: n, actual: value.length },
            `Must have at most ${n} items`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  length(n: number, opts?: CheckOpts): this {
    this._ops.push(
      attachCheck({ kind: 'check:array:length', n, opts }, (value, ctx) => {
        if (!Array.isArray(value) || value.length === n) return
        ctx.issues.push(
          makeCheckIssue(
            'wrong_size',
            `Must have exactly ${n} items`,
            'validate.array.wrong-length',
            { length: n, actual: value.length },
            `Must have exactly ${n} items`,
            ctx,
            opts,
          ),
        )
      }),
    )
    this._invalidateCompile()
    return this
  }

  nonEmpty(opts?: CheckOpts): this {
    return this.min(1, opts)
  }
}

export function array<T>(element: Schema<T>): ArraySchema<T> {
  return new ArraySchema(element)
}
