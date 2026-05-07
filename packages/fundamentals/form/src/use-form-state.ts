import type { Computed } from '@pyreon/reactivity'
import { computed } from '@pyreon/reactivity'
import type { FormState, ValidationError } from './types'

// Dev-time counter sink. See packages/internals/perf-harness/COUNTERS.md.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

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
    if (process.env.NODE_ENV !== 'production')
      // One emission per buildSummary call. Drives the
      // `form.formStateScan.fieldsRead` counter below to surface the
      // "selector ignored — full O(N) scan happens regardless" smoking gun
      // predicted by the audit.
      _countSink.__pyreon_count__?.('form.formStateScan')

    const touchedFields = {} as Partial<Record<keyof TValues, boolean>>
    const dirtyFields = {} as Partial<Record<keyof TValues, boolean>>
    const errors = {} as Partial<Record<keyof TValues, ValidationError>>

    let scannedCount = 0
    for (const key of Object.keys(form.fields) as (keyof TValues & string)[]) {
      const field = form.fields[key]
      if (field.touched()) touchedFields[key] = true
      if (field.dirty()) dirtyFields[key] = true
      const err = field.error()
      if (err !== undefined) errors[key] = err
      scannedCount++
    }
    if (process.env.NODE_ENV !== 'production')
      // Counts EVERY field signal touched per scan. Equals N for any
      // useFormState() call, even when the selector only needs `isValid`
      // or `isSubmitting`. PR 3 candidate: split into atomic computeds
      // resolved against getter-backed summary (see plan).
      _countSink.__pyreon_count__?.('form.formStateScan.fieldsRead', scannedCount)

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
