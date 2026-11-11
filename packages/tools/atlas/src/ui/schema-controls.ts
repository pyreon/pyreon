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

// ── Where each control comes from ─────────────────────────────────────────

/** One row of the Schema panel's table. */
export interface SchemaRow {
  key: string
  /** The value's type as declared (`string`, `boolean?`, `soft | solid`). */
  type: string
  /** The editor the Controls panel renders for it. */
  control: 'text' | 'select' | 'switch' | 'number' | 'color'
  /** Which declaration it came from, in words. */
  source: string
  /** `atlas dev` saw it appear on a rescan at this time (epoch ms). */
  addedAt?: number
}

/** `ControlSource` in the words the panel shows. */
export const SOURCE_LABEL: Record<string, string> = {
  'prop-type': 'prop type',
  dimension: 'rocketstyle dimension',
  content: 'content seed',
  spec: 'defineComponent',
}

const CONTROL_OF: Record<WorkbenchControl['type'], SchemaRow['control']> = {
  text: 'text',
  enum: 'select',
  bool: 'switch',
  number: 'number',
  color: 'color',
}

function controlType(c: WorkbenchControl): string {
  // An enum's members ARE its type (a TS union), and the fact that decides
  // whether a usage is correct — the drift a derived control list removes.
  if (c.type === 'enum') return c.options?.length ? c.options.join(' | ') : 'enum'
  if (c.type === 'bool') return 'boolean'
  if (c.type === 'text') return 'string'
  return c.type
}

/**
 * The Schema panel's table: every control the component exposes, with the
 * declaration it came from, plus every schema field the controls do not
 * already cover.
 *
 * A field the schema declares is sourced `schema` even when the catalog also
 * lists a control for it: the schema is the contract the live values are
 * validated against, so it is the declaration that decides. A hand-written
 * catalog's controls carry no provenance and read `catalog` — the entry
 * itself is the declaration.
 */
export function schemaRows(controls: readonly WorkbenchControl[], fields: readonly FieldInfo[]): SchemaRow[] {
  const byName = new Map(fields.map((f) => [f.name, f]))
  const fieldRow = (f: FieldInfo, addedAt?: number): SchemaRow => {
    const ctrl = fieldToControl(f)
    const base = f.type === 'enum' && f.enumValues?.length ? f.enumValues.join(' | ') : f.type
    return {
      key: f.name,
      type: f.optional ? `${base}?` : base,
      control: CONTROL_OF[ctrl.type],
      source: 'schema',
      ...(addedAt ? { addedAt } : {}),
    }
  }
  const rows: SchemaRow[] = controls.map((c) => {
    const field = byName.get(c.key)
    if (field) return fieldRow(field, c.addedAt)
    return {
      key: c.key,
      type: controlType(c),
      control: CONTROL_OF[c.type],
      source: (c.source && SOURCE_LABEL[c.source]) ?? 'catalog',
      ...(c.addedAt ? { addedAt: c.addedAt } : {}),
    }
  })
  const listed = new Set(controls.map((c) => c.key))
  for (const f of fields) if (!listed.has(f.name)) rows.push(fieldRow(f))
  return rows
}

/** "just now" / "3 min ago" / "2 h ago" — coarse on purpose, it is a nudge. */
export function addedAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'added just now'
  const min = Math.floor(s / 60)
  if (min < 60) return `added ${min} min ago`
  return `added ${Math.floor(min / 60)} h ago`
}

/** Rows this recent carry the "new" chip. */
export const NEW_FOR_MS = 10 * 60 * 1000
