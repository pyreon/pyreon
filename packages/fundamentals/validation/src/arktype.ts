import type { SchemaValidateFn, ValidateFn, ValidationError } from '@pyreon/form'
import type { TypedSchemaAdapter, ValidationIssue } from './types'
import { issuesToRecord } from './utils'

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

function isArkErrors(result: unknown): result is ArkErrors {
  return Array.isArray(result) && 'summary' in (result as object)
}

function arkIssuesToGeneric(errors: ArkErrors): ValidationIssue[] {
  return errors.map((err) => ({
    path: err.path.map(String).join('.'),
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
export function arktypeSchema<TValues extends Record<string, unknown>>(
  schema: ArkTypeCallable,
): TypedSchemaAdapter<TValues> {
  const validator: SchemaValidateFn<TValues> = (values: TValues) => {
    try {
      const result = schema(values)
      if (!isArkErrors(result)) return {} as Partial<Record<keyof TValues, ValidationError>>
      return issuesToRecord<TValues>(arkIssuesToGeneric(result))
    } catch (err) {
      return {
        '': err instanceof Error ? err.message : String(err),
      } as Partial<Record<keyof TValues, ValidationError>>
    }
  }

  return {
    _infer: undefined as any,
    validator,
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
