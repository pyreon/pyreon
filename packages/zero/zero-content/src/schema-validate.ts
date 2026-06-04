// ─── Frontmatter schema validation ─────────────────────────────────────────
//
// Standard Schema duck-typing — any zod / valibot / arktype / typia
// schema works as long as it implements the spec. We don't import any
// specific validator package; users bring their own.
//
// See https://standardschema.dev for the protocol; the relevant call
// is `schema['~standard'].validate(value)`.

/** Minimal Standard Schema interface — enough to call `validate`. */
export interface StandardSchemaLike<TInput = unknown, TOutput = unknown> {
  '~standard': {
    version: 1
    vendor: string
    validate: (input: TInput) => Promise<
      | { value: TOutput; issues?: undefined }
      | { issues: ReadonlyArray<StandardSchemaIssue> }
    > | { value: TOutput; issues?: undefined } | { issues: ReadonlyArray<StandardSchemaIssue> }
  }
}

export interface StandardSchemaIssue {
  message: string
  path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>
}

/**
 * Whether a value implements the Standard Schema protocol — i.e. has a
 * `~standard.validate` function. Used to skip non-schema values when
 * the user passes a plain object as a placeholder.
 */
export function isStandardSchema(value: unknown): value is StandardSchemaLike {
  return (
    value !== null &&
    typeof value === 'object' &&
    '~standard' in value &&
    typeof (value as Record<string, unknown>)['~standard'] === 'object' &&
    typeof (
      (value as { '~standard': { validate?: unknown } })['~standard'].validate
    ) === 'function'
  )
}

export interface ValidateResult<T> {
  ok: boolean
  value: T | null
  issues: StandardSchemaIssue[]
}

/**
 * Apply a Standard Schema to a value. Returns `{ok, value, issues}` —
 * always resolves; never throws.
 */
export async function validateAgainstSchema<T>(
  schema: StandardSchemaLike<unknown, T>,
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
  issues: ReadonlyArray<StandardSchemaIssue>,
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
  path: ReadonlyArray<PropertyKey | { key: PropertyKey }> | undefined,
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
