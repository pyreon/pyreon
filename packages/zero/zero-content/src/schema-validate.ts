// ─── Frontmatter schema validation ─────────────────────────────────────────
//
// Standard Schema duck-typing — any zod / valibot / arktype / typia
// schema works as long as it implements the spec. We don't import any
// specific validator package; users bring their own.
//
// See https://standardschema.dev for the protocol; the relevant call
// is `schema['~standard'].validate(value)`. The contract's type is the
// official, types-only `@standard-schema/spec` package.

import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * Whether a value implements the Standard Schema protocol — i.e. has a
 * `~standard.validate` function. Used to skip non-schema values when
 * the user passes a plain object as a placeholder.
 *
 * A schema may be a FUNCTION: ArkType's `type(...)` is callable and carries
 * `~standard`, so the guard accepts `typeof 'function'` as well as objects.
 * `version` / `vendor` are not inspected — nothing here reads them.
 */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false
  const std = (value as { '~standard'?: unknown })['~standard']
  return (
    typeof std === 'object' &&
    std !== null &&
    typeof (std as { validate?: unknown }).validate === 'function'
  )
}

export interface ValidateResult<T> {
  ok: boolean
  value: T | null
  issues: StandardSchemaV1.Issue[]
}

/**
 * Apply a Standard Schema to a value. Returns `{ok, value, issues}` —
 * always resolves; never throws.
 */
export async function validateAgainstSchema<T>(
  schema: StandardSchemaV1<unknown, T>,
  input: unknown,
): Promise<ValidateResult<T>> {
  const result = await Promise.resolve(schema['~standard'].validate(input))
  if ('issues' in result && result.issues) {
    return { ok: false, value: null, issues: [...result.issues] }
  }
  return { ok: true, value: (result as { value: T }).value, issues: [] }
}

/**
 * Format Standard Schema issues into a multi-line error message for the
 * Vite plugin's `this.error()` call.
 */
export function formatSchemaIssues(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
  fileLabel: string,
  collection: string,
): string {
  const lines = issues.map((issue) => {
    const path = formatIssuePath(issue.path)
    return path ? `  - ${path}: ${issue.message}` : `  - ${issue.message}`
  })
  return `[@pyreon/zero-content] ${fileLabel}: frontmatter does not match collection "${collection}" schema (${issues.length} issue${issues.length === 1 ? '' : 's'}):
${lines.join('\n')}`
}

/**
 * Format an issue's `path` array into a dot-separated path. Handles both
 * the bare-PropertyKey form and the `{ key }` wrapper form.
 *
 * @internal exported for testing
 */
export function formatIssuePath(
  path: StandardSchemaV1.Issue['path'],
): string {
  if (!path || path.length === 0) return ''
  return path
    .map((segment) => {
      if (typeof segment === 'object' && segment !== null && 'key' in segment) {
        return String(segment.key)
      }
      return String(segment)
    })
    .join('.')
}
