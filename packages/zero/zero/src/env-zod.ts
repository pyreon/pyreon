/**
 * Zod adapter for environment validation.
 *
 * Bridges Zod schemas to the env validator interface, so users who
 * already use Zod can reuse their schemas for env validation.
 * Duck-typed — works with Zod v3 and v4 without importing zod.
 *
 * @example
 * ```ts
 * import { z } from "zod"
 * import { validateEnv } from "@pyreon/zero/env"
 * import { zod } from "@pyreon/zero/env-zod"
 *
 * const env = validateEnv({
 *   PORT: zod(z.coerce.number().default(3000)),
 *   DATABASE_URL: zod(z.string().url()),
 *   NODE_ENV: zod(z.enum(["development", "production", "test"])),
 *   DEBUG: zod(z.coerce.boolean().default(false)),
 * })
 * ```
 */
import type { EnvValidator } from './env'

/** Duck-typed Zod schema — works with v3 and v4. */
interface ZodSchema<T = unknown> {
  safeParse(data: unknown): {
    success: boolean
    data?: T
    error?: { issues: Array<{ message: string }> }
  }
}

/**
 * Create an env validator from a Zod schema.
 *
 * The schema receives the raw string value from the environment.
 * Use `z.coerce.number()` for automatic string→number coercion.
 *
 * If the schema has a `.default()`, the variable is treated as optional.
 */
export function zod<T>(schema: ZodSchema<T>): EnvValidator<T> {
  // Detect if schema has a default (Zod wraps in ZodDefault)
  const hasDefault = '_def' in schema && typeof (schema as any)._def === 'object'
    && (schema as any)._def.typeName === 'ZodDefault'

  return {
    __type: 'env-validator',
    required: !hasDefault,
    defaultValue: undefined,
    parse(raw: string | undefined, key: string) {
      // Pass undefined through — Zod's .default() handles it
      const input = raw === '' ? undefined : raw
      const result = schema.safeParse(input)
      if (result.success) return result.data as T
      const msg = result.error?.issues[0]?.message ?? 'validation failed'
      throw new Error(`[zero:env] ${key}: ${msg}`)
    },
  }
}
