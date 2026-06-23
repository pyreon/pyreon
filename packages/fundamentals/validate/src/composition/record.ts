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
            ctx.issues.push({ message: '[Pyreon] async key schema in sync parse — use parseAsync', path: ctx.path })
            continue
          }
          if (ctx.issues.length !== before) continue // invalid key → skip this entry
        }
        const v = this.value._runInto(source[key], ctx)
        if (v instanceof Promise) {
          ctx.issues.push({ message: '[Pyreon] async value schema in sync parse — use parseAsync', path: ctx.path })
          continue
        }
        if (ctx.issues.length !== before) continue
        // Prototype-pollution-safe assignment.
        if (key === '__proto__') {
          Object.defineProperty(out, key, { value: v, enumerable: true, writable: true, configurable: true })
        } else {
          out[key] = v
        }
      } finally {
        ctx.path.pop()
      }
    }
    return out
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
