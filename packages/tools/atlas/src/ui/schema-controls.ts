/**
 * Schema-driven controls — derive a scenario's controls from its schema.
 *
 * A component that already validates its input with a schema has declared its
 * prop shape once. Re-typing that shape as a control list is boilerplate that
 * can only drift: add a field to the schema and the workbench keeps offering
 * the old set, silently.
 *
 * This derives the controls instead, and validates the live control values
 * against the same schema — so the workbench can show what the component will
 * actually reject, rather than letting you drive it into a state the schema
 * forbids and wondering why it renders oddly.
 *
 * ── Two honest limits, both stated in the UI rather than hidden ───────────
 *
 * 1. VALIDATION works for any Standard Schema (Zod, Valibot, ArkType, `s`),
 *    because `~standard.validate` is a cross-library contract.
 * 2. INTROSPECTION — reading a schema's FIELDS to build controls — is
 *    **Zod-only**. There is no shape-reading in the Standard Schema spec, so a
 *    non-Zod schema still validates but cannot generate controls. That is the
 *    same split `@pyreon/feature` documents, and it is a property of the
 *    ecosystem, not a shortcut taken here.
 */
import { extractFields, type FieldInfo } from '@pyreon/feature'
import type { WorkbenchControl } from './catalog'

/** A schema in the loosest sense this module accepts. */
export type UnknownSchema = unknown

/** Does this value expose the Standard Schema validate contract? */
export function isStandardSchema(value: unknown): value is {
  '~standard': { validate: (v: unknown) => unknown }
} {
  // Object OR function: an ArkType schema is a callable that carries
  // `~standard`, and an object-only guard silently rejects it.
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false
  const std = (value as { '~standard'?: { validate?: unknown } })['~standard']
  return typeof std?.validate === 'function'
}

/**
 * Map one schema field to a workbench control.
 *
 * `enum` becomes a segmented picker with the real allowed values, which is the
 * whole point — a hand-written control list tends to carry a stale subset.
 */
export function fieldToControl(field: FieldInfo): WorkbenchControl {
  if (field.type === 'boolean') {
    return { key: field.name, label: field.label, type: 'bool', default: false }
  }
  if (field.type === 'enum' && field.enumValues && field.enumValues.length > 0) {
    const options = field.enumValues.map(String)
    return {
      key: field.name,
      label: field.label,
      type: 'enum',
      options,
      default: options[0] ?? '',
    }
  }
  // Everything else edits as text. A number field stays text on purpose: the
  // schema is the authority on what is valid, and coercing here would hide the
  // very rejection the validation panel exists to show.
  return { key: field.name, label: field.label, type: 'text', default: '' }
}

/**
 * Derive controls from a schema.
 *
 * Returns `[]` for a schema whose shape cannot be read — the caller renders
 * that as "introspection needs Zod", never as "this schema has no fields".
 */
export function controlsFromSchema(schema: UnknownSchema): WorkbenchControl[] {
  return extractFields(schema).map(fieldToControl)
}

/** Whether the fields of this schema can be read at all. */
export function canIntrospect(schema: UnknownSchema): boolean {
  return extractFields(schema).length > 0
}

/** One field's verdict from a live validation run. */
export interface ValidationIssue {
  /** dot-path of the offending field, `''` for a whole-object issue */
  path: string
  message: string
}

export type ValidationVerdict =
  | { state: 'valid' }
  | { state: 'invalid'; issues: ValidationIssue[] }
  /** The schema is not a Standard Schema, so nothing can be checked. */
  | { state: 'unsupported' }
  /** The schema validates asynchronously; a panel cannot await it inline. */
  | { state: 'async' }

/**
 * Validate control values against the schema.
 *
 * Synchronous by necessity — this runs inside a render path. A schema that
 * returns a Promise reports `async` rather than being awaited and silently
 * showing a stale verdict, which would be worse than saying nothing.
 */
export function validateValues(
  schema: UnknownSchema,
  values: Record<string, unknown>,
): ValidationVerdict {
  if (!isStandardSchema(schema)) return { state: 'unsupported' }

  const result = schema['~standard'].validate(values)
  if (result instanceof Promise) return { state: 'async' }

  const issues = (result as { issues?: readonly unknown[] }).issues
  if (!issues || issues.length === 0) return { state: 'valid' }

  return {
    state: 'invalid',
    issues: issues.map((raw) => {
      const issue = raw as { message?: unknown; path?: unknown }
      const path = Array.isArray(issue.path)
        ? issue.path
            .map((seg) => (typeof seg === 'object' && seg !== null ? (seg as { key?: unknown }).key : seg))
            .filter((seg) => seg !== undefined)
            .join('.')
        : ''
      return { path, message: String(issue.message ?? 'invalid') }
    }),
  }
}
