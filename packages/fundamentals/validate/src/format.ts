/**
 * Issue formatting helpers — the i18n bridge for validation errors.
 *
 * Standard Schema's `Issue` has a `message: string` and an optional
 * `path: ReadonlyArray<PropertyKey | { key }>`. Pyreon extends this
 * with optional `{ key, params, fallback }` for i18n routing. Native
 * StdSchema issues (from Zod / Valibot / ArkType) don't carry those
 * fields — `formatErrors` handles both shapes gracefully (no key →
 * fallback → message).
 */

import type { Schema } from './core/schema'
import type { PyreonIssue, StandardSchemaIssue, TFn } from './types'

/**
 * Resolve an issue to a human-readable string. Resolution order:
 *
 *   1. `issue.key` + `t` provided AND `t` returns a non-key string
 *      (i.e. the i18n provider actually has a translation for this key)
 *      → use the resolved string.
 *   2. `issue.fallback` if set.
 *   3. `issue.message` (always present per StdSchema spec).
 *
 * Native StdSchema issues without `key`/`fallback` fall through to
 * `message` immediately — no overhead for non-Pyreon validators.
 */
export function formatError(
  issue: StandardSchemaIssue | PyreonIssue,
  t?: TFn,
): string {
  const pyreonIssue = issue as PyreonIssue
  if (pyreonIssue.key && t) {
    const resolved = t(pyreonIssue.key, pyreonIssue.params)
    // t() echoes the key back when no translation exists — fall through.
    if (resolved && resolved !== pyreonIssue.key) return resolved
  }
  if (pyreonIssue.fallback) return pyreonIssue.fallback
  return issue.message
}

/**
 * Resolve an array of issues to human-readable strings. Same per-issue
 * logic as `formatError`. Returns the strings in the original order so
 * paths line up with the issues array.
 *
 * @example
 * ```ts
 * import { useI18n } from '@pyreon/i18n'
 * import { formatErrors } from '@pyreon/validate'
 *
 * const { t } = useI18n()
 * const result = schema['~standard'].validate(input)
 * if (result.issues) {
 *   const messages = formatErrors(result.issues, t)
 *   // → ['Email is required', 'Password too short', ...]
 * }
 * ```
 */
export function formatErrors(
  issues: ReadonlyArray<StandardSchemaIssue | PyreonIssue>,
  t?: TFn,
): string[] {
  return issues.map((issue) => formatError(issue, t))
}

/**
 * Build a per-field error map from a StdSchema issue array — keyed by
 * the issue's path joined with `.`. Used by `@pyreon/form`'s `Errors`
 * shape (`Partial<Record<fieldName, string>>`). Path-less issues land
 * under the empty-string key (form-level error).
 *
 * On collision, the FIRST issue wins (matches `@pyreon/validation`'s
 * existing `issuesToRecord` behaviour — caller can opt in to "all
 * messages joined" by passing `joinWith`).
 */
export function formatErrorsByPath(
  issues: ReadonlyArray<StandardSchemaIssue | PyreonIssue>,
  t?: TFn,
  options: { joinWith?: string } = {},
): Record<string, string> {
  // NULL-PROTOTYPE record: on a plain `{}`, `path in out` is true for every
  // inherited name (`constructor`, `toString`, …) so a field with that name
  // never got its error, and assigning `out['__proto__']` re-pointed the
  // prototype instead of storing the message — the form then read the field
  // as VALID. A null-prototype object has no inherited names and treats
  // `__proto__` as an ordinary own key.
  const out = Object.create(null) as Record<string, string>
  for (const issue of issues) {
    const path = stringifyPath(issue.path ?? [])
    const message = formatError(issue, t)
    const existing = out[path]
    if (existing === undefined) out[path] = message
    else if (options.joinWith) out[path] = `${existing}${options.joinWith}${message}`
  }
  return out
}

/**
 * Adapt a `@pyreon/validate` schema into a `@pyreon/form` `schema` validator —
 * a `(values) => Record<field, errorMessage>` function. Validates through the
 * schema's Standard Schema entrypoint and maps each issue's path to a
 * per-field error via {@link formatErrorsByPath} (so i18n keys resolve through
 * `t` exactly like every other error). Valid input → `{}` (no errors).
 *
 * ASYNC schemas (an async `.refine` / `.transform`, or a registered
 * `.serverCheck`) are supported: the validator then returns a `Promise` of the
 * error record, which `@pyreon/form`'s `SchemaValidateFn` accepts. A sync
 * schema keeps returning the record synchronously.
 *
 * Designed for a FLAT object schema (`s.object({ email, age })`) whose field
 * names match the form's fields — each issue path is a single segment that
 * becomes the field key. Nested schemas produce dotted keys (`user.email`)
 * which won't match a flat form field; use a flat schema (or `@pyreon/form`
 * field arrays) for form binding.
 *
 * @example
 * const schema = s.object({ email: s.string().email(), age: s.number().int().min(18) })
 * const form = useForm({ fields: [emailField, ageField], schema: toFormValidator(schema), onSubmit })
 */
export function toFormValidator<TValues>(
  schema: Schema<TValues>,
  t?: TFn,
): (values: TValues) => Record<string, string> | Promise<Record<string, string>> {
  const toErrors = (r: { readonly issues?: ReadonlyArray<StandardSchemaIssue> | undefined }): Record<string, string> =>
    r.issues ? formatErrorsByPath(r.issues, t) : {}
  return (values: TValues) => {
    const r = schema['~standard'].validate(values)
    return r instanceof Promise ? r.then(toErrors) : toErrors(r)
  }
}

/**
 * Normalise a StdSchema path segment array to a dot-separated string.
 * Each segment may be either a `PropertyKey` directly OR a `{ key }`
 * wrapper (Standard Schema allows both — different libs emit different
 * shapes).
 */
function stringifyPath(
  path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>,
): string {
  return path
    .map((seg) => {
      if (typeof seg === 'object' && seg !== null && 'key' in seg) {
        return String(seg.key)
      }
      return String(seg)
    })
    .join('.')
}
