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
 * Convert an array of validation issues into a flat field → error record.
 * For nested paths like ["address", "city"], produces "address.city".
 * When multiple issues exist for the same path, the first message wins.
 */
export function issuesToRecord<TValues extends Record<string, unknown>>(
  issues: ValidationIssue[],
): Partial<Record<keyof TValues, ValidationError>> {
  const errors = {} as Partial<Record<keyof TValues, ValidationError>>
  for (const issue of issues) {
    const key = issue.path as keyof TValues
    // First error per field wins
    if (errors[key] === undefined) {
      errors[key] = issue.message
    }
  }
  return errors
}
