import type { SchemaValidateFn, ValidateFn, ValidationError } from '@pyreon/form'
import type { ValidationIssue } from './types'
import { issuesToRecord } from './utils'

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
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
}

/**
 * Create a form-level schema validator from a Zod schema.
 * Supports both sync and async Zod schemas (uses `safeParseAsync`).
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
 *   schema: zodSchema(schema),
 *   onSubmit: (values) => { ... },
 * })
 */
export function zodSchema<TValues extends Record<string, unknown>>(
  schema: ZodSchema<TValues>,
): SchemaValidateFn<TValues> {
  return async (values: TValues) => {
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
