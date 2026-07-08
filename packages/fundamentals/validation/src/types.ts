// ─── Validation contract (the universal, library-agnostic base) ─────────────
// These types live HERE, not in @pyreon/form: @pyreon/validation is the
// stack-wide validation gate (@pyreon/form, @pyreon/store, @pyreon/state-tree,
// @pyreon/feature all consume it), so anchoring the contract to `form` coupled
// every validation consumer to the forms package. @pyreon/validation depends on
// nothing pyreon; the consumers depend on it. @pyreon/form re-exports these for
// back-compat, so `import { ValidationError } from '@pyreon/form'` still works.

/** A validation error message (or `undefined` for "no error"). */
export type ValidationError = string | undefined

/**
 * Single-field validator. Receives the field value and all current values for
 * cross-field validation; the optional signal detects cancellation (e.g. via
 * AbortController when a form unmounts).
 */
export type ValidateFn<T, TValues = Record<string, unknown>> = (
  value: T,
  allValues: TValues,
  signal?: AbortSignal,
) => ValidationError | Promise<ValidationError>

/**
 * Whole-object validator: maps a values object to a per-key error record.
 * This is what every schema adapter (zod/valibot/arktype/Standard Schema)
 * produces, and what `@pyreon/form` / `@pyreon/store` consume.
 */
export type SchemaValidateFn<TValues> = (
  values: TValues,
) =>
  | Partial<Record<keyof TValues, ValidationError>>
  | Promise<Partial<Record<keyof TValues, ValidationError>>>

// ─── Standard Schema contract (https://standardschema.dev) ──────────────────
// The `~standard` shape zod ≥3.24 / valibot ≥1 / arktype ≥2 / @pyreon/validate
// `s` all expose. Owning it here lets any consumer accept a raw schema with no
// adapter and no cast.

/**
 * A single Standard Schema issue. `path`'s `| undefined` (not a bare optional)
 * is intentional under `exactOptionalPropertyTypes` — Valibot's issue type
 * declares `path: … | undefined` explicitly, and a bare `path?` would reject it.
 */
export interface StandardSchemaIssue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
}

/**
 * Standard Schema's success-or-failure result: a success carries `value` and
 * omits `issues`; a failure carries `issues` and omits `value`. The mutual
 * `?: undefined` discriminator lets TS narrow on `result.issues === undefined`.
 */
export type StandardSchemaResult<Output = unknown> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly value?: undefined; readonly issues: ReadonlyArray<StandardSchemaIssue> }

/**
 * The canonical Standard Schema (https://standardschema.dev) type — the strict,
 * spec-accurate `~standard` contract (`version`/`vendor` required) that zod
 * ≥3.24 / valibot ≥1 / arktype ≥2 / `@pyreon/validate`'s `s` all implement.
 * This is @pyreon's SINGLE source of truth for the contract: `@pyreon/validate`
 * and `@pyreon/state-tree` import it instead of re-declaring their own.
 * (`types?: … | undefined` matches Valibot's emitted shape under
 * `exactOptionalPropertyTypes`.)
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>
    readonly types?: { readonly input: Input; readonly output: Output } | undefined
  }
}

/**
 * LAX accept-type: any value carrying a `~standard.validate` (version/vendor
 * NOT required). This is what `isStandardSchema` narrows to and what consumers
 * accept when they only need to duck-type "is this a Standard Schema?" — a real
 * `StandardSchemaV1` is assignable to it. Prefer `StandardSchemaV1` when TYPING
 * a concrete schema; use `StandardSchemaLike` at accept/guard boundaries.
 */
export interface StandardSchemaLike<Output = unknown> {
  readonly '~standard': {
    readonly types?: { readonly output: Output } | undefined
    // Loose result (`value: unknown`) — a lax accept-type doesn't constrain the
    // parsed output, so any `~standard`-bearing value satisfies it. A strict
    // `StandardSchemaV1<_, Output>` (whose validate yields `value: Output`) is
    // assignable to this (Output → unknown).
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: unknown; readonly issues?: undefined }
      | { readonly value?: undefined; readonly issues: ReadonlyArray<StandardSchemaIssue> }
      | Promise<
          | { readonly value: unknown; readonly issues?: undefined }
          | { readonly value?: undefined; readonly issues: ReadonlyArray<StandardSchemaIssue> }
        >
  }
}

/**
 * Generic issue produced by any schema library.
 * Adapters normalize library-specific errors into this shape.
 */
export interface ValidationIssue {
  /** Dot-separated field path (e.g. "address.city"). */
  path: string
  /** Human-readable error message. */
  message: string
}

/**
 * Branded type for schema adapters. Captures the inferred schema type
 * for use with useForm so field names are validated at compile time.
 *
 * @example
 * ```ts
 * const schema = zodSchema(userSchema) // Infers TValues from userSchema
 * const form = useForm({ schema }) // TValues is automatically extracted
 * form.register('name') // ✅ Type-safe field name
 * form.register('invalid') // ❌ Type error!
 * ```
 */
export interface TypedSchemaAdapter<TValues extends Record<string, unknown>> {
  /** Brand type for type extraction — not used at runtime. */
  readonly _infer: TValues
  /** The actual schema validator function. */
  readonly validator: SchemaValidateFn<TValues>
  /**
   * Synchronous parser that returns the validated + coerced output value
   * (with defaults applied, transforms run, etc.) OR a list of issues.
   *
   * **Optional** — used by `@pyreon/store`'s schema-driven `defineStore`
   * overload, which needs the parsed value (not just errors) to write
   * defaulted/transformed data into per-field signals. Existing
   * `@pyreon/form` consumers ignore this field; their `validator`-only
   * path is unchanged.
   *
   * Adapters MUST use the synchronous parse API of their underlying
   * library (e.g. zod's `safeParse`, NOT `safeParseAsync`). If a library
   * only supports async parsing, omit this method — store will reject
   * such schemas at `defineStore`-time with a clear error.
   *
   * @example
   * ```ts
   * // zodSchema:
   * parse: (value) => {
   *   const r = schema.safeParse(value)
   *   return r.success
   *     ? { ok: true, value: r.data }
   *     : { ok: false, issues: zodIssuesToGeneric(r.error.issues) }
   * }
   * ```
   */
  readonly parse?: (value: unknown) => ParseResult<TValues>
}

/**
 * Result of a synchronous parse call on a schema adapter. Either succeeds
 * with the validated + coerced output, or fails with a list of issues.
 */
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: ValidationIssue[] }

/**
 * A generic schema adapter transforms library-specific parse results
 * into a flat record of field → error message.
 */
export type SchemaAdapter<TSchema> = <TValues extends Record<string, unknown>>(
  schema: TSchema,
) => SchemaValidateFn<TValues>

/**
 * A generic field adapter transforms a library-specific schema
 * into a single-field validator function.
 */
export type FieldAdapter<TSchema> = <T>(schema: TSchema) => ValidateFn<T>
