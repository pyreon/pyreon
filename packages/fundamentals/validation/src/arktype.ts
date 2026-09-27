import type {
  ParseResult,
  SchemaValidateFn,
  TypedSchemaAdapter,
  ValidateFn,
  ValidationIssue,
} from './types'
import type { InferSchema, StandardSchemaTyped } from './schema'
import { emptyErrors, flattenIssuePath, formLevelError, issuesToRecord } from './utils'

/**
 * Minimal ArkType-compatible interfaces so we don't require arktype as a hard dep.
 */
interface ArkError {
  path: PropertyKey[]
  message: string
}

interface ArkErrors extends Array<ArkError> {
  summary: string
}

/**
 * Internal callable interface matching ArkType's Type.
 * Not exposed publicly — consumers pass their ArkType schema directly.
 */
type ArkTypeCallable = (data: unknown) => unknown

/**
 * ArkType brands its error collection with `" arkKind": "errors"` (the
 * leading space is ArkType's own no-autocomplete convention). Matching on
 * that brand — not on "an array with a `summary` key" — keeps a VALID
 * array output that happens to carry a `summary` property from being read
 * as a failure.
 */
function isArkErrors(result: unknown): result is ArkErrors {
  return Array.isArray(result) && (result as unknown as Record<string, unknown>)[' arkKind'] === 'errors'
}

function arkIssuesToGeneric(errors: ArkErrors): ValidationIssue[] {
  return errors.map((err) => ({
    path: flattenIssuePath(err.path),
    message: err.message,
  }))
}

/**
 * Create a form-level schema validator from an ArkType schema.
 * Supports type inference for compile-time field name validation.
 *
 * Accepts any callable ArkType `Type` instance. The schema is duck-typed —
 * no ArkType import required.
 *
 * @example
 * import { type } from 'arktype'
 * import { arktypeSchema } from '@pyreon/validation/arktype'
 *
 * const schema = type({
 *   email: 'string.email',
 *   password: 'string >= 8',
 * })
 *
 * const form = useForm({
 *   initialValues: { email: '', password: '' },
 *   schema: arktypeSchema(schema),  // ✅ Types inferred
 *   onSubmit: (values) => { ... },
 * })
 *
 * // Field names are type-safe:
 * form.register('email')    // ✅ OK
 * form.register('invalid')  // ❌ Type error!
 */
export function arktypeSchema<S extends ArkTypeCallable & StandardSchemaTyped>(
  schema: S,
): TypedSchemaAdapter<InferSchema<S>>
export function arktypeSchema<TValues extends Record<string, unknown>>(
  schema: ArkTypeCallable,
): TypedSchemaAdapter<TValues>
export function arktypeSchema<TValues extends Record<string, unknown>>(
  schema: ArkTypeCallable,
): TypedSchemaAdapter<TValues> {
  const validator: SchemaValidateFn<TValues> = (values: TValues) => {
    try {
      const result = schema(values)
      if (!isArkErrors(result)) return emptyErrors<TValues>()
      return issuesToRecord<TValues>(arkIssuesToGeneric(result))
    } catch (err) {
      return formLevelError<TValues>(err)
    }
  }

  // Sync parse path for @pyreon/store's schema-driven defineStore.
  // ArkType invocation IS already synchronous — its non-error result IS
  // the coerced output value. Same try/catch defensive pattern as
  // validator above.
  const parse = (value: unknown): ParseResult<TValues> => {
    try {
      const result = schema(value)
      if (!isArkErrors(result)) return { ok: true, value: result as TValues }
      return { ok: false, issues: arkIssuesToGeneric(result) }
    } catch (err) {
      return {
        ok: false,
        issues: [{ path: '', message: err instanceof Error ? err.message : String(err) }],
      }
    }
  }

  return {
    _infer: undefined as any,
    validator,
    parse,
  }
}

/**
 * Create a single-field validator from an ArkType schema.
 *
 * @example
 * import { type } from 'arktype'
 * import { arktypeField } from '@pyreon/validation/arktype'
 *
 * const form = useForm({
 *   initialValues: { email: '' },
 *   validators: {
 *     email: arktypeField(type('string.email')),
 *   },
 *   onSubmit: (values) => { ... },
 * })
 */
export function arktypeField<T>(schema: ArkTypeCallable): ValidateFn<T> {
  return (value: T) => {
    try {
      const result = schema(value)
      if (!isArkErrors(result)) return undefined
      return result[0]?.message
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }
}
