import type { Computed, Signal } from '@pyreon/reactivity'
import type {
  SchemaValidateFn,
  StandardSchemaLike,
  ValidateFn,
  ValidationError,
} from '@pyreon/validation'

// The validation contract (ValidationError / ValidateFn / SchemaValidateFn /
// StandardSchemaLike) lives in @pyreon/validation — the universal, stack-wide
// validation gate. @pyreon/form CONSUMES it. Re-exported here so the historical
// `import { ValidationError } from '@pyreon/form'` public API keeps working.
export type { SchemaValidateFn, StandardSchemaLike, ValidateFn, ValidationError }

/**
 * A reactive value that can be read by calling it.
 * Both `Signal<T>` and `Computed<T>` satisfy this interface.
 */
export type Accessor<T> = Signal<T> | Computed<T>

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
  /** Stable input id (auto-generated). Pairs with `labelProps().for` and the
   * error element's id (`errorProps().id`) for automatic ARIA association. */
  id: string
  value: Signal<T>
  onInput: (e: Event) => void
  onBlur: () => void
  /** Reactive disabled state — true when form OR field is disabled. */
  disabled?: Accessor<boolean>
  /** Reactive readOnly state — true when form OR field is read-only. */
  readOnly?: Accessor<boolean>
  /** Reactive `aria-invalid` — `'true'` while the field has an error, else the
   * attribute is removed (a valid field carries no `aria-invalid`). */
  'aria-invalid'?: Accessor<'true' | undefined>
  /** Reactive `aria-describedby` — points at the error element (`errorProps`)
   * while errored, removed when valid, so nothing dangles. */
  'aria-describedby'?: Accessor<string | undefined>
}

/**
 * Props returned by `register(field, { type: 'checkbox' })`. Omits `value`
 * — for checkboxes the form value is `checked` (boolean), and HTML's
 * `<input type="checkbox" value=...>` carries arbitrary metadata, not
 * the form-level value. Spread cleanly onto `<input type="checkbox">`
 * without losing reactivity or needing a cast.
 */
export interface FieldRegisterCheckboxProps {
  /** Stable input id (auto-generated). See `FieldRegisterProps.id`. */
  id: string
  checked: Accessor<boolean>
  onInput: (e: Event) => void
  onBlur: () => void
  disabled?: Accessor<boolean>
  readOnly?: Accessor<boolean>
  /** Reactive `aria-invalid` — see `FieldRegisterProps`. */
  'aria-invalid'?: Accessor<'true' | undefined>
  /** Reactive `aria-describedby` — see `FieldRegisterProps`. */
  'aria-describedby'?: Accessor<string | undefined>
}

/** Props for a field's ERROR element (`errorProps(field)`) — spread onto the
 * element that displays the field's error message. Its `id` matches the
 * input's `aria-describedby`, and `role="alert"` announces the message. */
export interface FieldErrorProps {
  id: string
  role: 'alert'
}

/** Props for a field's LABEL element (`labelProps(field)`) — `for` matches the
 * input's auto-generated `id`. */
export interface FieldLabelProps {
  for: string
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
  /** Whether the form has been submitted at least once (computed: `submitCount > 0`). */
  isSubmitted: Accessor<boolean>
  /**
   * Whether the MOST RECENT submit completed successfully — `onSubmit` ran
   * without a validation failure and without throwing. Reset to `false` at
   * the start of each submit attempt and on `reset()`. (react-hook-form
   * parity: `formState.isSubmitSuccessful`.)
   */
  isSubmitSuccessful: Signal<boolean>
  /** Error thrown by onSubmit (undefined if no error). */
  submitError: Signal<unknown>
  /** All current form values as a plain object. */
  values: () => TValues
  /**
   * Read all current values, or a single field's value (react-hook-form
   * parity: `getValues()` / `getValues(name)`). The no-arg form is
   * equivalent to `values()`.
   */
  getValues: {
    (): TValues
    <K extends keyof TValues>(field: K): TValues[K]
  }
  /** All current errors as a record. */
  errors: () => Partial<Record<keyof TValues, ValidationError>>
  /**
   * The dirty fields as a record — only fields whose value differs from
   * their initial value are present, each mapped to `true`. Reactive: reads
   * each field's `dirty` signal, so calling this inside a reactive scope
   * tracks the set. (react-hook-form parity: `formState.dirtyFields`.)
   */
  dirtyFields: () => Partial<Record<keyof TValues, boolean>>
  /**
   * The touched fields as a record — only fields that have been blurred at
   * least once are present, each mapped to `true`. Reactive. (react-hook-form
   * parity: `formState.touchedFields`.)
   */
  touchedFields: () => Partial<Record<keyof TValues, boolean>>
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
   * Props for a field's ERROR element. Spread onto the element that renders
   * the field's error message: `<span {...form.errorProps('email')}>{err}</span>`.
   * Its `id` matches the input's reactive `aria-describedby`, so the
   * input↔error association is automatic; `role="alert"` announces it.
   */
  errorProps: (field: keyof TValues & string) => FieldErrorProps
  /**
   * Props for a field's LABEL element — `for` matches the input's auto `id`:
   * `<label {...form.labelProps('email')}>Email</label>`. Programmatic
   * label↔control association without hand-threading ids.
   */
  labelProps: (field: keyof TValues & string) => FieldLabelProps
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
   * Validate a single field, a subset of fields, or — with no argument —
   * the whole form (equivalent to `validate()`). Runs the field validators
   * (immediately, bypassing `debounceMs`) + the schema for the named fields
   * and returns whether that set is valid. (react-hook-form parity:
   * `trigger(name?)`.)
   */
  trigger: (field?: keyof TValues | ReadonlyArray<keyof TValues>) => Promise<boolean>
  /**
   * Get a single field's reactive state — the SAME object as
   * `form.fields[field]`. (react-hook-form parity: `getFieldState(name)`,
   * but returns the live `FieldState` signals rather than a snapshot.)
   */
  getFieldState: <K extends keyof TValues>(field: K) => FieldState<TValues[K]>
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
  schema?:
    | SchemaValidateFn<TValues>
    | { readonly _infer: TValues; readonly validator: SchemaValidateFn<TValues> }
    | StandardSchemaLike<TValues>
  /** When to validate: 'blur' (default), 'change', or 'submit'. */
  validateOn?: 'blur' | 'change' | 'submit'
  /** Debounce delay in ms for validators (useful for async validators). */
  debounceMs?: number
}
