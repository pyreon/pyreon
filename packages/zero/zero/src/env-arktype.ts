/**
 * ArkType adapter for environment validation.
 *
 * Bridges ArkType schemas to the env validator interface.
 * Duck-typed — no arktype import required.
 *
 * @example
 * ```ts
 * import { type } from "arktype"
 * import { validateEnv } from "@pyreon/zero/env"
 * import { arktype } from "@pyreon/zero/env-arktype"
 *
 * const env = validateEnv({
 *   PORT: arktype(type("string.numeric.parse")),
 *   DATABASE_URL: arktype(type("string.url")),
 *   NODE_ENV: arktype(type("'development' | 'production' | 'test'")),
 * })
 * ```
 */
import type { EnvValidator } from './env'

/** Duck-typed ArkType errors. */
interface ArkErrors extends Array<{ message: string }> {
  summary: string
}

/** Callable ArkType Type instance. */
type ArkTypeCallable = (data: unknown) => unknown

function isArkErrors(result: unknown): result is ArkErrors {
  return Array.isArray(result) && 'summary' in (result as object)
}

/**
 * Create an env validator from an ArkType schema.
 *
 * ArkType types are callable — `type("string")(value)` returns
 * the parsed value or an `ArkErrors` array.
 */
export function arktype<T>(schema: ArkTypeCallable): EnvValidator<T> {
  return {
    __type: 'env-validator',
    required: true,
    defaultValue: undefined,
    parse(raw: string | undefined, key: string) {
      if (raw === undefined || raw === '') {
        throw new Error(`[zero:env] ${key}: is required but not set`)
      }
      const result = schema(raw)
      if (isArkErrors(result)) {
        const msg = result[0]?.message ?? 'validation failed'
        throw new Error(`[zero:env] ${key}: ${msg}`)
      }
      return result as T
    },
  }
}
