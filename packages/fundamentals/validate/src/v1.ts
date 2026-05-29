/**
 * `@pyreon/validate` v1 validator — chainable + function-comp namespace.
 *
 * This is the new validator runtime. The DX layer (`withField`,
 * `parseReactive`, `formatErrors`) from PR #952 remains unchanged in
 * the same package — Pyreon-validate schemas implement Standard Schema
 * natively, so the DX helpers work on them directly.
 *
 * v1 surface: primitives (string/number/boolean/literal/enum) +
 * composition (object/array) + modifiers (optional/nullable/default/
 * transform/refine/brand/describe/field). Out of scope for v1 (see
 * the plan file `.claude/plans/synchronous-chasing-puffin.md` for the
 * full follow-up list):
 *
 *   - tuple / record / union / discriminate / intersection
 *   - bigint / date / null / undefined / void primitives
 *   - .pick / .omit / .partial / .required / .extend / .merge / .coerce
 *   - compiler-emit for typia-class wall-clock
 */

import { array, ArraySchema } from './composition/array'
import { object, ObjectSchema } from './composition/object'
import { Schema } from './core/schema'
import { boolean, BooleanSchema } from './primitives/boolean'
import { enum_, EnumSchema, literal, LiteralSchema } from './primitives/literal'
import { number, NumberSchema } from './primitives/number'
import { string, StringSchema } from './primitives/string'

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
  number,
  boolean,
  literal,
  enum: enum_,
  object,
  array,
} as const

// ─── Named function-comp exports ───────────────────────────────────────

export { array, boolean, enum_, literal, number, object, string }
export {
  ArraySchema,
  BooleanSchema,
  EnumSchema,
  LiteralSchema,
  NumberSchema,
  ObjectSchema,
  StringSchema,
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
export function pipe<S extends Schema<unknown>>(
  schema: S,
  ...actions: ReadonlyArray<(s: S) => S>
): S {
  let current = schema
  for (const action of actions) current = action(current)
  return current
}

// ─── Type helpers ──────────────────────────────────────────────────────

export { type Infer, type Input, type Output } from './core/infer'
export { type Result, Schema } from './core/schema'
export { type PyreonIssue, type StandardSchemaIssue, ValidationError } from './core/issue'
