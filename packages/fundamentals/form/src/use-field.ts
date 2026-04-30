import type { Computed, Signal } from '@pyreon/reactivity'
import { computed } from '@pyreon/reactivity'
import { useFormContext } from './context'
import type {
  FieldRegisterCheckboxProps,
  FieldRegisterProps,
  FieldState,
  FormState,
  ValidationError,
} from './types'

export interface UseFieldResult<T> {
  /** Current field value (reactive signal). */
  value: Signal<T>
  /** Field error message (reactive signal). */
  error: Signal<ValidationError>
  /** Whether the field has been touched (reactive signal). */
  touched: Signal<boolean>
  /** Whether the field value differs from initial (reactive signal). */
  dirty: Signal<boolean>
  /** Whether this field is disabled (reactive signal). */
  disabled: Signal<boolean>
  /** Whether this field is read-only (reactive signal). */
  readOnly: Signal<boolean>
  /** Set the field value. */
  setValue: (value: T) => void
  /** Mark the field as touched. */
  setTouched: () => void
  /** Reset the field to its initial value. */
  reset: () => void
  /**
   * Register props for input binding (includes disabled/readOnly).
   * For checkbox-typed fields use the `{ type: 'checkbox' }` overload —
   * returns `FieldRegisterCheckboxProps` (omits `value`, includes
   * `checked`) so the spread type-checks cleanly onto a checkbox input.
   */
  register: {
    (options: { type: 'checkbox' }): FieldRegisterCheckboxProps
    (options?: { type?: 'number' }): FieldRegisterProps<T>
  }
  /** Whether the field has an error (computed). */
  hasError: Computed<boolean>
  /** Whether the field should show its error (touched + has error). */
  showError: Computed<boolean>
}

/**
 * Extract a single field's state from the nearest `<Form>` / `<FormProvider>` context.
 * No form prop needed — reads from context automatically.
 *
 * @example
 * ```tsx
 * function EmailInput() {
 *   const f = useField('email')
 *   return <>
 *     <input {...f.register()} />
 *     {f.showError() && <span>{f.error()}</span>}
 *   </>
 * }
 * ```
 */
export function useField<T = unknown>(name: string): UseFieldResult<T>
/**
 * Extract a single field's state from an explicit form instance.
 *
 * @example
 * ```tsx
 * function EmailField({ form }: { form: FormState<{ email: string }> }) {
 *   const field = useField(form, 'email')
 *   return <input {...field.register()} />
 * }
 * ```
 */
export function useField<TValues extends Record<string, unknown>, K extends keyof TValues & string>(
  form: FormState<TValues>,
  name: K,
): UseFieldResult<TValues[K]>
export function useField(
  formOrName: FormState<Record<string, unknown>> | string,
  maybeName?: string,
): UseFieldResult<unknown> {
  let form: FormState<Record<string, unknown>>
  let name: string

  if (typeof formOrName === 'string') {
    // Context mode — read form from nearest FormProvider
    form = useFormContext()
    name = formOrName
  } else {
    // Explicit mode — form passed directly
    form = formOrName
    name = maybeName!
  }

  const fieldState: FieldState<unknown> = form.fields[name]!

  if (!fieldState) {
    throw new Error(
      `[@pyreon/form] useField("${name}"): field "${name}" not found. ` +
        `Available fields: ${Object.keys(form.fields).join(', ')}`,
    )
  }

  const hasError = computed(() => fieldState.error() !== undefined)
  const showError = computed(() => fieldState.touched() && hasError())

  return {
    value: fieldState.value,
    error: fieldState.error,
    touched: fieldState.touched,
    dirty: fieldState.dirty,
    disabled: fieldState.disabled,
    readOnly: fieldState.readOnly,
    setValue: fieldState.setValue,
    setTouched: fieldState.setTouched,
    reset: fieldState.reset,
    // Delegate the runtime to `form.register(name, ...)` and let the
    // typed wrapper pick the right overload. The narrow `unknown` cast
    // is needed because TS can't prove the union narrowing through a
    // function-typed delegation otherwise.
    register: ((opts?: { type?: 'checkbox' | 'number' }) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      (form.register as (f: string, o?: unknown) => unknown)(name, opts)) as UseFieldResult<unknown>['register'],
    hasError,
    showError,
  }
}
