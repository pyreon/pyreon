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
  // ── Granular form state (PR 2: selectors actually narrow) ──────────────────
  //
  // Pre-fix, `buildSummary()` always iterated every field (`for (const key of
  // Object.keys(form.fields))`) building touched/dirty/errors maps even if
  // the selector only read `isValid`. Result: a button gated on
  // `s => s.isValid && !s.isSubmitting` re-ran on EVERY field write, scanning
  // 10k field signals each time (verified against the forms-stress benchmark:
  // `form.formStateScan.fieldsRead = 10000` for both no-selector AND
  // selector reads).
  //
  // Fix: replace the eager-scan summary with a getter-backed object whose
  // map properties (touchedFields, dirtyFields, errors) are atomic computeds
  // — they only materialize when the selector reads them. Scalar properties
  // (isValid, isSubmitting, etc.) are direct signal reads via getters; only
  // the signal the selector touches gets tracked.
  //
  // Backward-compat: the no-selector path materializes the full summary
  // shape (consumers iterating `state.errors` get the same map). The
  // selector path returns whatever the selector produces — no wasted scan.
  //
  // The 3 atomic computeds (touched/dirty/errors maps) are SHARED across
  // all useFormState() calls on the same form via memoization on the form
  // instance — selector A reading `errors` reuses the same computed as
  // selector B reading `errors`. Cached at signal granularity: a field's
  // error flip invalidates only the errors map, not touched / dirty.

  const _atoms = getOrCreateAtoms(form)

  const summary = {
    get isSubmitting() {
      return form.isSubmitting()
    },
    get isValidating() {
      return form.isValidating()
    },
    get isValid() {
      return form.isValid()
    },
    get isDirty() {
      return form.isDirty()
    },
    get submitCount() {
      return form.submitCount()
    },
    get submitError() {
      return form.submitError()
    },
    get touchedFields() {
      return _atoms.touchedFields()
    },
    get dirtyFields() {
      return _atoms.dirtyFields()
    },
    get errors() {
      return _atoms.errors()
    },
  } as FormStateSummary<TValues>

  if (selector) {
    return computed(() => selector(summary))
  }

  // No-selector path: materialize all properties so the returned object is
  // a snapshot, not a getter-backed live view. Maintains the prior contract
  // (consumers can stash the snapshot and read it later without surprises).
  return computed(() => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('form.formStateScan')
    return {
      isSubmitting: summary.isSubmitting,
      isValidating: summary.isValidating,
      isValid: summary.isValid,
      isDirty: summary.isDirty,
      submitCount: summary.submitCount,
      submitError: summary.submitError,
      touchedFields: summary.touchedFields,
      dirtyFields: summary.dirtyFields,
      errors: summary.errors,
    }
  })
}

// ── Per-form atomic computeds ──────────────────────────────────────────────
//
// touched / dirty / errors maps are O(N) to materialize but DON'T fire
// unless the consumer reads them. WeakMap keyed by form instance so
// repeated useFormState() calls on the same form share the same atom
// computeds — a single error change invalidates one shared computed, not
// N per-consumer ones.

interface FormAtoms<TValues extends Record<string, unknown>> {
  touchedFields: Computed<Partial<Record<keyof TValues, boolean>>>
  dirtyFields: Computed<Partial<Record<keyof TValues, boolean>>>
  errors: Computed<Partial<Record<keyof TValues, ValidationError>>>
}

const _atomsCache = new WeakMap<object, FormAtoms<Record<string, unknown>>>()

function getOrCreateAtoms<TValues extends Record<string, unknown>>(
  form: FormState<TValues>,
): FormAtoms<TValues> {
  const cached = _atomsCache.get(form as unknown as object)
  if (cached) return cached as unknown as FormAtoms<TValues>

  const atoms: FormAtoms<TValues> = {
    touchedFields: computed(() => {
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('form.formStateScan.fieldsRead', countFields(form))
      const map = {} as Partial<Record<keyof TValues, boolean>>
      for (const key of Object.keys(form.fields) as (keyof TValues & string)[]) {
        if (form.fields[key].touched()) map[key] = true
      }
      return map
    }),
    dirtyFields: computed(() => {
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('form.formStateScan.fieldsRead', countFields(form))
      const map = {} as Partial<Record<keyof TValues, boolean>>
      for (const key of Object.keys(form.fields) as (keyof TValues & string)[]) {
        if (form.fields[key].dirty()) map[key] = true
      }
      return map
    }),
    errors: computed(() => {
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('form.formStateScan.fieldsRead', countFields(form))
      const map = {} as Partial<Record<keyof TValues, ValidationError>>
      for (const key of Object.keys(form.fields) as (keyof TValues & string)[]) {
        const err = form.fields[key].error()
        if (err !== undefined) map[key] = err
      }
      return map
    }),
  }
  _atomsCache.set(form as unknown as object, atoms as unknown as FormAtoms<Record<string, unknown>>)
  return atoms
}

function countFields(form: { fields: Record<string, unknown> }): number {
  return Object.keys(form.fields).length
}
