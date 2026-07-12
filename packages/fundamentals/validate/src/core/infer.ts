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
 * The INPUT type of a schema. DELIBERATE v1 SCOPE: the runtime is
 * single-generic (`Schema<T>` — `T` is the OUTPUT type), so `Input<S>`
 * resolves to the same type as {@link Output} — including for
 * `.transform()` schemas, where the true pre-transform input differs.
 * Threading a second generic (`Schema<TIn, TOut>`) through every
 * primitive / composition / modifier / the JIT was weighed and rejected
 * for v1: it doubles the public type surface for one alias that only
 * diverges under `.transform()`, and `TransformSchema` keeps the real
 * input type internally if that trade-off is ever revisited. Until then,
 * treat `Input<S>` as "the type `parse()` returns", NOT "the raw wire
 * type a transform accepts".
 *
 * @example
 * ```ts
 * const len = s.string().transform(v => v.length)
 * type In = Input<typeof len>   // number — NOT string (see scope note)
 * type Out = Output<typeof len> // number
 * ```
 */
export type Input<S> = Infer<S>
