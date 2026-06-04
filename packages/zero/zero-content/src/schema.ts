// ─── @pyreon/zero-content/schema subpath ───────────────────────────────────
//
// Re-exports the Standard Schema V1 inference helper so the generated
// `.pyreon/content-types.d.ts` can use `StandardSchemaV1.InferOutput<...>`
// without bundling the validator vendor.
//
// We don't depend on the `@standard-schema/spec` package directly to
// keep our dep graph lean — instead we mirror the relevant type. The
// shape is intentionally tiny and stable per the spec at
// https://standardschema.dev.

export namespace StandardSchemaV1 {
  /**
   * Infer the OUTPUT type of any Standard Schema-conformant validator.
   * Used by `.pyreon/content-types.d.ts` to type `entry.data`.
   */
  export type InferOutput<S> = S extends {
    '~standard': {
      validate: (input: infer _Input) => infer R
    }
  }
    ? Awaited<R> extends { value: infer V; issues?: undefined }
      ? V
      : Awaited<R> extends { issues: ReadonlyArray<unknown> }
        ? never
        : unknown
    : unknown
}
