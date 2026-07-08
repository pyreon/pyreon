import type {
  ParseResult,
  SchemaValidateFn,
  TypedSchemaAdapter,
  ValidateFn,
  ValidationError,
  ValidationIssue,
} from './types'
import { issuesToRecord } from './utils'

/**
 * Minimal Valibot-compatible interfaces so we don't require valibot as a hard dep.
 */
interface ValibotPathItem {
  key: string | number
}

interface ValibotIssue {
  path?: ValibotPathItem[]
  message: string
}

interface ValibotSafeParseResult {
  success: boolean
  output?: unknown
  issues?: ValibotIssue[]
}

/**
 * Any function that takes (schema, input, ...rest) and returns a parse result.
 * Valibot's safeParse/safeParseAsync have generic constraints on the schema
 * parameter that can't be expressed without importing Valibot types. We accept
 * any callable and cast internally.
 */
type GenericSafeParseFn = Function

function valibotIssuesToGeneric(issues: ValibotIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path?.map((p) => String(p.key)).join('.') ?? '',
    message: issue.message,
  }))
}

type InternalParseFn = (
  schema: unknown,
  input: unknown,
) => ValibotSafeParseResult | Promise<ValibotSafeParseResult>

/**
 * Create a form-level schema validator from a Valibot schema.
 * Supports type inference for compile-time field name validation.
 *
 * Valibot uses standalone functions rather than methods, so you must pass
 * the `safeParseAsync` (or `safeParse`) function from valibot.
 *
 * @example
 * import * as v from 'valibot'
 * import { valibotSchema } from '@pyreon/validation/valibot'
 *
 * const schema = v.object({
 *   email: v.pipe(v.string(), v.email()),
 *   password: v.pipe(v.string(), v.minLength(8)),
 * })
 *
 * const form = useForm({
 *   initialValues: { email: '', password: '' },
 *   schema: valibotSchema(schema, v.safeParseAsync),  // ✅ Types inferred
 *   onSubmit: (values) => { ... },
 * })
 *
 * // Field names are type-safe:
 * form.register('email')    // ✅ OK
 * form.register('invalid')  // ❌ Type error!
 */
export function valibotSchema<TValues extends Record<string, unknown>>(
  schema: unknown,
  safeParseFn: GenericSafeParseFn,
): TypedSchemaAdapter<TValues> {
  const runParse = safeParseFn as InternalParseFn
  const validator: SchemaValidateFn<TValues> = async (values: TValues) => {
    try {
      const result = await runParse(schema, values)
      if (result.success) return {} as Partial<Record<keyof TValues, ValidationError>>
      return issuesToRecord<TValues>(valibotIssuesToGeneric(result.issues ?? []))
    } catch (err) {
      return {
        '': err instanceof Error ? err.message : String(err),
      } as Partial<Record<keyof TValues, ValidationError>>
    }
  }

  // Sync parse path for @pyreon/store's schema-driven defineStore.
  // Caller must pass the SYNC `safeParse` (not `safeParseAsync`) — if
  // they pass async, the result is a Promise and store throws at
  // defineStore-time. Wrap in try/catch + Promise-detection so the
  // failure mode is loud, not silent.
  const parse = (value: unknown): ParseResult<TValues> => {
    try {
      const result = runParse(schema, value)
      if (result instanceof Promise) {
        // Async safeParseAsync was passed by mistake. Caller (store)
        // detects this via the Promise return.
        return result as unknown as ParseResult<TValues>
      }
      if (result.success) return { ok: true, value: result.output as TValues }
      return { ok: false, issues: valibotIssuesToGeneric(result.issues ?? []) }
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
 * Create a single-field validator from a Valibot schema.
 *
 * @example
 * import * as v from 'valibot'
 * import { valibotField } from '@pyreon/validation/valibot'
 *
 * const form = useForm({
 *   initialValues: { email: '' },
 *   validators: {
 *     email: valibotField(v.pipe(v.string(), v.email('Invalid email')), v.safeParseAsync),
 *   },
 *   onSubmit: (values) => { ... },
 * })
 */
export function valibotField<T>(schema: unknown, safeParseFn: GenericSafeParseFn): ValidateFn<T> {
  const parse = safeParseFn as InternalParseFn
  return async (value: T) => {
    try {
      const result = await parse(schema, value)
      if (result.success) return undefined
      return result.issues?.[0]?.message
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }
}
