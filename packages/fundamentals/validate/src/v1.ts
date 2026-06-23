/**
 * `@pyreon/validate` v1 validator — chainable + function-comp namespace.
 *
 * This is the new validator runtime. The DX layer (`withField`,
 * `parseReactive`, `formatErrors`) lives in the same package — Pyreon-
 * validate schemas implement Standard Schema natively, so the DX
 * helpers work on them directly.
 *
 * Surface:
 *   - primitives: string / number / boolean / bigint / date / literal /
 *     enum / symbol / nan / null / undefined / void / any / unknown
 *   - composition: object / array / union / discriminatedUnion / record /
 *     tuple / map / set / intersection / lazy (recursive)
 *   - object algebra: .pick / .omit / .partial / .extend / .merge / .keyof
 *     + unknown-key policy (.strip / .strict / .passthrough)
 *   - modifiers: optional / nullable / nullish / default / transform /
 *     refine / brand / describe / field
 *   - coercion: s.coerce.{string,number,boolean,date,bigint}
 *   - email precision tiers (html5 / standard / rfc5322)
 *
 * Still open (tracked follow-ups): `.required` / `.catchall`, and
 * compiler-emit for typia-class wall-clock (the JIT path needed to beat
 * ArkType on valid-parse).
 */

import { array, ArraySchema } from './composition/array'
import { map, MapSchema, set, SetSchema } from './composition/collections'
import { intersection, IntersectionSchema } from './composition/intersection'
import { lazy, LazySchema } from './composition/lazy'
import { object, ObjectSchema } from './composition/object'
import { record, RecordSchema } from './composition/record'
import { tuple, TupleSchema } from './composition/tuple'
import {
  discriminatedUnion,
  DiscriminatedUnionSchema,
  union,
  UnionSchema,
} from './composition/union'
import { preprocess, Schema } from './core/schema'
import {
  any,
  AnySchema,
  nan,
  NanSchema,
  null_,
  NullSchema,
  symbol,
  SymbolSchema,
  undefined_,
  UndefinedSchema,
  unknown,
  UnknownSchema,
  void_,
  VoidSchema,
} from './primitives/atoms'
import { bigint, BigIntSchema } from './primitives/bigint'
import { boolean, BooleanSchema } from './primitives/boolean'
import { coerce } from './primitives/coerce'
import { date, DateSchema } from './primitives/date'
import { enum_, EnumSchema, literal, LiteralSchema } from './primitives/literal'
import { number, NumberSchema } from './primitives/number'
import { string, StringSchema } from './primitives/string'
import { stringbool, StringBoolSchema } from './primitives/stringbool'

// ─── Chainable namespace ───────────────────────────────────────────────

/**
 * The `s.` namespace — chainable shorthand for every primitive +
 * composition constructor. Mirrors Zod's `z.` convention.
 *
 * @example
 * ```ts
 * import { s } from '@pyreon/validate'
 * const userSchema = s.object({
 *   name: s.string().min(2),
 *   age: s.number().int().between(0, 150),
 * })
 * ```
 */
export const s = {
  string,
  stringbool,
  number,
  boolean,
  bigint,
  date,
  literal,
  enum: enum_,
  symbol,
  nan,
  null: null_,
  undefined: undefined_,
  void: void_,
  any,
  unknown,
  object,
  array,
  union,
  discriminatedUnion,
  record,
  tuple,
  map,
  set,
  intersection,
  lazy,
  coerce,
  preprocess,
} as const

// ─── Named function-comp exports ───────────────────────────────────────

export { coerce, preprocess, stringbool }
export { type StringBoolOptions } from './primitives/stringbool'
export { any, array, bigint, boolean, date, discriminatedUnion, enum_, intersection, lazy, literal, map, nan, null_, number, object, record, set, string, symbol, tuple, undefined_, union, unknown, void_ }
export {
  AnySchema,
  ArraySchema,
  BigIntSchema,
  BooleanSchema,
  DateSchema,
  DiscriminatedUnionSchema,
  EnumSchema,
  IntersectionSchema,
  LazySchema,
  LiteralSchema,
  MapSchema,
  NanSchema,
  NullSchema,
  NumberSchema,
  ObjectSchema,
  RecordSchema,
  SetSchema,
  StringBoolSchema,
  StringSchema,
  SymbolSchema,
  TupleSchema,
  UndefinedSchema,
  UnionSchema,
  UnknownSchema,
  VoidSchema,
}

// ─── pipe — function-comp variant of method chaining ───────────────────

/**
 * Apply a sequence of chain-method invocations to a schema.
 *
 * @example
 * ```ts
 * import { string, pipe } from '@pyreon/validate'
 * import { email, min } from '@pyreon/validate/checks/string'  // tree-shake-friendly path
 *
 * // Identical to: string().email().min(3)
 * const schema = pipe(string(), (s) => s.email(), (s) => s.min(3))
 * ```
 *
 * Note: v1's pipe takes function-step callbacks for simplicity. A
 * follow-up PR adds Valibot-style descriptor-object actions for
 * better tree-shaking.
 */
export function pipe<S extends Schema<unknown>>(schema: S, ...actions: ReadonlyArray<(s: S) => S>): S {
  let current = schema
  for (const action of actions) current = action(current)
  return current
}

// ─── Type helpers ──────────────────────────────────────────────────────

export { type Infer, type Input, type Output } from './core/infer'
export { type Result, Schema, type SuperRefineCtx } from './core/schema'
export { type PyreonIssue, type StandardSchemaIssue, ValidationError } from './core/issue'
export { type PendingCheck } from './core/ops'

// ─── Format registry (client/server-split mechanism) ───────────────────
// `installFormatValidator` plugs a superior validator for any format
// ('email' / 'phone' / …); `@pyreon/validate/server` uses it to upgrade the
// lightweight client defaults to strict server validation.
//
// `installServerCheck` is the heavier, async/context-aware sibling — the
// registry behind `.serverCheck(key)` (client no-op + `pending`; server runs
// the installed validator). Registered via `@pyreon/validate/server`'s
// `registerServerCheck`; install/uninstall exported for tests.
export {
  type FormatValidator,
  getFormatValidator,
  getServerCheck,
  installFormatValidator,
  installServerCheck,
  resolveFormat,
  type ServerCheckFn,
  uninstallFormatValidator,
  uninstallServerCheck,
} from './core/registry'
// Lightweight (client) format validators — exported for standalone use.
export { type EmailPrecision, validateCreditCard, validateIp, validatePhone } from './primitives/string'
