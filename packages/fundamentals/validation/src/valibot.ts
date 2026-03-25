import type { SchemaValidateFn, ValidateFn, ValidationError } from "@pyreon/form"
import type { ValidationIssue } from "./types"
import { issuesToRecord } from "./utils"

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
// biome-ignore lint/complexity/noBannedTypes: must accept any valibot parse function
type GenericSafeParseFn = Function

function valibotIssuesToGeneric(issues: ValibotIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path?.map((p) => String(p.key)).join(".") ?? "",
    message: issue.message,
  }))
}

type InternalParseFn = (
  schema: unknown,
  input: unknown,
) => ValibotSafeParseResult | Promise<ValibotSafeParseResult>

/**
 * Create a form-level schema validator from a Valibot schema.
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
 *   schema: valibotSchema(schema, v.safeParseAsync),
 *   onSubmit: (values) => { ... },
 * })
 */
export function valibotSchema<TValues extends Record<string, unknown>>(
  schema: unknown,
  safeParseFn: GenericSafeParseFn,
): SchemaValidateFn<TValues> {
  const parse = safeParseFn as InternalParseFn
  return async (values: TValues) => {
    try {
      const result = await parse(schema, values)
      if (result.success) return {} as Partial<Record<keyof TValues, ValidationError>>
      return issuesToRecord<TValues>(valibotIssuesToGeneric(result.issues ?? []))
    } catch (err) {
      return {
        "": err instanceof Error ? err.message : String(err),
      } as Partial<Record<keyof TValues, ValidationError>>
    }
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
