/**
 * Valibot adapter for environment validation.
 *
 * Bridges Valibot schemas to the env validator interface.
 * Duck-typed — no valibot import required.
 *
 * @example
 * ```ts
 * import * as v from "valibot"
 * import { validateEnv } from "@pyreon/zero/env"
 * import { valibot } from "@pyreon/zero/env-valibot"
 *
 * const env = validateEnv({
 *   PORT: valibot(v.pipe(v.string(), v.transform(Number), v.number()), v.safeParse),
 *   DATABASE_URL: valibot(v.pipe(v.string(), v.url()), v.safeParse),
 *   NODE_ENV: valibot(v.picklist(["development", "production", "test"]), v.safeParse),
 * })
 * ```
 */
import type { EnvValidator } from './env'

/** Duck-typed Valibot safeParse result. */
interface ValibotResult {
  success: boolean
  output?: unknown
  issues?: Array<{ message: string }>
}

/** Any function matching Valibot's safeParse(schema, input) signature. */
type SafeParseFn = (schema: unknown, input: unknown) => ValibotResult

/**
 * Create an env validator from a Valibot schema.
 *
 * Valibot uses standalone functions, so you must pass the `safeParse`
 * function alongside the schema.
 */
export function valibot<T>(schema: unknown, safeParseFn: SafeParseFn): EnvValidator<T> {
  return {
    __type: 'env-validator',
    required: true,
    defaultValue: undefined,
    parse(raw: string | undefined, key: string) {
      if (raw === undefined || raw === '') {
        throw new Error(`[zero:env] ${key}: is required but not set`)
      }
      const result = safeParseFn(schema, raw)
      if (result.success) return result.output as T
      const msg = result.issues?.[0]?.message ?? 'validation failed'
      throw new Error(`[zero:env] ${key}: ${msg}`)
    },
  }
}
