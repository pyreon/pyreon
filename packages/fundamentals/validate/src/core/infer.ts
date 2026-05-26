/**
 * Type-level helpers for inferring a schema's output and input types.
 *
 * Flat shape, no HKT — TypeScript can resolve these in O(n) on schema
 * size rather than O(n²) (Zod v3's expensive recursive pattern).
 */

import type { Schema } from './schema'

/**
 * The OUTPUT type of a schema (post-transforms). What `parse()` returns
 * on success.
 *
 * @example
 * ```ts
 * const userSchema = s.object({ name: s.string(), age: s.number() })
 * type User = Infer<typeof userSchema>  // { name: string; age: number }
 * ```
 */
export type Infer<S> = S extends Schema<infer T> ? T : never

/**
 * Alias for {@link Infer}. Common in the Pyreon ecosystem to spell
 * "Output" explicitly when distinguishing from {@link Input}.
 */
export type Output<S> = Infer<S>

/**
 * The INPUT type of a schema (pre-transform). For most schemas this
 * equals `Output<S>`; for `.transform()` schemas it's the type before
 * transformation.
 *
 * v1 limitation: we don't track input vs output types separately at
 * the Schema<T> base level — both are `T`. A schema's input is its
 * inferred output type. This will be tightened in a follow-up PR via
 * a `Schema<TInput, TOutput>` shape if needed.
 *
 * @example
 * ```ts
 * const s = s.string().transform(s => s.length)
 * type In = Input<typeof s>   // string (today: number, since v1 doesn't track input)
 * type Out = Output<typeof s> // number
 * ```
 */
export type Input<S> = Infer<S>
