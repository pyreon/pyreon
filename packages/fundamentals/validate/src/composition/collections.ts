/**
 * `MapSchema<K, V>` — validates a native `Map`, every key against the key
 * schema and every value against the value schema. `SetSchema<V>` —
 * validates a native `Set`, every member against the value schema. Both
 * build a fresh Map/Set of the validated entries.
 */

import { makeIssue } from '../core/issue'
import { mutablePath, type CheckOpts, type Op, type ParseCtx } from '../core/ops'
import { attachCheck, makeCheckIssue, Schema as SchemaBase } from '../core/schema'
import type { Schema } from '../core/schema'

type SizeKind = 'check:collection:min' | 'check:collection:max' | 'check:collection:size'

/**
 * Push a `.size`-based check onto a Set/Map schema. Runs after `_compileType`
 * (in the shared checks pass) against the validated collection; both `Set` and
 * `Map` expose `.size`, so one helper serves both.
 */
function pushSizeCheck<S extends SchemaBase<unknown>>(schema: S, kind: SizeKind, n: number, opts?: CheckOpts): S {
  ;(schema as unknown as { _ops: Op[] })._ops.push(
    attachCheck({ kind, n, opts } as Op, (value, ctx) => {
      const size = value instanceof Set || value instanceof Map ? value.size : undefined
      if (size === undefined) return
      const ok = kind === 'check:collection:min' ? size >= n : kind === 'check:collection:max' ? size <= n : size === n
      if (ok) return
      const code = kind === 'check:collection:max' ? 'too_big' : kind === 'check:collection:min' ? 'too_small' : 'wrong_size'
      const word = kind === 'check:collection:min' ? `at least ${n}` : kind === 'check:collection:max' ? `at most ${n}` : `exactly ${n}`
      ctx.issues.push(
        makeCheckIssue(code, `Must have ${word} items`, `validate.collection.${kind.split(':')[2]}`, { n, actual: size }, `Must have ${word} items`, ctx, opts),
      )
    }),
  )
  ;(schema as unknown as { _invalidateCompile(): void })._invalidateCompile()
  return schema
}

export class MapSchema<K, V> extends SchemaBase<Map<K, V>> {
  readonly _kind = 'map' as const
  readonly key: Schema<K>
  readonly value: Schema<V>

  constructor(key: Schema<K>, value: Schema<V>) {
    super()
    this.key = key
    this.value = value
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (!(input instanceof Map)) {
      ctx.issues.push(
        makeIssue({ code: 'wrong_type', key: 'validate.map.required', fallback: 'Expected a Map', message: 'Expected a Map', path: ctx.path }),
      )
      return input
    }
    const out = new Map<unknown, unknown>()
    const beforeAll = ctx.issues.length
    let pending: Array<Promise<[unknown, unknown]>> | null = null
    let i = 0
    for (const [k, v] of input) {
      mutablePath(ctx).push(i)
      try {
        const before = ctx.issues.length
        const kv = this.key._runInto(k, ctx)
        const vv = this.value._runInto(v, ctx)
        if (kv instanceof Promise || vv instanceof Promise) {
          // Async entry (async `.refine`/`.transform`/registered `.serverCheck`)
          // — collect it; the whole Map resolves once every entry settles.
          // `parseAsync` awaits; sync `parse()` reports async-in-sync at root.
          ;(pending ??= []).push(Promise.all([kv, vv]))
        } else if (ctx.issues.length === before) {
          out.set(kv, vv)
        }
      } finally {
        ctx.path.pop()
      }
      i++
    }
    if (!pending) return out
    return Promise.all(pending).then((entries) => {
      // The output only escapes when the parse produced NO issues, so
      // per-entry issue attribution is unnecessary — on any failure the
      // whole result is discarded by the caller.
      if (ctx.issues.length === beforeAll) {
        for (const [kv, vv] of entries) out.set(kv, vv)
      }
      return out
    })
  }

  /** Require at least `n` entries. */
  min(n: number, opts?: CheckOpts): this {
    return pushSizeCheck(this, 'check:collection:min', n, opts)
  }
  /** Require at most `n` entries. */
  max(n: number, opts?: CheckOpts): this {
    return pushSizeCheck(this, 'check:collection:max', n, opts)
  }
  /** Require exactly `n` entries. */
  size(n: number, opts?: CheckOpts): this {
    return pushSizeCheck(this, 'check:collection:size', n, opts)
  }
}

export function map<K, V>(key: Schema<K>, value: Schema<V>): MapSchema<K, V> {
  return new MapSchema(key, value)
}

export class SetSchema<V> extends SchemaBase<Set<V>> {
  readonly _kind = 'set' as const
  readonly value: Schema<V>

  constructor(value: Schema<V>) {
    super()
    this.value = value
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (!(input instanceof Set)) {
      ctx.issues.push(
        makeIssue({ code: 'wrong_type', key: 'validate.set.required', fallback: 'Expected a Set', message: 'Expected a Set', path: ctx.path }),
      )
      return input
    }
    const out = new Set<unknown>()
    const beforeAll = ctx.issues.length
    let pending: Array<Promise<unknown>> | null = null
    let i = 0
    for (const v of input) {
      mutablePath(ctx).push(i)
      try {
        const before = ctx.issues.length
        const vv = this.value._runInto(v, ctx)
        if (vv instanceof Promise) {
          // Async member — collect it (see MapSchema note above).
          ;(pending ??= []).push(vv)
        } else if (ctx.issues.length === before) {
          out.add(vv)
        }
      } finally {
        ctx.path.pop()
      }
      i++
    }
    if (!pending) return out
    return Promise.all(pending).then((values) => {
      if (ctx.issues.length === beforeAll) for (const vv of values) out.add(vv)
      return out
    })
  }

  /** Require at least `n` members. */
  min(n: number, opts?: CheckOpts): this {
    return pushSizeCheck(this, 'check:collection:min', n, opts)
  }
  /** Require at most `n` members. */
  max(n: number, opts?: CheckOpts): this {
    return pushSizeCheck(this, 'check:collection:max', n, opts)
  }
  /** Require exactly `n` members. */
  size(n: number, opts?: CheckOpts): this {
    return pushSizeCheck(this, 'check:collection:size', n, opts)
  }
  /** Require at least one member. */
  nonEmpty(opts?: CheckOpts): this {
    return pushSizeCheck(this, 'check:collection:min', 1, opts)
  }
}

export function set<V>(value: Schema<V>): SetSchema<V> {
  return new SetSchema(value)
}
