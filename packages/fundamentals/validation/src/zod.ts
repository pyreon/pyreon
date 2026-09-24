import type {
  ParseResult,
  SchemaValidateFn,
  TypedSchemaAdapter,
  ValidateFn,
  ValidationIssue,
} from './types'
import { emptyErrors, flattenIssuePath, formLevelError, issuesToRecord } from './utils'

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

type ZodSafeParseResult<T> = ReturnType<ZodSchema<T>['safeParse']>

/**
 * Zod refuses a synchronous parse of a schema containing an async refine /
 * transform by THROWING (zod 4: `$ZodAsyncError` "Encountered Promise during
 * synchronous parse"; zod 3: "…Use .parseAsync instead"). Anything else thrown
 * from `safeParse` is a genuine user error and must not be retried.
 */
function isZodAsyncError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.constructor.name === '$ZodAsyncError' || /parseAsync|encountered promise/i.test(err.message)
}

/**
 * SYNC FAST PATH: try `safeParse` first and only fall back to
 * `safeParseAsync` when zod reports the schema is async. Most schemas are
 * sync, and the old always-`safeParseAsync` form paid a Promise + microtask
 * per validation (every keystroke under `validateOn`). A sync schema now
 * returns its result synchronously; an async one still returns a Promise.
 */
function runZod<T, R>(
  schema: ZodSchema<T>,
  value: unknown,
  onResult: (result: ZodSafeParseResult<T>) => R,
  onError: (err: unknown) => R,
): R | Promise<R> {
  try {
    return onResult(schema.safeParse(value))
  } catch (err) {
    if (!isZodAsyncError(err)) return onError(err)
  }
  return schema.safeParseAsync(value).then(onResult, onError)
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
  type Errors = ReturnType<typeof emptyErrors<TValues>>
  const toErrors = (result: ZodSafeParseResult<TValues>): Errors =>
    result.success ? emptyErrors<TValues>() : issuesToRecord<TValues>(zodIssuesToGeneric(result.error!.issues))
  const validator: SchemaValidateFn<TValues> = (values: TValues) =>
    runZod(
      schema,
      values,
      toErrors,
      (err) => formLevelError<TValues>(err),
    )

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
  return (value: T) =>
    runZod(
      schema,
      value,
      (result) => (result.success ? undefined : result.error!.issues[0]?.message),
      (err) => (err instanceof Error ? err.message : String(err)),
    )
}
