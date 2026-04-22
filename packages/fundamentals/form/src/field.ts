import type { ValidateFn } from './types'

// ─── FieldDefinition ────────────────────────────────────────────────────────

const FIELD_BRAND = Symbol.for('pyreon.field')

/**
 * A field definition — carries the field name, default value, and optional
 * validator as pure data. Used with `useForm({ fields: [...] })` to compose
 * type-safe forms from reusable field definitions.
 *
 * The `N` generic captures the field name as a string literal type,
 * enabling compile-time type inference for form values.
 */
export interface FieldDefinition<N extends string = string, T = unknown> {
  readonly [FIELD_BRAND]: true
  readonly name: N
  readonly defaultValue: T
  readonly validator?: ValidateFn<T, any> | undefined
  /** Phantom type carrier for InferValues. Not used at runtime. */
  readonly _type?: T | undefined
}

/**
 * Check if a value is a FieldDefinition.
 */
export function isFieldDefinition(value: unknown): value is FieldDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[FIELD_BRAND] === true
  )
}

/**
 * Define a reusable form field — name, default value, and optional validator.
 *
 * The field definition is pure data (no rendering). Pass an array of field
 * definitions to `useForm({ fields: [...] })` to compose a type-safe form.
 * Components render fields however they want via `useField('name')`.
 *
 * @example
 * ```ts
 * const email = field('email', '', (v) => !v.includes('@') ? 'Invalid' : undefined)
 * const password = field('password', '', (v) => v.length < 8 ? 'Too short' : undefined)
 * const confirm = field('confirmPassword', '', (v, all) => v !== all.password ? 'Mismatch' : undefined)
 *
 * const form = useForm({
 *   fields: [email, password, confirm],
 *   onSubmit: (values) => { /* { email: string; password: string; confirmPassword: string } *\/ }
 * })
 * ```
 */
export function field<N extends string, T>(
  name: N,
  defaultValue: T,
  validator?: ValidateFn<T, any>,
): FieldDefinition<N, T> {
  return {
    [FIELD_BRAND]: true,
    name,
    defaultValue,
    validator,
  } as FieldDefinition<N, T>
}

// ─── Type-level inference ───────────────────────────────────────────────────

/**
 * Infer the form values type from an array of field definitions.
 *
 * @example
 * ```ts
 * type Values = InferFieldValues<[FieldDefinition<'email', string>, FieldDefinition<'age', number>]>
 * // { email: string; age: number }
 * ```
 */
export type InferFieldValues<T extends readonly FieldDefinition<string, unknown>[]> = {
  [F in T[number] as F extends FieldDefinition<infer N, any> ? N : never]: F extends FieldDefinition<
    string,
    infer V
  >
    ? V
    : never
}
