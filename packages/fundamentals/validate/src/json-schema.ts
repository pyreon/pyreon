/**
 * `toJsonSchema(schema, options?)` — emit a JSON Schema (draft 2020-12)
 * document from a Pyreon-validate `s` schema. Walks the introspectable
 * `_kind` + `_ops` graph; no runtime dependency beyond the schema classes
 * themselves. Ships as the `@pyreon/validate/json-schema` subpath so the
 * main entry stays lean — importing the runtime never pulls the emitter.
 *
 * WHAT IS (and is not) REPRESENTED — the contract, stated precisely:
 *
 *   - The emitted document describes the INPUT shape the schema accepts
 *     (`.transform()` output types, `.pipe()` targets, and coercion results
 *     are runtime concerns JSON Schema cannot express — the emitter uses the
 *     transform's INNER schema, the pipe's SOURCE, and the coercion TARGET
 *     type respectively).
 *   - `.refine()` / `.superRefine()` / `.serverCheck()` are runtime-only
 *     predicates — structurally omitted (the structural part still emits).
 *   - UNREPRESENTABLE kinds (`date`, `bigint`, `undefined`, `void`, `nan`,
 *     `symbol`, `map`, `instanceof`, function-valued defaults aside) THROW a
 *     `[Pyreon]`-prefixed error by default; pass
 *     `{ unrepresentable: 'any' }` to emit `{}` (accept-anything) instead —
 *     the same policy split Zod 4's `z.toJSONSchema` offers.
 *   - `s.lazy()` resolves through non-cyclic thunks; a CYCLIC lazy schema
 *     throws (no `$defs`/`$ref` graph emission in v1 — documented scope).
 *
 * @example
 * ```ts
 * import { s } from '@pyreon/validate'
 * import { toJsonSchema } from '@pyreon/validate/json-schema'
 *
 * const User = s.object({
 *   name: s.string().min(2),
 *   email: s.string().email(),
 *   age: s.number().int().min(0).optional(),
 * })
 * toJsonSchema(User)
 * // {
 * //   $schema: 'https://json-schema.org/draft/2020-12/schema',
 * //   type: 'object',
 * //   properties: {
 * //     name: { type: 'string', minLength: 2 },
 * //     email: { type: 'string', format: 'email' },
 * //     age: { type: 'integer', minimum: 0 },
 * //   },
 * //   required: ['name', 'email'],
 * // }
 * ```
 */

import type { ArraySchema } from './composition/array'
import type { IntersectionSchema } from './composition/intersection'
import type { LazySchema } from './composition/lazy'
import type { SetSchema } from './composition/collections'
import type { ObjectSchema } from './composition/object'
import type { RecordSchema } from './composition/record'
import type { TupleSchema } from './composition/tuple'
import type { DiscriminatedUnionSchema, UnionSchema } from './composition/union'
import type { EnumSchema, LiteralSchema, NativeEnumSchema } from './primitives/literal'
import type { StringBoolSchema } from './primitives/stringbool'
import type { Op } from './core/ops'
import type {
  DefaultSchema,
  NonOptionalSchema,
  NullableSchema,
  NullishSchema,
  OptionalSchema,
  PipeSchema,
  PreprocessSchema,
  Schema,
  SuperRefineSchema,
  TransformSchema,
} from './core/schema'

/** A JSON Schema fragment (draft 2020-12). */
export type JsonSchema = Record<string, unknown>

export interface ToJsonSchemaOptions {
  /**
   * Policy for schema kinds JSON Schema cannot express (`date`, `bigint`,
   * `undefined`, `void`, `nan`, `symbol`, `map`, `instanceof`):
   * `'throw'` (DEFAULT) raises a `[Pyreon]`-prefixed error naming the kind;
   * `'any'` emits `{}` (accept-anything) in its place.
   */
  readonly unrepresentable?: 'throw' | 'any'
}

interface WalkCtx {
  unrepresentable: 'throw' | 'any'
  /** Cycle guard for `s.lazy()` resolution. */
  resolving: Set<unknown>
}

