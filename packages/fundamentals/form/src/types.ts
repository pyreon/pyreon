import type { Computed, Signal } from '@pyreon/reactivity'

export type ValidationError = string | undefined

/**
 * A reactive value that can be read by calling it.
 * Both `Signal<T>` and `Computed<T>` satisfy this interface.
 */
export type Accessor<T> = Signal<T> | Computed<T>

/**
 * Field validator function. Receives the field value and all current form values
 * for cross-field validation.
 */
export type ValidateFn<T, TValues = Record<string, unknown>> = (
  value: T,
  allValues: TValues,
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
  /** Set the field value. */
  setValue: (value: T) => void
  /** Mark the field as touched (typically on blur). */
  setTouched: () => void
  /** Reset the field to its initial value and clear error/touched/dirty. */
  reset: () => void
}

/** Props returned by `register()` for binding an input element. */
export interface FieldRegisterProps<T> {
  value: Signal<T>
  onInput: (e: Event) => void
  onBlur: () => void
  checked?: Accessor<boolean>
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
   * For checkboxes: pass `{ type: 'checkbox' }` to also get a `checked` signal.
   * For numbers: pass `{ type: 'number' }` to use `valueAsNumber` on input.
   */
  register: <K extends keyof TValues & string>(
    field: K,
    options?: { type?: 'checkbox' | 'number' },
  ) => FieldRegisterProps<TValues[K]>
  /**
   * Submit handler — runs validation, then calls onSubmit if valid.
   * Can be called directly or as a form event handler (calls preventDefault).
   */
  handleSubmit: (e?: Event) => Promise<void>
  /** Reset all fields to initial values. */
  reset: () => void
  /** Validate all fields and return whether the form is valid. */
  validate: () => Promise<boolean>
}

export interface UseFormOptions<TValues extends Record<string, unknown>> {
  /** Initial values for each field. */
  initialValues: TValues
  /** Called with validated values on successful submit. */
  onSubmit: (values: TValues) => void | Promise<void>
  /** Per-field validators. Receives field value and all form values. */
  validators?: Partial<{
    [K in keyof TValues]: ValidateFn<TValues[K], TValues>
  }>
  /** Schema-level validator (runs after field validators). */
  schema?: SchemaValidateFn<TValues>
  /** When to validate: 'blur' (default), 'change', or 'submit'. */
  validateOn?: 'blur' | 'change' | 'submit'
  /** Debounce delay in ms for validators (useful for async validators). */
  debounceMs?: number
}
