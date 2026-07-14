/**
 * Cross-library schema-detection + parse helpers — shared by
 * `@pyreon/store` (schema-mode `defineStore`) and `@pyreon/state-tree`
 * (schema-mode `model`).
 *
 * Two-tier validation contract:
 *   - Tier A.1: Pyreon `TypedSchemaAdapter` (zod / valibot / arktype via
 *     this package's `zodSchema` / `valibotSchema` / `arktypeSchema`)
 *   - Tier A.2: Standard Schema-compliant instance (zod 3.24+, valibot
 *     1.0+, arktype 2.0+, Effect Schema 0.66+, any future spec-compliant
 *     library). See https://standardschema.dev/.
 *
 * The helpers in this file duck-type both shapes at runtime — no hard
 * dependencies on any specific validation library.
 */

import { flattenIssuePath } from './utils'
import type {
  ParseResult,
  SchemaValidateFn,
  StandardSchemaLike,
  ValidationError,
  ValidationIssue,
} from './types'

/**
 * Alias for `ValidationIssue` — re-exported under the schema-store /
 * state-tree friendly name. Same shape; either name works.
 */
export type SchemaIssue = ValidationIssue

/**
 * Alias for `ParseResult<T>` — re-exported under the schema-store /
 * state-tree friendly name. Same shape; either name works.
 */
export type SchemaParseResult<T> = ParseResult<T>

/**
 * Adapt a raw Standard Schema into a `SchemaValidateFn` — the whole-object
 * validator (`values → per-key error record`) that `@pyreon/form` and
 * `@pyreon/store` consume. Issue paths are flattened to dot-strings
 * (`address.city`), so a nested error routes to its ancestor field. First
 * message per path wins. Async schemas resolve naturally (the caller awaits).
 *
 * This is the bridge that lets a consumer accept a RAW zod/valibot/arktype
 * schema — no `zodSchema()` adapter, no cast:
 * `useForm({ schema: myZodSchema })`.
 */
export function standardSchemaToValidator<TValues extends Record<string, unknown>>(
  schema: StandardSchemaLike,
): SchemaValidateFn<TValues> {
  return async (values: TValues) => {
    const result = await schema['~standard'].validate(values)
    const errors: Record<string, ValidationError> = {}
    if (result != null && 'issues' in result && result.issues) {
      for (const issue of result.issues) {
        const key = flattenIssuePath(issue.path)
        if (errors[key] === undefined) errors[key] = issue.message
      }
    }
    return errors as Partial<Record<keyof TValues, ValidationError>>
  }
}

/**
 * Duck-typed `TypedSchemaAdapter` shape (Tier A.1). The `_infer` field
 * is the brand; `parse` is the sync entry point schema-driven consumers
 * (store, state-tree) need.
 */
export interface PyreonAdapterShape<T extends Record<string, unknown>> {
  readonly _infer: T
  readonly parse?: (value: unknown) => SchemaParseResult<T>
}

/**
 * @deprecated Historical name for the Standard Schema shape. Use
 * `StandardSchemaV1` (strict spec type) or `StandardSchemaLike` (lax accept
 * type) from `./types` — the canonical, single-source contract. Kept as a lax
 * alias so existing `isStandardSchema` / `wrapStandardSchema` consumers compile
 * unchanged.
 */
export type StandardSchemaShape<T> = StandardSchemaLike<T>

/**
 * Extract the inferred output type from either adapter shape.
 *   Tier A.1 → `_infer`
 *   Tier A.2 → `~standard.types.output`
 *
 * Falls back to `Record<string, unknown>` for unknown shapes — keeps
 * the consumer's downstream type machinery from collapsing to `never`.
 */