/**
 * Emit a JSON Schema (draft 2020-12) document for `schema`. See the module
 * doc for the exact representability contract.
 *
 * @example
 * toJsonSchema(s.union([s.string(), s.number()]))
 * // { $schema: …, anyOf: [{ type: 'string' }, { type: 'number' }] }
 */
export function toJsonSchema(schema: Schema<unknown>, options?: ToJsonSchemaOptions): JsonSchema {
  const ctx: WalkCtx = {
    unrepresentable: options?.unrepresentable ?? 'throw',
    resolving: new Set(),
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...walk(schema, ctx),
  }
}

// ─── the walker ──────────────────────────────────────────────────────────────

function unrepresentable(ctx: WalkCtx, what: string): JsonSchema {
  if (ctx.unrepresentable === 'any') return {}
  throw new Error(
    `[Pyreon] toJsonSchema: ${what} cannot be represented in JSON Schema. Pass { unrepresentable: 'any' } to emit {} (accept-anything) instead, or restructure the schema.`,
  )
}

function walk(schema: Schema<unknown>, ctx: WalkCtx): JsonSchema {
  const base = walkKind(schema, ctx)
  return applyOps(base, schema._ops)
}

function walkKind(schema: Schema<unknown>, ctx: WalkCtx): JsonSchema {
  switch (schema._kind) {
    case 'string':
    case 'stringbool': {
      if (schema._kind === 'stringbool') {
        const sb = schema as StringBoolSchema
        return { type: 'string', enum: [...sb.truthy, ...sb.falsy] }
      }
      return { type: 'string' }
    }
    case 'number': {
      // `.int()` upgrades the type — detected in applyOps; start as number.
      return { type: 'number' }
    }
    case 'boolean':
      return { type: 'boolean' }
    case 'null':
      return { type: 'null' }
    case 'any':
    case 'unknown':
    case 'custom':
      return {}
    case 'never':
      return { not: {} }
    case 'literal': {
      const value = (schema as LiteralSchema<string | number | boolean>).value
      return { const: value }
    }
    case 'enum':
      return { enum: [...(schema as EnumSchema<readonly (string | number)[]>).values] }
    case 'nativeEnum':
      return { enum: [...(schema as NativeEnumSchema<Record<string, string | number>>).values] }
    case 'object': {
      const obj = schema as ObjectSchema<Record<string, Schema<unknown>>>
      const properties: Record<string, JsonSchema> = {}
      const required: string[] = []
      for (const key of Object.keys(obj.shape)) {
        const field = obj.shape[key]!
        properties[key] = walk(field, ctx)
        if (!isOptionalLike(field)) required.push(key)
      }
      const out: JsonSchema = { type: 'object', properties }
      if (required.length > 0) out.required = required
      if (obj._catchall) out.additionalProperties = walk(obj._catchall, ctx)
      else if (obj._unknownKeys === 'strict') out.additionalProperties = false
      // strip (default) + passthrough: leave additionalProperties unset —
      // both ACCEPT unknown keys at validation time (strip drops them from
      // the OUTPUT, which JSON Schema has no vocabulary for).
      return out
    }
    case 'array': {
      const arr = schema as ArraySchema<unknown>
      return { type: 'array', items: walk(arr.element, ctx) }
    }
    case 'record': {
      const rec = schema as RecordSchema<PropertyKey, unknown>
      const out: JsonSchema = { type: 'object', additionalProperties: walk(rec.value, ctx) }
      if (rec.keySchema) {
        const keySchema = walk(rec.keySchema, ctx)
        // Only key constraints JSON Schema can express (string-shaped).
        if (Object.keys(keySchema).length > 0) out.propertyNames = keySchema
      }
      return out
    }
    case 'tuple': {
      const tup = schema as TupleSchema<readonly Schema<unknown>[], unknown>
      const prefixItems = tup.items.map((item) => walk(item, ctx))
      const out: JsonSchema = { type: 'array', prefixItems, minItems: tup.items.length }
      if (tup.restSchema) out.items = walk(tup.restSchema, ctx)
      else {
        out.items = false
        out.maxItems = tup.items.length
      }
      return out
    }
    case 'union': {
      const u = schema as UnionSchema<readonly Schema<unknown>[]>
      return { anyOf: u.members.map((m) => walk(m, ctx)) }
    }
    case 'discriminatedUnion': {
      const du = schema as DiscriminatedUnionSchema<string, readonly ObjectSchema<Record<string, Schema<unknown>>>[]>
      return { anyOf: du.members.map((m) => walk(m, ctx)) }
    }
    case 'intersection': {
      const i = schema as IntersectionSchema<unknown, unknown>
      return { allOf: [walk(i.left, ctx), walk(i.right, ctx)] }
    }
    case 'set': {
      const st = schema as SetSchema<unknown>
      return { type: 'array', uniqueItems: true, items: walk(st.value, ctx) }
    }
    case 'lazy': {
      const lz = schema as LazySchema<unknown>
      if (ctx.resolving.has(lz)) {
        throw new Error(
          '[Pyreon] toJsonSchema: cyclic s.lazy() schema — recursive $ref/$defs emission is not supported in v1. Flatten the recursion or emit the document by hand.',
        )
      }
      ctx.resolving.add(lz)
      try {
        return walk(lz.schema, ctx)
      } finally {
        ctx.resolving.delete(lz)
      }
    }
    // ── wrapper kinds ──
    case 'optional':
      // Optionality is property-level in JSON Schema (handled by the object
      // arm's `required` computation) — standalone emits the inner schema.
      return walk((schema as OptionalSchema<unknown>).inner, ctx)
    case 'nullish': {
      const inner = walk((schema as NullishSchema<unknown>).inner, ctx)
      return { anyOf: [inner, { type: 'null' }] }
    }
    case 'nullable': {
      const inner = walk((schema as NullableSchema<unknown>).inner, ctx)
      return { anyOf: [inner, { type: 'null' }] }
    }
    case 'default': {
      const d = schema as DefaultSchema<unknown>
      const inner = walk(d.inner, ctx)
      const dv = d.defaultValue
      inner.default = typeof dv === 'function' ? (dv as () => unknown)() : dv
      return inner
    }
    case 'transform':
      // Structural INPUT shape — the transform's output is a runtime concern.
      return walk((schema as TransformSchema<unknown, unknown>).inner, ctx)
    case 'pipe':
      // The pipe's accepted input is its SOURCE's input.
      return walk((schema as PipeSchema<unknown>).source, ctx)
    case 'super-refine':
      return walk((schema as SuperRefineSchema<unknown>).source, ctx)
    case 'nonoptional':
      return walk((schema as NonOptionalSchema<unknown>).source, ctx)
    case 'preprocess':
      // The preprocess fn maps arbitrary input INTO the target — the target
      // shape is the closest JSON Schema approximation (documented).
      return walk((schema as PreprocessSchema<unknown>).target, ctx)
    // ── unrepresentable kinds ──
    case 'date':
      return unrepresentable(ctx, 's.date() (a JS Date instance)')
    case 'bigint':
      return unrepresentable(ctx, 's.bigint()')
    case 'undefined':
      return unrepresentable(ctx, 's.undefined()')
    case 'void':
      return unrepresentable(ctx, 's.void()')
    case 'nan':
      return unrepresentable(ctx, 's.nan()')
    case 'symbol':
      return unrepresentable(ctx, 's.symbol()')
    case 'map':
      return unrepresentable(ctx, 's.map() (a JS Map instance)')
    case 'instanceof':
      return unrepresentable(ctx, 's.instanceof()')
    default:
      return unrepresentable(ctx, `schema kind "${schema._kind}"`)
  }
}

