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

import { isServer } from '@pyreon/reactivity'

/**
 * Prefix marking an env var as PUBLIC (safe to inline into the client bundle).
 * Only `ZERO_PUBLIC_*` vars are ever exposed to the browser — anything without
 * it (e.g. `DATABASE_URL`) is structurally unable to reach the client.
 */
export const PUBLIC_ENV_PREFIX = 'ZERO_PUBLIC_'

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
    super(`[Pyreon] ${key}${desc}: ${message}`)
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

  // Standard Schema (zod / valibot / arktype / @pyreon/validate `s`) — duck-typed
  if (isStandardSchema(value)) return standardSchemaValidator(value)

  throw new Error(`[Pyreon] Invalid schema value: ${String(value)}. Use a default value, String/Number/Boolean, a validator like url(), or a Standard Schema (zod / valibot / @pyreon/validate).`)
}

// ─── Standard Schema support (zero-dependency) ───────────────────────────────
// https://standardschema.dev — a tiny shared contract exposed via a `~standard`
// property that zod, valibot, arktype, AND @pyreon/validate's `s` all implement.
// Duck-typing it means users bring their OWN schema and @pyreon/zero depends on
// no validation library.

interface StandardSchemaLike<Output = unknown> {
  readonly '~standard': {
    readonly types?: { readonly output: Output }
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: unknown }
      | { readonly issues: ReadonlyArray<{ readonly message: string }> }
      | Promise<unknown>
  }
}

function isStandardSchema(value: unknown): value is StandardSchemaLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~standard' in value &&
    typeof (value as StandardSchemaLike)['~standard']?.validate === 'function'
  )
}

/**
 * Wrap any Standard Schema as an env validator. The raw env STRING is handed to
 * the schema, so use a coercing schema for non-string values
 * (`z.coerce.number()`, `s.coerce.number()`, `s.stringbool()`). Required /
 * optional / default are delegated to the schema itself (e.g. zod `.optional()`
 * / `.default(...)`). Async schemas are rejected — env resolves synchronously.
 */
function standardSchemaValidator(stdSchema: StandardSchemaLike): EnvValidator<unknown> {
  return {
    __type: 'env-validator',
    required: true,
    defaultValue: undefined,
    parse(raw, key) {
      const result = stdSchema['~standard'].validate(raw)
      if (result instanceof Promise) {
        throw new EnvError(
          key,
          'async validation is not supported for env vars — use a synchronous schema',
        )
      }
      if ('issues' in result && result.issues) {
        throw new EnvError(key, result.issues.map((i) => i.message).join('; '))
      }
      return (result as { value: unknown }).value
    },
  }
}

// ─── Type inference ─────────────────────────────────────────────────────────

/** Schema entry: plain value, constructor, explicit validator, or Standard Schema. */
type SchemaEntry =
  | string | number | boolean
  | StringConstructor | NumberConstructor | BooleanConstructor
  | EnvValidator<any>
  | StandardSchemaLike<any>

/** Infer the output type from a schema entry. */
type InferEntry<T> =
  T extends EnvValidator<infer V> ? V :
  T extends StandardSchemaLike<infer O> ? O :
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
 * - **Custom**: `schema(raw => z.coerce.number().parse(raw))` — bridge to any schema library
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
  envSchema: T,
  source?: Record<string, string | undefined>,
): InferEnvSchema<T> {
  const env = source ?? (typeof process !== 'undefined' ? process.env : {})
  const result: Record<string, unknown> = {}
  const errors: string[] = []

  for (const [key, entry] of Object.entries(envSchema)) {
    const validator = toValidator(entry)
    try {
      result[key] = validator.parse(env[key], key)
    } catch (e) {
      errors.push((e as Error).message)
    }
  }

  if (errors.length > 0) {
    const header = `\n[Pyreon] Environment validation failed (${errors.length} error${errors.length > 1 ? 's' : ''}):\n`
    const body = errors.map((e) => `  ✗ ${e.replace('[Pyreon] ', '')}`).join('\n')
    throw new Error(header + body + '\n')
  }

  return result as InferEnvSchema<T>
}

// ─── Public env (isomorphic — works in the browser) ──────────────────────────

/**
 * Build-time snapshot of `ZERO_PUBLIC_*` vars (keys prefix-stripped), injected
 * by `@pyreon/zero`'s vite-plugin as a `define` constant into BOTH the client
 * and SSR bundles — so server-render and client-hydrate read the SAME values
 * (no hydration mismatch). `undefined` when the plugin isn't present (tests,
 * raw node, non-zero builds), in which case we fall back to a live `process.env`
 * scan. The `typeof` guard is safe on an undeclared identifier.
 */
declare const __ZERO_PUBLIC_ENV__: Record<string, string> | undefined

function publicEnvSource(): Record<string, string | undefined> {
  // The build-time snapshot is the source of truth — identical on server +
  // client, so a public value rendered during SSR matches after hydration.
  if (typeof __ZERO_PUBLIC_ENV__ !== 'undefined') return __ZERO_PUBLIC_ENV__

  // Fallback (no zero build inlined the values): scan live `process.env` on the
  // server; the browser legitimately gets `{}` (it has no `process.env`).
  if (isServer && typeof process !== 'undefined') {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(PUBLIC_ENV_PREFIX) && value !== undefined) {
        out[key.slice(PUBLIC_ENV_PREFIX.length)] = value
      }
    }
    return out
  }
  return {}
}

/**
 * Read public environment variables (prefixed with `ZERO_PUBLIC_`). Works
 * **isomorphically** — in server code AND in the browser, where the values are
 * inlined at build time by `@pyreon/zero`'s vite-plugin (only `ZERO_PUBLIC_*`
 * vars ever reach the client bundle; a secret without the prefix cannot leak).
 *
 * @example
 * ```ts
 * // .env:  ZERO_PUBLIC_API_URL=https://api.example.com
 * const pub = publicEnv()
 * // → { API_URL: "https://api.example.com" }
 *
 * // Validated + typed (any Standard Schema — zod / valibot / @pyreon/validate):
 * const pub = publicEnv({ API_URL: url(), PORT: z.coerce.number() })
 * ```
 */
export function publicEnv(): Record<string, string>
export function publicEnv<T extends Record<string, SchemaEntry>>(envSchema: T): InferEnvSchema<T>
export function publicEnv(envSchema?: Record<string, SchemaEntry>): Record<string, unknown> {
  const source = publicEnvSource()
  if (!envSchema) return source as Record<string, string>
  return validateEnv(envSchema, source)
}

// ─── Custom validator escape hatch ──────────────────────────────────────────

/**
 * Create an env validator from a custom parse function.
 * Use this to integrate any schema library (Zod, Valibot, ArkType, etc.).
 *
 * @example
 * ```ts
 * import { z } from "zod"
 * import { validateEnv, schema } from "@pyreon/zero/env"
 *
 * const env = validateEnv({
 *   PORT: schema(raw => z.coerce.number().parse(raw)),
 *   DATABASE_URL: schema(raw => z.string().url().parse(raw)),
 *   HOST: "localhost",  // plain defaults still work alongside
 * })
 * ```
 */
export function schema<T>(parse: (raw: string) => T): EnvValidator<T> {
  return {
    __type: 'env-validator',
    required: true,
    defaultValue: undefined,
    parse(raw: string | undefined, key: string) {
      if (raw === undefined || raw === '') {
        throw new Error(`[Pyreon] ${key}: is required but not set`)
      }
      try {
        return parse(raw)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`[Pyreon] ${key}: ${msg}`)
      }
    },
  }
}
