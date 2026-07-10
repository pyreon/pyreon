import type {
  ParseResult,
  SchemaValidateFn,
  TypedSchemaAdapter,
  ValidateFn,
  ValidationError,
  ValidationIssue,
} from './types'
import { flattenIssuePath, issuesToRecord } from './utils'

/**
 * Minimal Zod-compatible interfaces so we don't require zod as a hard dep.
 * These match Zod v3's public API surface.
 */
interface ZodIssue {
  path: PropertyKey[]
  message: string
}

/**
 * Duck-typed Zod schema interface — works with both Zod v3 and v4.
 * Inlines the result shape to avoid version-specific type mismatches.
 */
interface ZodSchema<T = unknown> {
  safeParse(data: unknown): {
    success: boolean
    data?: T
    error?: { issues: ZodIssue[] }
  }
  safeParseAsync(
    data: unknown,
  ): Promise<{ success: boolean; data?: T; error?: { issues: ZodIssue[] } }>
}

function zodIssuesToGeneric(issues: ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: flattenIssuePath(issue.path),
    message: issue.message,
  }))
}

/**
 * Create a form-level schema validator from a Zod schema.
 * Supports both sync and async Zod schemas (uses `safeParseAsync`).
 * Returns a TypedSchemaAdapter that preserves type information for form field validation.
 *
 * @example
 * import { z } from 'zod'
 * import { zodSchema } from '@pyreon/validation/zod'
 *
 * const schema = z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8),
 * })
 *
 * const form = useForm({
 *   initialValues: { email: '', password: '' },
 *   schema: zodSchema(schema),  // ✅ Types inferred
 *   onSubmit: (values) => { ... },
 * })
 *
 * // Field names are type-safe:
 * form.register('email')    // ✅ OK
 * form.register('invalid')  // ❌ Type error!
 */
export function zodSchema<TValues extends Record<string, unknown>>(
  schema: ZodSchema<TValues>,
): TypedSchemaAdapter<TValues> {
  const validator: SchemaValidateFn<TValues> = async (values: TValues) => {
    try {
      const result = await schema.safeParseAsync(values)
      if (result.success) return {} as Partial<Record<keyof TValues, ValidationError>>
      return issuesToRecord<TValues>(zodIssuesToGeneric(result.error!.issues))
    } catch (err) {
      return {
        '': err instanceof Error ? err.message : String(err),
      } as Partial<Record<keyof TValues, ValidationError>>
    }
  }

  // Sync parse path for @pyreon/store's schema-driven defineStore.
  // Uses `safeParse` (NOT `safeParseAsync`) — async refinements are
  // unsupported in store mode (caller throws at defineStore-time).
  const parse = (value: unknown): ParseResult<TValues> => {
    try {
      const r = schema.safeParse(value)
      if (r.success) return { ok: true, value: r.data as TValues }
      return { ok: false, issues: zodIssuesToGeneric(r.error?.issues ?? []) }
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
 * Create a single-field validator from a Zod schema.
 * Supports both sync and async Zod refinements.
 *
 * @example
 * import { z } from 'zod'
 * import { zodField } from '@pyreon/validation/zod'
 *
 * const form = useForm({
 *   initialValues: { email: '' },
 *   validators: {
 *     email: zodField(z.string().email('Invalid email')),
 *   },
 *   onSubmit: (values) => { ... },
 * })
 */
export function zodField<T>(schema: ZodSchema<T>): ValidateFn<T> {
  return async (value: T) => {
    try {
      const result = await schema.safeParseAsync(value)
      if (result.success) return undefined
      return result.error!.issues[0]?.message
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }
}
