import type { Computed } from '@pyreon/reactivity'
import { computed } from '@pyreon/reactivity'
import type { FormState, ValidationError } from './types'

export interface FormStateSummary<TValues extends Record<string, unknown>> {
  isSubmitting: boolean
  isValidating: boolean
  isValid: boolean
  isDirty: boolean
  submitCount: number
  submitError: unknown
  touchedFields: Partial<Record<keyof TValues, boolean>>
  dirtyFields: Partial<Record<keyof TValues, boolean>>
  errors: Partial<Record<keyof TValues, ValidationError>>
}

/**
 * Subscribe to the full form state as a single computed signal.
 * Useful for rendering form-level UI (submit button disabled state,
 * error summaries, progress indicators).
 *
 * @example
 * const state = useFormState(form)
 * // state() => { isSubmitting, isValid, isDirty, errors, ... }
 *
 * @example
 * // Use a selector for fine-grained reactivity
 * const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting)
 */
export function useFormState<TValues extends Record<string, unknown>>(
  form: FormState<TValues>,
): Computed<FormStateSummary<TValues>>

export function useFormState<TValues extends Record<string, unknown>, R>(
  form: FormState<TValues>,
  selector: (state: FormStateSummary<TValues>) => R,
): Computed<R>

export function useFormState<TValues extends Record<string, unknown>, R>(
  form: FormState<TValues>,
  selector?: (state: FormStateSummary<TValues>) => R,
): Computed<FormStateSummary<TValues>> | Computed<R> {
  const buildSummary = (): FormStateSummary<TValues> => {
    const touchedFields = {} as Partial<Record<keyof TValues, boolean>>
    const dirtyFields = {} as Partial<Record<keyof TValues, boolean>>
    const errors = {} as Partial<Record<keyof TValues, ValidationError>>

    for (const key of Object.keys(form.fields) as (keyof TValues & string)[]) {
      const field = form.fields[key]
      if (field.touched()) touchedFields[key] = true
      if (field.dirty()) dirtyFields[key] = true
      const err = field.error()
      if (err !== undefined) errors[key] = err
    }

    return {
      isSubmitting: form.isSubmitting(),
      isValidating: form.isValidating(),
      isValid: form.isValid(),
      isDirty: form.isDirty(),
      submitCount: form.submitCount(),
      submitError: form.submitError(),
      touchedFields,
      dirtyFields,
      errors,
    }
  }

  if (selector) {
    return computed(() => selector(buildSummary()))
  }

  return computed(buildSummary)
}
