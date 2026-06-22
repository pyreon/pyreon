/**
 * `MapSchema<K, V>` — validates a native `Map`, every key against the key
 * schema and every value against the value schema. `SetSchema<V>` —
 * validates a native `Set`, every member against the value schema. Both
 * build a fresh Map/Set of the validated entries.
 */

import { makeIssue } from '../core/issue'
import type { ParseCtx } from '../core/ops'
import { Schema as SchemaBase } from '../core/schema'
import type { Schema } from '../core/schema'

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
    let i = 0
    for (const [k, v] of input) {
      ctx.path.push(i)
      try {
        const before = ctx.issues.length
        const kv = this.key._runInto(k, ctx)
        const vv = this.value._runInto(v, ctx)
        if (!(kv instanceof Promise) && !(vv instanceof Promise) && ctx.issues.length === before) {
          out.set(kv, vv)
        }
      } finally {
        ctx.path.pop()
      }
      i++
    }
    return out
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
    let i = 0
    for (const v of input) {
      ctx.path.push(i)
      try {
        const before = ctx.issues.length
        const vv = this.value._runInto(v, ctx)
        if (!(vv instanceof Promise) && ctx.issues.length === before) out.add(vv)
      } finally {
        ctx.path.pop()
      }
      i++
    }
    return out
  }
}

export function set<V>(value: Schema<V>): SetSchema<V> {
  return new SetSchema(value)
}
