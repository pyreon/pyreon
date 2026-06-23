/**
 * `ArraySchema<T>` — validates arrays with a uniform element schema.
 *
 * Built-in checks: `min`, `max`, `length`, `nonEmpty`. Per-element
 * validation runs the element schema's compiled validator against each
 * item; issues are accumulated with `[index, ...path]` paths.
 */

import { Schema as SchemaBase, attachCheck, makeCheckIssue, registerArrayFactory } from '../core/schema'
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
    // An element validator that returns a Promise (an async `.serverCheck` /
    // `.refine` under `parseAsync`) reserves its output slot now and is filled
    // after the await; if any element is async the whole array resolves to a
    // Promise. The all-sync path is unchanged — no Promise allocation.
    let pending: Array<{ slot: number; promise: Promise<unknown> }> | null = null
    for (let i = 0; i < input.length; i++) {
      ctx.path.push(i)
      try {
        const before = ctx.issues.length
        const v = this.element._runInto(input[i], ctx)
        if (v instanceof Promise) {
          const slot = out.length
          out.push(undefined)
          ;(pending ??= []).push({ slot, promise: v })
        } else if (ctx.issues.length === before) {
          out.push(v)
        }
      } finally {
        ctx.path.pop()
      }
    }
    if (!pending) return out
    const pend = pending
    return Promise.all(pend.map((p) => p.promise)).then((resolved) => {
      for (let i = 0; i < pend.length; i++) out[pend[i]!.slot] = resolved[i]
      return out
    })
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

// The factory registers itself with the base class from this initializer (so
// `s.string().array()` works), tree-shake-safe: the call only runs when the
// `array` export is actually included in a consumer's bundle.
export const array = registerArrayFactory(<T>(element: Schema<T>): ArraySchema<T> => new ArraySchema(element))
