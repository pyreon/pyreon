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

export class RecordSchema<V> extends SchemaBase<Record<string, V>> {
  readonly _kind = 'record' as const
  readonly value: Schema<V>

  constructor(value: Schema<V>) {
    super()
    this.value = value
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

export function record<V>(value: Schema<V>): RecordSchema<V> {
  return new RecordSchema(value)
}
