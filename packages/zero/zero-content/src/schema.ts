// ─── @pyreon/zero-content/schema subpath ───────────────────────────────────
//
// Type helpers for the generated `.pyreon/content-types.d.ts`, which types
// `entry.data` as `InferSchemaOutput<...>` of each collection's schema.
//
// The Standard Schema contract itself is the official, types-only
// `@standard-schema/spec` package — re-exported here, never re-declared.

export type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * Infer the OUTPUT type of any Standard Schema-conformant validator.
 *
 * Reads the `~standard.types.output` phantom when present (zod, valibot,
 * arktype), and otherwise the success branch of the `validate` RETURN —
 * `@pyreon/validate`'s `s` omits the OPTIONAL phantom, so the spec's own
 * `StandardSchemaV1.InferOutput` would collapse it. The success branch is the
 * one WITHOUT issues (valibot's failure result carries a `value` too).
 */
export type InferSchemaOutput<S> = S extends {
  readonly '~standard': { readonly types?: infer TY }
}
  ? NonNullable<TY> extends { readonly output: infer O }
    ? O
    : InferFromValidate<S>
  : InferFromValidate<S>

type InferFromValidate<S> = S extends {
  readonly '~standard': { readonly validate: (value: never) => infer R }
}
  ? Extract<Awaited<R>, { readonly issues?: undefined }> extends { readonly value: infer O }
    ? O
    : unknown
  : unknown
