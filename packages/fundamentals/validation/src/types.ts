import type { SchemaValidateFn, ValidateFn, ValidationError } from "@pyreon/form"

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
