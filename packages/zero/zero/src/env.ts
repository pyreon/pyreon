/**
 * Environment variable validation.
 *
 * Schema-based validation for environment variables at startup.
 * Catches missing or invalid env vars early with clear error messages.
 *
 * @example
 * ```ts
 * import { validateEnv, str, num, bool, url, oneOf } from "@pyreon/zero/env"
 *
 * const env = validateEnv({
 *   DATABASE_URL: url(),
 *   PORT: num({ default: 3000 }),
 *   NODE_ENV: oneOf(["development", "production", "test"]),
 *   DEBUG: bool({ default: false }),
 *   API_KEY: str({ required: true }),
 * })
 *
 * // env.DATABASE_URL → string (validated URL)
 * // env.PORT → number
 * // env.NODE_ENV → "development" | "production" | "test"
 * ```
 */

export interface EnvValidatorOptions<T = string> {
  /** Whether this variable is required. Default: true */
  required?: boolean
  /** Default value when not set. Makes the variable optional. */
  default?: T
  /** Human-readable description for error messages. */
  description?: string
}

export interface EnvValidator<T> {
  __type: 'env-validator'
  parse: (raw: string | undefined, key: string) => T
  required: boolean
  defaultValue?: T | undefined
}

/**
 * String validator — accepts any non-empty string.
 */
export function str(options?: EnvValidatorOptions<string>): EnvValidator<string> {
  const required = options?.default === undefined && options?.required !== false
  return {
    __type: 'env-validator',
    required,
    defaultValue: options?.default,
    parse(raw, key) {
      if (raw === undefined || raw === '') {
        if (options?.default !== undefined) return options.default
        throw new EnvError(key, 'is required but not set', options?.description)
      }
      return raw
    },
  }
}

/**
 * Number validator — parses to a number, rejects NaN.
 */
export function num(options?: EnvValidatorOptions<number>): EnvValidator<number> {
  const required = options?.default === undefined && options?.required !== false
  return {
    __type: 'env-validator',
    required,
    defaultValue: options?.default,
    parse(raw, key) {
      if (raw === undefined || raw === '') {
        if (options?.default !== undefined) return options.default
        throw new EnvError(key, 'is required but not set', options?.description)
      }
      const n = Number(raw)
      if (Number.isNaN(n)) {
        throw new EnvError(key, `must be a number, got "${raw}"`, options?.description)
      }
      return n
    },
  }
}

/**
 * Boolean validator — accepts "true"/"1" as true, "false"/"0" as false.
 */
export function bool(options?: EnvValidatorOptions<boolean>): EnvValidator<boolean> {
  const required = options?.default === undefined && options?.required !== false
  return {
    __type: 'env-validator',
    required,
    defaultValue: options?.default,
    parse(raw, key) {
      if (raw === undefined || raw === '') {
        if (options?.default !== undefined) return options.default
        throw new EnvError(key, 'is required but not set', options?.description)
      }
      const lower = raw.toLowerCase()
      if (lower === 'true' || lower === '1') return true
      if (lower === 'false' || lower === '0') return false
      throw new EnvError(key, `must be "true" or "false", got "${raw}"`, options?.description)
    },
  }
}

/**
 * URL validator — validates that the value is a valid URL.
 */
export function url(options?: EnvValidatorOptions<string>): EnvValidator<string> {
  const required = options?.default === undefined && options?.required !== false
  return {
    __type: 'env-validator',
    required,
    defaultValue: options?.default,
    parse(raw, key) {
      if (raw === undefined || raw === '') {
        if (options?.default !== undefined) return options.default
        throw new EnvError(key, 'is required but not set', options?.description)
      }
      try {
        new URL(raw)
        return raw
      } catch {
        throw new EnvError(key, `must be a valid URL, got "${raw}"`, options?.description)
      }
    },
  }
}

/**
 * Enum validator — value must be one of the allowed values.
 */
export function oneOf<T extends string>(
  values: readonly T[],
  options?: EnvValidatorOptions<T>,
): EnvValidator<T> {
  const required = options?.default === undefined && options?.required !== false
  return {
    __type: 'env-validator',
    required,
    defaultValue: options?.default,
    parse(raw, key) {
      if (raw === undefined || raw === '') {
        if (options?.default !== undefined) return options.default
        throw new EnvError(key, 'is required but not set', options?.description)
      }
      if (!values.includes(raw as T)) {
        throw new EnvError(
          key,
          `must be one of [${values.join(', ')}], got "${raw}"`,
          options?.description,
        )
      }
      return raw as T
    },
  }
}

class EnvError extends Error {
  constructor(key: string, message: string, description?: string) {
    const desc = description ? ` (${description})` : ''
    super(`[zero:env] ${key}${desc}: ${message}`)
    this.name = 'EnvError'
  }
}

type InferEnvSchema<T> = {
  [K in keyof T]: T[K] extends EnvValidator<infer V> ? V : never
}

/**
 * Validate environment variables against a schema.
 *
 * Reads from `process.env` and validates each variable.
 * Throws with clear error messages listing ALL invalid variables
 * (not just the first one).
 *
 * @example
 * ```ts
 * const env = validateEnv({
 *   DATABASE_URL: url(),
 *   PORT: num({ default: 3000 }),
 *   NODE_ENV: oneOf(["development", "production", "test"]),
 * })
 * ```
 */
export function validateEnv<T extends Record<string, EnvValidator<any>>>(
  schema: T,
  source?: Record<string, string | undefined>,
): InferEnvSchema<T> {
  const env = source ?? (typeof process !== 'undefined' ? process.env : {})
  const result: Record<string, unknown> = {}
  const errors: string[] = []

  for (const [key, validator] of Object.entries(schema)) {
    try {
      result[key] = validator.parse(env[key], key)
    } catch (e) {
      errors.push((e as Error).message)
    }
  }

  if (errors.length > 0) {
    const header = `\n[zero:env] Environment validation failed (${errors.length} error${errors.length > 1 ? 's' : ''}):\n`
    const body = errors.map((e) => `  ✗ ${e.replace('[zero:env] ', '')}`).join('\n')
    throw new Error(header + body + '\n')
  }

  return result as InferEnvSchema<T>
}
