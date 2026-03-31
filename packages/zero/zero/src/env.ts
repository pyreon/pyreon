/**
 * Environment variable validation.
 *
 * Infers types from default values — no verbose validator imports needed.
 * Explicit validators (`url()`, `oneOf()`) available for special cases.
 *
 * @example
 * ```ts
 * import { validateEnv, url, oneOf } from "@pyreon/zero/env"
 *
 * const env = validateEnv({
 *   PORT: 3000,                                // number, default 3000
 *   DEBUG: false,                              // boolean, default false
 *   HOST: "localhost",                         // string, default "localhost"
 *   DATABASE_URL: url(),                       // validated URL, required
 *   NODE_ENV: oneOf(["development", "production", "test"]),
 *   API_KEY: String,                           // required string, no default
 *   MAX_RETRIES: Number,                       // required number, no default
 * })
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

// ─── Explicit validators (for special cases) ────────────────────────────────

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

// ─── Internal helpers ───────────────────────────────────────────────────────

class EnvError extends Error {
  constructor(key: string, message: string, description?: string) {
    const desc = description ? ` (${description})` : ''
    super(`[zero:env] ${key}${desc}: ${message}`)
    this.name = 'EnvError'
  }
}

function isEnvValidator(v: unknown): v is EnvValidator<unknown> {
  return typeof v === 'object' && v !== null && (v as any).__type === 'env-validator'
}

/**
 * Convert a plain schema value to an EnvValidator.
 *
 * - `3000` → num({ default: 3000 })
 * - `false` → bool({ default: false })
 * - `"localhost"` → str({ default: "localhost" })
 * - `String` → str() (required)
 * - `Number` → num() (required)
 * - `Boolean` → bool() (required)
 * - EnvValidator → pass through
 */
function toValidator(value: unknown): EnvValidator<unknown> {
  if (isEnvValidator(value)) return value

  // Constructor markers → required, no default
  if (value === String) return str()
  if (value === Number) return num()
  if (value === Boolean) return bool()

  // Plain values → infer type + use as default
  if (typeof value === 'number') return num({ default: value })
  if (typeof value === 'boolean') return bool({ default: value })
  if (typeof value === 'string') return str({ default: value })

  throw new Error(`[zero:env] Invalid schema value: ${String(value)}. Use a default value, String/Number/Boolean, or a validator like url().`)
}

// ─── Type inference ─────────────────────────────────────────────────────────

/** Schema entry: plain value, constructor, or explicit validator. */
type SchemaEntry =
  | string | number | boolean
  | StringConstructor | NumberConstructor | BooleanConstructor
  | EnvValidator<any>

/** Infer the output type from a schema entry. */
type InferEntry<T> =
  T extends EnvValidator<infer V> ? V :
  T extends StringConstructor ? string :
  T extends NumberConstructor ? number :
  T extends BooleanConstructor ? boolean :
  T extends string ? string :
  T extends number ? number :
  T extends boolean ? boolean :
  never

type InferEnvSchema<T> = {
  [K in keyof T]: InferEntry<T[K]>
}

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Validate environment variables.
 *
 * Schema values can be:
 * - **Default values**: `3000`, `false`, `"localhost"` → type inferred, used as default
 * - **Constructors**: `String`, `Number`, `Boolean` → required, no default
 * - **Validators**: `url()`, `oneOf([...])`, `str()`, `num()`, `bool()` → explicit validation
 * - **Adapters**: `zod(z.string().url())` from `@pyreon/zero/env-zod`
 *
 * @example
 * ```ts
 * import { validateEnv, url, oneOf } from "@pyreon/zero/env"
 *
 * const env = validateEnv({
 *   PORT: 3000,                                // optional, default 3000
 *   DATABASE_URL: url(),                       // required, validated URL
 *   NODE_ENV: oneOf(["dev", "prod", "test"]),  // required, must be one of
 *   API_KEY: String,                           // required string
 *   DEBUG: false,                              // optional, default false
 * })
 * ```
 */
export function validateEnv<T extends Record<string, SchemaEntry>>(
  schema: T,
  source?: Record<string, string | undefined>,
): InferEnvSchema<T> {
  const env = source ?? (typeof process !== 'undefined' ? process.env : {})
  const result: Record<string, unknown> = {}
  const errors: string[] = []

  for (const [key, entry] of Object.entries(schema)) {
    const validator = toValidator(entry)
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

// ─── Public env (client-safe) ────────────────────────────────────────────────

/**
 * Extract public environment variables (prefixed with `ZERO_PUBLIC_`).
 *
 * @example
 * ```ts
 * const pub = publicEnv()
 * // → { API_URL: "https://...", APP_NAME: "MyApp" }
 *
 * const pub = publicEnv({ API_URL: url(), APP_NAME: "Default" })
 * // → validated against ZERO_PUBLIC_API_URL, ZERO_PUBLIC_APP_NAME
 * ```
 */
export function publicEnv(): Record<string, string>
export function publicEnv<T extends Record<string, SchemaEntry>>(schema: T): InferEnvSchema<T>
export function publicEnv(schema?: Record<string, SchemaEntry>): Record<string, unknown> {
  const prefix = 'ZERO_PUBLIC_'
  const env = typeof process !== 'undefined' ? process.env : {}

  if (!schema) {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith(prefix) && value !== undefined) {
        result[key.slice(prefix.length)] = value
      }
    }
    return result
  }

  const prefixedSource: Record<string, string | undefined> = {}
  for (const key of Object.keys(schema)) {
    prefixedSource[key] = env[`${prefix}${key}`]
  }
  return validateEnv(schema, prefixedSource)
}

// ─── Schema library adapters ────────────────────────────────────────────────
// Available via subpath imports — no code pulled unless used:
//   import { zod } from "@pyreon/zero/env-zod"
//   import { valibot } from "@pyreon/zero/env-valibot"
//   import { arktype } from "@pyreon/zero/env-arktype"
