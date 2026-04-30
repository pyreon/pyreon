import type { Computed, Signal } from '@pyreon/reactivity'

export type ValidationError = string | undefined

/**
 * A reactive value that can be read by calling it.
 * Both `Signal<T>` and `Computed<T>` satisfy this interface.
 */
export type Accessor<T> = Signal<T> | Computed<T>

/**
 * Field validator function. Receives the field value and all current form values
 * for cross-field validation. The optional signal can be checked to detect
 * cancellation (e.g., via AbortController when the form unmounts).
 */
export type ValidateFn<T, TValues = Record<string, unknown>> = (
  value: T,
  allValues: TValues,
  signal?: AbortSignal,
) => ValidationError | Promise<ValidationError>

export type SchemaValidateFn<TValues> = (
  values: TValues,
) =>
  | Partial<Record<keyof TValues, ValidationError>>
  | Promise<Partial<Record<keyof TValues, ValidationError>>>

export interface FieldState<T = unknown> {
  /** Current field value. */
  value: Signal<T>
  /** Field error message (undefined if no error). */
  error: Signal<ValidationError>
  /** Whether the field has been blurred at least once. */
  touched: Signal<boolean>
  /** Whether the field value differs from its initial value. */
  dirty: Signal<boolean>
  /** Whether this field is disabled (reactive). Disabled fields are excluded from submit values. */
  disabled: Signal<boolean>
  /** Whether this field is read-only (reactive). Read-only fields are included in submit values. */
  readOnly: Signal<boolean>
  /** Set the field value. */
  setValue: (value: T) => void
  /** Mark the field as touched (typically on blur). */
  setTouched: () => void
  /** Reset the field to its initial value and clear error/touched/dirty. */
  reset: () => void
}

/** Props returned by `register(field)` for binding a text / number input. */
export interface FieldRegisterProps<T> {
  value: Signal<T>
  onInput: (e: Event) => void
  onBlur: () => void
  /** Reactive disabled state — true when form OR field is disabled. */
  disabled?: Accessor<boolean>
  /** Reactive readOnly state — true when form OR field is read-only. */
  readOnly?: Accessor<boolean>
}

/**
 * Props returned by `register(field, { type: 'checkbox' })`. Omits `value`
 * — for checkboxes the form value is `checked` (boolean), and HTML's
 * `<input type="checkbox" value=...>` carries arbitrary metadata, not
 * the form-level value. Spread cleanly onto `<input type="checkbox">`
 * without losing reactivity or needing a cast.
 */
export interface FieldRegisterCheckboxProps {
  checked: Accessor<boolean>
  onInput: (e: Event) => void
  onBlur: () => void
  disabled?: Accessor<boolean>
  readOnly?: Accessor<boolean>
}

export interface FormState<TValues extends Record<string, unknown>> {
  /** Individual field states keyed by field name. */
  fields: { [K in keyof TValues]: FieldState<TValues[K]> }
  /** Whether the form is currently being submitted. */
  isSubmitting: Signal<boolean>
  /** Whether async validation is currently running. */
  isValidating: Signal<boolean>
  /** Whether any field has an error (computed — read-only). */
  isValid: Accessor<boolean>
  /** Whether any field value differs from its initial value (computed — read-only). */
  isDirty: Accessor<boolean>
  /** Number of times the form has been submitted. */
  submitCount: Signal<number>
  /** Error thrown by onSubmit (undefined if no error). */
  submitError: Signal<unknown>
  /** All current form values as a plain object. */
  values: () => TValues
  /** All current errors as a record. */
  errors: () => Partial<Record<keyof TValues, ValidationError>>
  /** Set a single field's value. */
  setFieldValue: <K extends keyof TValues>(field: K, value: TValues[K]) => void
  /** Set a single field's error (e.g. from server-side validation). */
  setFieldError: (field: keyof TValues, error: ValidationError) => void
  /** Set multiple field errors at once (e.g. from server-side validation). */
  setErrors: (errors: Partial<Record<keyof TValues, ValidationError>>) => void
  /** Clear all field errors. */
  clearErrors: () => void
  /** Reset a single field to its initial value. */
  resetField: (field: keyof TValues) => void
  /**
   * Returns props for binding an input element to a field.
   * For text/select: includes `value` signal, `onInput`, and `onBlur`.
   * For checkboxes: pass `{ type: 'checkbox' }` to get `checked` signal
   *   instead of `value` (HTML's checkbox `value` attribute carries
   *   arbitrary metadata, not the form-level value).
   * For numbers: pass `{ type: 'number' }` to use `valueAsNumber` on input.
   */
  register: {
    <K extends keyof TValues & string>(
      field: K,
      options: { type: 'checkbox' },
    ): FieldRegisterCheckboxProps
    <K extends keyof TValues & string>(
      field: K,
      options?: { type?: 'number' },
    ): FieldRegisterProps<TValues[K]>
  }
  /**
   * Submit handler — runs validation, then calls onSubmit if valid.
   * Can be called directly or as a form event handler (calls preventDefault).
   */
  handleSubmit: (e?: Event) => Promise<void>
  /** Reset all fields to initial values. */
  reset: () => void
  /** Validate all fields and return whether the form is valid. */
  validate: () => Promise<boolean>
  /**
   * Update initial values and reset all fields to the new values.
   * Useful when async data (e.g. from a query) arrives after form creation.
   * Clears all errors, touched, and dirty state.
   */
  setInitialValues: (values: Partial<TValues>) => void
  /** Whether the entire form is disabled (signal). Disabled fields are excluded from submit values. */
  disabled: Signal<boolean>
  /** Whether the entire form is read-only (signal). Read-only fields are included in submit values. */
  readOnly: Signal<boolean>
}

export interface UseFormOptions<TValues extends Record<string, unknown>> {
  /**
   * Initial values for each field. Can be:
   * - A static object: `{ email: '', password: '' }`
   * - A reactive accessor: `() => query.data() ?? { email: '', password: '' }`
   *
   * When a function is provided, the form watches it and resets fields
   * when the returned values change (e.g. when async data loads).
   */
  initialValues: TValues | (() => TValues)
  /** Called with validated values on successful submit. */
  onSubmit: (values: TValues) => void | Promise<void>
  /** Per-field validators. Receives field value and all form values. */
  validators?: Partial<{
    [K in keyof TValues]: ValidateFn<TValues[K], TValues>
  }>
  /**
   * Schema-level validator (runs after field validators).
   * Can be either a plain SchemaValidateFn<TValues> or a TypedSchemaAdapter
   * (from @pyreon/validation) which preserves type information for compile-time
   * field name validation.
   */
  schema?: SchemaValidateFn<TValues> | { readonly _infer: TValues; readonly validator: SchemaValidateFn<TValues> }
  /** When to validate: 'blur' (default), 'change', or 'submit'. */
  validateOn?: 'blur' | 'change' | 'submit'
  /** Debounce delay in ms for validators (useful for async validators). */
  debounceMs?: number
}
