import type { SchemaValidateFn, ValidateFn, ValidationError } from '@pyreon/form'

/** Re-export form types for convenience. */
export type { SchemaValidateFn, ValidateFn, ValidationError }

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