// ─── ops → JSON Schema keywords ──────────────────────────────────────────────

/** RegExp-escape a literal needle for `pattern` emission. */
function escapeRe(sr: string): string {
  return sr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const STRING_FORMAT_OPS: Record<string, string> = {
  'check:string:email': 'email',
  'check:string:url': 'uri',
  'check:string:uuid': 'uuid',
  'check:string:iso:date': 'date',
  'check:string:iso:datetime': 'date-time',
  'check:string:iso:time': 'time',
  'check:string:duration': 'duration',
}

function applyOps(base: JsonSchema, ops: ReadonlyArray<Op>): JsonSchema {
  let out = base
  for (const op of ops) {
    const o = op as { kind: string; n?: number; lo?: number; hi?: number; s?: string; re?: RegExp; d?: Date; value?: unknown; text?: string }
    switch (o.kind) {
      // strings
      case 'check:string:min':
        out.minLength = o.n
        break
      case 'check:string:max':
        out.maxLength = o.n
        break
      case 'check:string:length':
        out.minLength = o.n
        out.maxLength = o.n
        break
      case 'check:string:nonempty':
        out.minLength = Math.max((out.minLength as number | undefined) ?? 0, 1)
        break
      case 'check:string:regex':
        out.pattern = o.re!.source
        break
      case 'check:string:starts-with':
        out.pattern = `^${escapeRe(o.s!)}`
        break
      case 'check:string:ends-with':
        out.pattern = `${escapeRe(o.s!)}$`
        break
      case 'check:string:includes':
        out.pattern = escapeRe(o.s!)
        break
      // numbers
      case 'check:number:int':
        out.type = 'integer'
        break
      case 'check:number:min':
        out.minimum = o.n
        break
      case 'check:number:max':
        out.maximum = o.n
        break
      case 'check:number:gt':
        out.exclusiveMinimum = o.n
        break
      case 'check:number:lt':
        out.exclusiveMaximum = o.n
        break
      case 'check:number:between':
        out.minimum = o.lo
        out.maximum = o.hi
        break
      case 'check:number:positive':
        out.exclusiveMinimum = 0
        break
      case 'check:number:negative':
        out.exclusiveMaximum = 0
        break
      case 'check:number:non-negative':
        out.minimum = 0
        break
      case 'check:number:non-positive':
        out.maximum = 0
        break
      case 'check:number:multiple-of':
        out.multipleOf = o.n
        break
      case 'check:number:safe':
        out.minimum = -9007199254740991
        out.maximum = 9007199254740991
        break
      case 'check:number:finite':
        break // JSON numbers are finite by definition
      // arrays
      case 'check:array:min':
        out.minItems = o.n
        break
      case 'check:array:max':
        out.maxItems = o.n
        break
      case 'check:array:length':
        out.minItems = o.n
        out.maxItems = o.n
        break
      case 'check:array:nonempty':
        out.minItems = Math.max((out.minItems as number | undefined) ?? 0, 1)
        break
      // collections (Set emitted as array)
      case 'check:collection:min':
        out.minItems = o.n
        break
      case 'check:collection:max':
        out.maxItems = o.n
        break
      case 'check:collection:size':
        out.minItems = o.n
        out.maxItems = o.n
        break
      // modifiers handled structurally / metadata
      case 'describe':
        out.description = o.text
        break
      case 'catch':
        // Zod-compatible mapping: a static catch fallback emits as `default`
        // (a function-of-input fallback has no JSON Schema equivalent — omitted).
        if (typeof o.value !== 'function') out.default = o.value
        break
      case 'default':
        out.default = typeof o.value === 'function' ? (o.value as () => unknown)() : o.value
        break
      default: {
        // string FORMAT checks (email/url/uuid/iso.*/duration) → `format`;
        // pattern-backed formats (ulid/nanoid/cuid/…) are runtime-precise but
        // JSON Schema has no standard vocabulary for them — omitted (the
        // structural `type: 'string'` still emits). Refines / transforms /
        // serverChecks / brand are runtime-only — structurally omitted.
        const format = STRING_FORMAT_OPS[o.kind]
        if (format) out.format = format
        break
      }
    }
  }
  return out
}

/** `.optional()` / `.nullish()` / `.default()` fields are NOT `required`. */
function isOptionalLike(field: Schema<unknown>): boolean {
  const kind = field._kind
  if (kind === 'optional' || kind === 'nullish' || kind === 'default') return true
  // A `.check()`-composed optional op (mini form) also counts.
  for (const op of field._ops) {
    if (op.kind === 'optional' || op.kind === 'nullish' || op.kind === 'default') return true
  }
  return false
}
