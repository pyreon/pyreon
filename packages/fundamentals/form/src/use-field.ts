import type { Computed, Signal } from '@pyreon/reactivity'
import { computed } from '@pyreon/reactivity'
import type { FieldRegisterProps, FieldState, FormState, ValidationError } from './types'

export interface UseFieldResult<T> {
  /** Current field value (reactive signal). */
  value: Signal<T>
  /** Field error message (reactive signal). */
  error: Signal<ValidationError>
  /** Whether the field has been touched (reactive signal). */
  touched: Signal<boolean>
  /** Whether the field value differs from initial (reactive signal). */
  dirty: Signal<boolean>
  /** Set the field value. */
  setValue: (value: T) => void
  /** Mark the field as touched. */
  setTouched: () => void
  /** Reset the field to its initial value. */
  reset: () => void
  /** Register props for input binding. */
  register: (opts?: { type?: 'checkbox' }) => FieldRegisterProps<T>
  /** Whether the field has an error (computed). */
  hasError: Computed<boolean>
  /** Whether the field should show its error (touched + has error). */
  showError: Computed<boolean>
}

/**
 * Extract a single field's state and helpers from a form instance.
 * Useful for building isolated field components.
 *
 * @example
 * function EmailField({ form }: { form: FormState<{ email: string }> }) {
 *   const field = useField(form, 'email')
 *   return (
 *     <>
 *       <input {...field.register()} />
 *       {field.showError() && <span>{field.error()}</span>}
 *     </>
 *   )
 * }
 */
export function useField<TValues extends Record<string, unknown>, K extends keyof TValues & string>(
  form: FormState<TValues>,
  name: K,
): UseFieldResult<TValues[K]> {
  const fieldState: FieldState<TValues[K]> = form.fields[name]

  const hasError = computed(() => fieldState.error() !== undefined)
  const showError = computed(() => fieldState.touched() && hasError())

  return {
    value: fieldState.value,
    error: fieldState.error,
    touched: fieldState.touched,
    dirty: fieldState.dirty,
    setValue: fieldState.setValue,
    setTouched: fieldState.setTouched,
    reset: fieldState.reset,
    register: (opts?) => form.register(name, opts),
    hasError,
    showError,
  }
}