export type InferSchema<S> = S extends {
  readonly _infer: infer T extends Record<string, unknown>
}
  ? T
  : // Standard Schema (Tier A.2). Its `types` phantom is OPTIONAL per the
    // spec (`types?: { input; output }`), so we must match `types?` and
    // unwrap with `NonNullable` — matching a required `types` (the prior
    // shape) NEVER hit for a real zod/valibot/arktype schema, silently
    // collapsing every raw-schema consumer to the `Record<string, unknown>`
    // fallback. With this, passing a raw `z.object(...)` / `v.object(...)` /
    // `type(...)` directly infers its field types.
    S extends { readonly '~standard': { readonly types?: infer TY } }
    ? NonNullable<TY> extends {
        readonly output: infer O extends Record<string, unknown>
      }
      ? O
      : // No usable `types` phantom (e.g. `@pyreon/validate`'s `s.object`
        // OMITS it) — recover the output from the `validate` RETURN's success
        // branch instead, so inference is UNIVERSAL across every schema lib.
        InferFromValidate<S>
    : InferFromValidate<S>

/**
 * Fallback inference: read the output type from a Standard Schema's `validate`
 * RETURN (`{ value: O }` success branch, unwrapping a possible `Promise`) —
 * the strategy that works even when the `~standard.types` phantom is absent
 * (`@pyreon/validate`'s `s`). Falls back to `Record<string, unknown>`.
 */
type InferFromValidate<S> = S extends {
  readonly '~standard': {
    // oxlint-disable-next-line typescript/no-explicit-any -- loose param matches every validator's `validate` shape
    readonly validate: (value: any) => infer R
  }
}
  ? Extract<Awaited<R>, { readonly value: unknown }> extends {
      readonly value: infer O
    }
    ? O extends Record<string, unknown>
      ? O
      : Record<string, unknown>
    : Record<string, unknown>
  : Record<string, unknown>

/**
 * Detect a Pyreon `TypedSchemaAdapter` (Tier A.1). The `_infer` field is
 * the brand; `parse` is the sync entry point schema-driven consumers
 * need.
 */
export function isPyreonAdapter(
  value: unknown,
): value is PyreonAdapterShape<Record<string, unknown>> {
  return (
    value != null &&
    typeof value === 'object' &&
    '_infer' in value &&
    typeof (value as { parse?: unknown }).parse === 'function'
  )
}

/**
 * Detect a Standard Schema-compliant schema (Tier A.2). Spec:
 * https://standardschema.dev/
 *
 * A Standard Schema may be an OBJECT (zod ≥3.24, valibot ≥1, `@pyreon/validate`'s
 * `s`) OR a FUNCTION — **ArkType schemas are callable** (`type("string")(input)`
 * validates) that ALSO carry the `~standard` entrypoint. So the guard accepts a
 * value whose `typeof` is `'object'` OR `'function'`, as long as it carries a
 * well-formed `~standard` with a `validate` fn. Purely additive: object schemas
 * behave exactly as before; only function-carrying-`~standard` (ArkType) is
 * newly accepted. A plain function WITHOUT `~standard` still returns `false`.
 *
 * Detection returned `false` for callable schemas from this package's inception,
 * so raw ArkType silently failed Standard-Schema detection everywhere — every
 * consumer that routes "is this a Standard Schema? then validate through it"
 * (`@pyreon/form`, `@pyreon/store`, `@pyreon/state-tree`, `@pyreon/validate`,
 * `@pyreon/feature`) SKIPPED validation for a raw ArkType schema, reporting
 * VALID while the schema would REJECT.
 */
export function isStandardSchema(
  value: unknown,
): value is StandardSchemaLike<unknown> {
  if (value == null || (typeof value !== 'object' && typeof value !== 'function'))
    return false
  const std = (value as { '~standard'?: unknown })['~standard']
  return (
    std != null &&
    typeof std === 'object' &&
    typeof (std as { validate?: unknown }).validate === 'function'
  )
}

/**
 * Convert a Standard Schema instance into a `SchemaParseResult` parser.
 * Synchronous only — surfaces async validation as a Promise return so
 * callers can probe for it and throw with a clear error.
 *
 * @internal — exported for advanced consumers who construct their own
 * Standard-Schema-derived parsers. Most users go through `extractParseFn`.
 */
