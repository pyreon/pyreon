/**
 * `RecordSchema<V>` — a dictionary of string keys → values validated by a
 * single value schema (`s.record(s.number())` → `Record<string, number>`).
 * Every own-enumerable key's value is validated; issues carry the key in
 * their path. Prototype-pollution-safe: a `__proto__` key is written as an
 * own data property (never mutates the prototype).
 */

import type { ParseCtx } from '../core/ops'
import { typeIssue } from '../core/issue'
import { Schema as SchemaBase } from '../core/schema'
import type { Schema } from '../core/schema'

/** Prototype-pollution-safe property assignment. */
function assignSafe(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
  } else {
    target[key] = value
  }
}

export class RecordSchema<K extends PropertyKey, V> extends SchemaBase<Record<K, V>> {
  readonly _kind = 'record' as const
  /** Optional key schema — when set, each own key is validated against it (Zod's `z.record(keySchema, valueSchema)`). */
  readonly keySchema: Schema<K> | undefined
  readonly value: Schema<V>

  constructor(value: Schema<V>, keySchema?: Schema<K>) {
    super()
    this.value = value
    this.keySchema = keySchema
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      ctx.issues.push(typeIssue('object', input, ctx.path))
      return input
    }
    const out: Record<string, unknown> = {}
    const source = input as Record<string, unknown>
    const beforeAll = ctx.issues.length
    let pending: Array<{ key: string; promise: Promise<unknown> }> | null = null
    for (const key of Object.keys(source)) {
      ctx.path.push(key)
      try {
        const before = ctx.issues.length
        // Validate the KEY (if a key schema is set). Keys from Object.keys are
        // strings; the key schema (e.g. an enum or `s.string().regex(...)`)
        // constrains which keys are allowed.
        if (this.keySchema) {
          const kv = this.keySchema._runInto(key, ctx)
          if (kv instanceof Promise) {
            // Async key schema (async `.refine`/registered `.serverCheck`) —
            // chain the value validation behind it. `parseAsync` awaits; a
            // sync `parse()` reports async-in-sync at the root.
            ;(pending ??= []).push({ key, promise: kv.then(() => this.value._runInto(source[key], ctx)) })
            continue
          }
          if (ctx.issues.length !== before) continue // invalid key → skip this entry
        }
        const v = this.value._runInto(source[key], ctx)
        if (v instanceof Promise) {
          ;(pending ??= []).push({ key, promise: v })
          continue
        }
        if (ctx.issues.length !== before) continue
        assignSafe(out, key, v)
      } finally {
        ctx.path.pop()
      }
    }
    if (!pending) return out
    const pend = pending
    return Promise.all(pend.map((p) => p.promise)).then((resolved) => {
      // The output only escapes when the parse produced NO issues — on any
      // failure the caller discards it, so per-entry attribution is unneeded.
      if (ctx.issues.length === beforeAll) {
        for (let i = 0; i < pend.length; i++) assignSafe(out, pend[i]!.key, resolved[i])
      }
      return out
    })
  }
}

// `s.record(valueSchema)` → Record<string, V>; `s.record(keySchema, valueSchema)`
// → Record<K, V> with each key validated against `keySchema`.
export function record<V>(value: Schema<V>): RecordSchema<string, V>
export function record<K extends PropertyKey, V>(key: Schema<K>, value: Schema<V>): RecordSchema<K, V>
export function record(keyOrValue: Schema<unknown>, value?: Schema<unknown>): RecordSchema<PropertyKey, unknown> {
  return value
    ? new RecordSchema(value, keyOrValue as Schema<PropertyKey>)
    : new RecordSchema(keyOrValue as Schema<unknown>)
}
