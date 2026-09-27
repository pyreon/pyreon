import type { ValidationError, ValidationIssue } from './types'

/**
 * Flatten a Standard Schema issue path to the canonical dot-string key
 * (`["address","city"]` / `[{key:"address"},{key:"city"}]` → `"address.city"`;
 * absent/empty → `""`, the whole-form key).
 *
 * THE single flattening implementation — the same logic previously existed as
 * three inline copies (standardSchemaToValidator, wrapStandardSchema, and the
 * per-adapter `map(String)` variants), identical by luck rather than by
 * construction. Every consumer (form's schema-error routing, store/state-tree
 * parse errors) keys on this exact format, so a drifted copy would silently
 * mis-route errors.
 */
export function flattenIssuePath(
  path: ReadonlyArray<PropertyKey | { key: PropertyKey }> | undefined,
): string {
  if (!path || path.length === 0) return ''
  let out = ''
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!
    const seg = typeof p === 'object' && p !== null ? String(p.key) : String(p)
    out = i === 0 ? seg : `${out}.${seg}`
  }
  return out
}

/**
 * A fresh, EMPTY error record with a NULL prototype. Every per-field error
 * record this package builds starts here: on a plain `{}`, `errors.constructor`
 * / `errors.toString` read as inherited functions (a field with that name looks
 * like it already has an "error", so its real one is never stored, and a
 * consumer reading an absent field gets a function back), and assigning
 * `errors['__proto__']` re-points the prototype instead of storing the message.
 */
export function emptyErrors<TValues>(): Partial<Record<keyof TValues, ValidationError>> {
  return Object.create(null) as Partial<Record<keyof TValues, ValidationError>>
}

/** A null-prototype record carrying one form-level (`''`) error from a thrown value. */
export function formLevelError<TValues>(err: unknown): Partial<Record<keyof TValues, ValidationError>> {
  const errors = emptyErrors<Record<string, unknown>>() as Record<string, ValidationError>
  errors[''] = err instanceof Error ? err.message : String(err)
  return errors as Partial<Record<keyof TValues, ValidationError>>
}

/**
 * Convert an array of validation issues into a flat field → error record.
 * For nested paths like ["address", "city"], produces "address.city".
 * When multiple issues exist for the same path, the first message wins.
 * The record has a null prototype (see {@link emptyErrors}).
 */
export function issuesToRecord<TValues extends Record<string, unknown>>(
  issues: ValidationIssue[],
): Partial<Record<keyof TValues, ValidationError>> {
  const errors = emptyErrors<TValues>()
  for (const issue of issues) {
    const key = issue.path as keyof TValues
    // First error per field wins
    if (errors[key] === undefined) {
      errors[key] = issue.message
    }
  }
  return errors
}