export function wrapStandardSchema<T extends Record<string, unknown>>(
  schema: StandardSchemaShape<unknown>,
): (value: unknown) => SchemaParseResult<T> {
  return (value: unknown) => {
    try {
      const result = schema['~standard'].validate(value)
      // Async escape — caller rejects via Promise-detection.
      if (result instanceof Promise) {
        return result as unknown as SchemaParseResult<T>
      }
      const r = result as {
        value?: unknown
        issues?: ReadonlyArray<{
          message: string
          path?: ReadonlyArray<
            string | number | symbol | { key: PropertyKey }
          >
        }>
      }
      if ('value' in r) {
        return { ok: true, value: r.value as T }
      }
      const issues = (r.issues ?? []).map((issue) => ({
        path: flattenIssuePath(issue.path),
        message: issue.message,
      }))
      return { ok: false, issues }
    } catch (err) {
      return {
        ok: false,
        issues: [
          {
            path: '',
            message: err instanceof Error ? err.message : String(err),
          },
        ],
      }
    }
  }
}

/**
 * Extract a sync `parse` function from either adapter shape. Throws if
 * neither shape matches OR if the schema's `parse` is missing (Tier A.1
 * adapter that didn't ship sync `parse`). Callers should additionally
 * probe the returned function's first call for a `Promise` return and
 * throw at construction time if so (async-only schemas are unsupported
 * for schema-store / state-tree — use `@pyreon/form` for async).
 *
 * @example
 * ```ts
 * const parse = extractParseFn(userSchema)
 * const result = parse(initial)
 * if (result instanceof Promise) {
 *   throw new Error('[Pyreon] async schemas are unsupported')
 * }
 * if (!result.ok) throw new Error(formatIssues(result.issues, 'init'))
 * const value = result.value  // parsed + coerced
 * ```
 */
export function extractParseFn<T extends Record<string, unknown>>(
  schema: unknown,
): (value: unknown) => SchemaParseResult<T> {
  if (isPyreonAdapter(schema)) {
    const parse = schema.parse
    // Unreachable: `isPyreonAdapter` already requires `parse` to be a function,
    // so this guard can never fire — kept as a defensive contract assertion.
    /* v8 ignore next 4 */
    if (!parse) {
      throw new Error(
        '[Pyreon] schema adapter is missing `parse` method. ' +
          'Upgrade @pyreon/validation to a version that exports `parse` ' +
          '(zod/valibot/arktype adapters all support it). The validator-only ' +
          'shape used by @pyreon/form is not enough for schema-driven state — ' +
          'consumers need the coerced parsed value, not just errors.',
      )
    }
    return parse as (value: unknown) => SchemaParseResult<T>
  }

  if (isStandardSchema(schema)) {
    return wrapStandardSchema<T>(schema)
  }

  throw new Error(
    '[Pyreon] `schema` must be a TypedSchemaAdapter (from @pyreon/validation) ' +
      'or a Standard Schema-compliant object (zod 3.24+, valibot 1.0+, ' +
      'arktype 2.0+, Effect Schema, etc.). ' +
      'See https://standardschema.dev/ for the spec.',
  )
}

/**
 * Format schema issues into a readable error message. Truncates after
 * 5 issues with a "and N more" suffix.
 *
 * @param issues - normalized validation issues from a parse result
 * @param op - the operation that failed (for the error prefix); free-form
 *   string so consumers can pass their own operation labels (`'init'`,
 *   `'set'`, `'patch'`, `'create'`, `'$set'`, etc.)
 */
export function formatIssues(issues: SchemaIssue[], op: string): string {
  const lines = issues
    .slice(0, 5)
    .map((i) => `  - ${i.path || '<root>'}: ${i.message}`)
  const more =
    issues.length > 5 ? `\n  ... and ${issues.length - 5} more` : ''
  return `[Pyreon] Schema validation failed (${op}):\n${lines.join('\n')}${more}`
}
