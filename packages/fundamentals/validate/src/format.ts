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
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const path = stringifyPath(issue.path ?? [])
    const message = formatError(issue, t)
    if (path in out && options.joinWith) {
      out[path] = `${out[path]}${options.joinWith}${message}`
    } else if (!(path in out)) {
      out[path] = message
    }
  }
  return out
}

/**
 * Adapt a `@pyreon/validate` schema into a `@pyreon/form` `schema` validator —
 * a `(values) => Record<field, errorMessage>` function. Runs `schema.safeParse`
 * and maps each issue's path to a per-field error via {@link formatErrorsByPath}
 * (so i18n keys resolve through `t` exactly like every other error). Valid input
 * → `{}` (no errors).
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
): (values: TValues) => Record<string, string> {
  return (values: TValues): Record<string, string> => {
    const r = schema.safeParse(values)
    return r.ok ? {} : formatErrorsByPath(r.issues, t)
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
