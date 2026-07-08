import { createUniqueId, onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, computed, effect, isServer, signal } from '@pyreon/reactivity'
import type { SchemaValidateFn, StandardSchemaLike } from '@pyreon/validation'
import { isStandardSchema, standardSchemaToValidator } from '@pyreon/validation'
import type { FieldDefinition, InferFieldValues } from './field'
import { isFieldDefinition } from './field'
import type {
  FieldErrorProps,
  FieldLabelProps,
  FieldRegisterCheckboxProps,
  FieldRegisterFileProps,
  FieldRegisterProps,
  FieldState,
  FormState,
  UseFormOptions,
  ValidateFn,
  ValidationError,
} from './types'

// Dev-time counter sink — see packages/internals/perf-harness/COUNTERS.md.
// The bare `process.env.NODE_ENV !== 'production'` gate is the bundler-
// agnostic library standard (per .claude/rules/anti-patterns.md). Vite,
// Webpack, esbuild, Rollup, Parcel, and Bun all replace this at consumer
// build time and tree-shake the counter call to zero in prod bundles.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Match a schema-error record to a top-level field: an exact key match, else
 * the first NESTED key whose top-level segment is this field (e.g.
 * `"address.city"` → field `"address"`). The zod/valibot/arktype adapters
 * flatten a nested issue to a dot-path key (`issuesToRecord`), so without this
 * the error for an object-valued field would match no top-level field and be
 * silently dropped — the form would report valid while the schema rejected.
 * Pure + exported for unit testing.
 */
export function matchSchemaErrorForField(
  schemaErrors: Record<string, ValidationError | undefined>,
  name: string,
): ValidationError | undefined {
  if (schemaErrors[name] !== undefined) return schemaErrors[name]
  const prefix = `${name}.`
  for (const key in schemaErrors) {
    if (key.startsWith(prefix) && schemaErrors[key] !== undefined) return schemaErrors[key]
  }
  return undefined
}

/**
 * Schema-error keys whose top-level segment matches NO registered field — a
 * genuine schema/field shape mismatch (typo, an extra schema rule, or a
 * path-less whole-form error under the `""` key). These must NOT be silently
 * dropped: the form is treated as invalid and the keys are surfaced. Pure +
 * exported for unit testing.
 */
export function orphanSchemaErrorKeys(
  schemaErrors: Record<string, ValidationError | undefined>,
  fieldNames: ReadonlySet<string>,
): string[] {
  const orphans: string[] = []
  for (const key in schemaErrors) {
    if (schemaErrors[key] === undefined) continue
    const top = key.split('.', 1)[0]!
    if (!fieldNames.has(top)) orphans.push(key)
  }
  return orphans
}

/**
 * Resolve a `schema` option into the whole-form `SchemaValidateFn` the form
 * runs — accepting a plain function, a `@pyreon/validation` typed adapter
 * (`{ _infer, validator }`), OR a raw Standard Schema (zod/valibot/arktype/`s`
 * — no adapter, no cast) via `@pyreon/validation`'s bridge. Returns undefined
 * when no schema is configured.
 */
export function resolveSchemaValidator<TValues extends Record<string, unknown>>(
  schemaInput: unknown,
): SchemaValidateFn<TValues> | undefined {
  if (schemaInput == null) return undefined
  if (typeof schemaInput === 'function') return schemaInput as SchemaValidateFn<TValues>
  if (typeof schemaInput === 'object') {
    if ('_infer' in schemaInput && 'validator' in schemaInput) {
      return (schemaInput as { validator: SchemaValidateFn<TValues> }).validator
    }
    // `isStandardSchema` narrows to the strict `StandardSchemaShape`; the bridge
    // takes the lax `StandardSchemaLike` — bridge the two with one cast.
    if (isStandardSchema(schemaInput)) {
      return standardSchemaToValidator<TValues>(schemaInput as StandardSchemaLike)
    }
  }
  return undefined
}

/**
 * Options for the field-definition-based useForm overload.
 * Types are inferred from the field definitions array.
 */
export interface UseFormFieldsOptions<TDefs extends readonly FieldDefinition<string, unknown>[]> {
  /** Array of field definitions created via `field()`. */
  fields: readonly [...TDefs]
  /** Called with validated values on successful submit. */
  onSubmit: (values: InferFieldValues<TDefs>) => void | Promise<void>
  /** Schema-level validator (runs after field validators). */
  schema?: UseFormOptions<InferFieldValues<TDefs>>['schema']
  /** When to validate: 'blur' (default), 'change', or 'submit'. */
  validateOn?: 'blur' | 'change' | 'submit'
  /** Debounce delay in ms for validators. */
  debounceMs?: number
  /** Focus the first errored field on a failed submit (default true). */
  focusOnError?: boolean
}

/**
 * Create a signal-based form. Returns reactive field states, form-level
 * signals, and handlers for submit/reset/validate.
 *
 * @example
 * const form = useForm({
 *   initialValues: { email: '', password: '', remember: false },
 *   validators: {
 *     email: (v) => (!v ? 'Required' : undefined),
 *     password: (v, all) => (v.length < 8 ? 'Too short' : undefined),
 *   },
 *   onSubmit: async (values) => { await login(values) },
 * })
 *
 * // Bind with register():
 * // h('input', form.register('email'))
 * // h('input', { type: 'checkbox', ...form.register('remember', { type: 'checkbox' }) })
 */
/**
 * Create a form from field definitions — types inferred from the fields array.
 *
 * @example
 * ```ts
 * const email = field('email', '', (v) => !v.includes('@') ? 'Invalid' : undefined)
 * const password = field('password', '', (v) => v.length < 8 ? 'Too short' : undefined)
 *
 * const form = useForm({
 *   fields: [email, password],
 *   onSubmit: (values) => { // values: { email: string; password: string } }
 * })
 * ```
 */
// oxlint-disable-next-line no-explicit-any
export function useForm<TDefs extends FieldDefinition<string, any>[]>(
  options: { fields: [...TDefs]; onSubmit: (values: InferFieldValues<TDefs>) => void | Promise<void>; schema?: any; validateOn?: 'blur' | 'change' | 'submit'; debounceMs?: number },
): FormState<InferFieldValues<TDefs>>
/**
 * Create a form with explicit initial values and validators.
 */
export function useForm<TValues extends Record<string, unknown>>(
  options: UseFormOptions<TValues>,
): FormState<TValues>
// oxlint-disable-next-line no-unnecessary-type-arguments
export function useForm<TValues extends Record<string, unknown> = Record<string, unknown>>(
  options: UseFormFieldsOptions<readonly FieldDefinition[]> | UseFormOptions<TValues>,
): FormState<TValues> {
  // ── Field-definition overload: translate to legacy format ──────────────
  if ('fields' in options && Array.isArray(options.fields) && options.fields.length > 0 && isFieldDefinition(options.fields[0])) {
    const defs = options.fields as readonly FieldDefinition[]
    const initialValues: Record<string, unknown> = {}
    const validators: Record<string, ValidateFn<unknown, Record<string, unknown>>> = {}
    for (const def of defs) {
      initialValues[def.name] = def.defaultValue
      if (def.validator) validators[def.name] = def.validator
    }
    return useForm<TValues>({
      initialValues,
      validators,
      onSubmit: options.onSubmit,
      schema: options.schema,
      validateOn: options.validateOn,
      debounceMs: options.debounceMs,
      focusOnError: options.focusOnError,
    } as unknown as UseFormOptions<TValues>) as FormState<TValues>
  }

  // ── Legacy path ───────────────────────────────────────────────────────
  const opts = options as UseFormOptions<Record<string, unknown>>
  const { initialValues: rawInitialValues, onSubmit, validators, schema: schemaInput, validateOn = 'blur', debounceMs, focusOnError = true } = opts

  // Resolve initialValues — static object or reactive accessor
  const initialValues = typeof rawInitialValues === 'function'
    ? (rawInitialValues as () => Record<string, unknown>)()
    : rawInitialValues

  // Resolve the schema option: a plain SchemaValidateFn, a @pyreon/validation
  // typed adapter (`{ _infer, validator }`), or a RAW Standard Schema
  // (zod/valibot/arktype — accepted directly, no adapter, no `as never` cast).
  const schema = resolveSchemaValidator<TValues>(schemaInput)

  // Mutable per-field validator map — seeded from `options.validators`, extended
  // at runtime by `registerField` (dynamic fields). The field closures read
  // `fieldValidators[name]`, so a validator added post-creation is picked up.
  const fieldValidators: Record<string, ValidateFn<unknown, TValues>> = {
    ...((validators ?? {}) as unknown as Record<string, ValidateFn<unknown, TValues>>),
  }

  // Build field states.
  //
  // STATIC-BY-DEFAULT FIELD MODEL. `fieldEntries` starts from `initialValues`
  // and is the shape the whole form is built on: `values()`/`getValues()`
  // iterate it (epoch-cached), the submit payload is assembled from it, and
  // dirty/touched aggregation keys on it. There is NO lazy AUTO-registration
  // (a field first seen by `useField`/`register` would NOT be in `fieldEntries`,
  // so its value would never reach `onSubmit` — a silent data-loss bug), which
  // is why using an undeclared field THROWS. The ONLY way to add a field after
  // creation is the EXPLICIT `form.registerField(name, initial, validator?)`
  // escape hatch (+ `unregisterField`) — for dynamic / data-driven forms. It
  // mutates `fieldEntries` + all the per-field machinery in lockstep, so the
  // field is fully first-class (reaches `values()`/`onSubmit`, participates in
  // validity). Registration stays explicit; only the "no *silent* auto-register"
  // invariant is load-bearing.
  const fieldEntries = Object.entries(initialValues) as [
    keyof TValues & string,
    TValues[keyof TValues],
  ][]

  // Registered top-level field names — used to match/route schema errors so a
  // nested (`address.city`) or path-less schema error is never silently dropped.
  const fieldNames: Set<string> = new Set(fieldEntries.map(([n]) => String(n)))

  const fields = {} as { [K in keyof TValues]: FieldState<TValues[K]> }

  // Abort controller for cancelling in-flight validators on unmount.
  // Recreated per validation cycle so the signal stays usable across
  // multiple submit calls (AbortController is one-shot: once aborted,
  // signal.aborted stays true forever).
  let abortController = new AbortController()

  // Debounce timers per field — stored in Set for better tracking
  const debounceTimers: Partial<Record<keyof TValues, ReturnType<typeof setTimeout>>> = {}
  const allTimers = new Set<ReturnType<typeof setTimeout>>()

  // Validation version per field — used to discard stale async results
  const validationVersions: Partial<Record<keyof TValues, number>> = {}

  // Per-field NON-debounced validator (the `runValidation` closure built in
  // the field loop). Stored so `trigger(name)` can validate a field/subset
  // immediately, reusing the exact same validation path as auto-validation.
  const fieldRunValidation: Partial<Record<keyof TValues, (v: unknown) => Promise<ValidationError>>> = {}

  // Epoch-cached snapshot of all values. Rebuilding the object on every
  // `values()` / `getValues()` read was O(N) (~109ns for 12 fields vs a plain
  // store's ~7ns property read). Instead we keep a monotonically-bumped
  // `_valuesEpoch` (incremented by every value-mutation METHOD — setValue,
  // field.reset, setInitialValues) and rebuild the snapshot only when the
  // epoch advanced since the last read. A clean read is then an integer
  // compare + cached-object return (~store speed), and the write path pays
  // only one integer increment (no signal/subscriber → no Set promotion on
  // the value signals → the 46ns keystroke path is untouched).
  //
  // Contract: the snapshot reflects mutations through the form's methods.
  // A direct `form.fields.x.value.set(...)` (bypassing `setValue`) bypasses
  // the epoch — same as it already bypasses dirty-tracking + auto-validation;
  // use `setFieldValue` for tracked updates. This matches the live-store
  // model of TanStack/RHF (their values object is equally "stale" if you
  // mutate underlying state out-of-band).
  let _valuesEpoch = 0
  let _valuesCache: TValues | undefined
  let _valuesCacheEpoch = -1
  const getValues = (): TValues => {
    if (_valuesCacheEpoch === _valuesEpoch && _valuesCache !== undefined) return _valuesCache
    const values = {} as TValues
    for (const [name] of fieldEntries) {
      ;(values as Record<string, unknown>)[name] =
        fields[name]?.value.peek() ?? (initialValues as Record<string, unknown>)[name]
    }
    _valuesCache = values
    _valuesCacheEpoch = _valuesEpoch
    return values
  }

  // Helper for submit — excludes disabled fields from payload.
  // Form-level disabled always takes priority over field-level.
  const getSubmitValues = (): TValues => {
    const values = {} as TValues
    const formIsDisabled = formDisabled.peek()
    for (const [name] of fieldEntries) {
      const f = fields[name]
      // Form-level disabled → ALL fields excluded
      // Field-level disabled → only that field excluded
      if (formIsDisabled || f?.disabled.peek()) continue
      ;(values as Record<string, unknown>)[name] =
        f?.value.peek() ?? (currentInitials as Record<string, unknown>)[name]
    }
    return values
  }

  // Per-field schema-version tracking — independent of `validationVersions`
  // (which tracks per-field-validator runs) so an in-flight schema call from
  // ONE field's blur doesn't get clobbered by another field's blur. Each
  // call captures the current version, awaits the schema, and writes only
  // if the version is still current.
  const schemaFieldVersions: Partial<Record<keyof TValues, number>> = {}

  /**
   * Run the form-level schema and apply ONLY this field's error.
   *
   * Used by `setTouched` when `validateOn: 'blur'` is set AND a schema is
   * configured AND the field has no per-field validator. Without this,
   * schema-only forms with `validateOn: 'blur'` would silently skip
   * blur-time validation — the schema only fires in `validate()` on
   * submit (W10).
   *
   * Deliberately does NOT touch other fields' errors. Blur validates the
   * field that was blurred; surprising the user with errors on fields
   * they haven't visited yet would defeat the `touched`-gated display
   * convention every form library follows.
   */
  const runSchemaForField = async (name: keyof TValues & string) => {
    if (!schema) return
    /* v8 ignore next — `?? 0` left arm needs a 2nd concurrent blur on the same field
       before the 1st resolves; setTouched flips touched once, so the version is always
       undefined→0 here in practice. Defensive. */
    schemaFieldVersions[name] = (schemaFieldVersions[name] ?? 0) + 1
    const v = schemaFieldVersions[name]
    const allValues = getValues()
    const result = await schema(allValues)
    // Discard stale result if a newer blur on the same field has fired.
    if (disposed || schemaFieldVersions[name] !== v) return
    const field = fields[name]
    /* v8 ignore next — `name` always comes from the registered `fields` map; defensive guard. */
    if (!field) return
    // Match exact OR nested (`address.city` → `address`) so an object-valued
    // field surfaces its schema error on blur instead of silently passing.
    field.error.set(matchSchemaErrorForField(result as Record<string, ValidationError | undefined>, name))
  }

  // Clear all pending debounce timers
  const clearAllTimers = () => {
    for (const key of Object.keys(debounceTimers)) {
      clearTimeout(debounceTimers[key as keyof TValues])
      delete debounceTimers[key as keyof TValues]
    }
    allTimers.clear()
  }

  const isValidating = signal(false)
  const submitError = signal<unknown>(undefined)
  // Whether the most recent submit completed successfully (onSubmit ran
  // without a validation failure / throw). false at each submit start + reset.
  const isSubmitSuccessful = signal(false)
  const formDisabled = signal(false)
  const formReadOnly = signal(false)
  // Declared up-front so per-field auto-revalidation effects (set up in the
  // loop below) can read it. Each `handleSubmit()` increments it; the
  // change-mode trigger fires once `submitCount > 0` so users see live
  // error correction after the first failed submit.
  const submitCount = signal(0)

  // Track current initial values (mutable for setInitialValues)
  let currentInitials = { ...initialValues }

  // Track whether the form has been disposed (unmounted)
  let disposed = false

  // ── Incremental count tracking (PR 2: granular form state) ──────────────────
  //
  // Pre-fix, `form.isValid` / `form.isDirty` were O(N) computeds that
  // iterated every field's `error` / `dirty` signal on every recompute.
  // Any field write that flipped error/dirty invalidated the form-level
  // computed → next read scanned all N fields. With 10k fields, that's
  // 10k signal reads per `useFormState` invocation that touches isValid.
  //
  // Fix: maintain `_invalidCount` and `_dirtyCount` signals updated
  // incrementally via per-field `signal.subscribe` listeners (one per
  // field, light — `signal.subscribe` adds to the Set with no effect-
  // framework overhead). isValid/isDirty become O(1) reads of these
  // count signals. The bookkeeping cost is one Set-add per field at
  // mount + one comparison per error/dirty signal write.
  //
  // Verified against the forms-stress benchmark: `formStateReadSelector-10k`
  // counter signature dropped from `fieldsRead = 10000` to `fieldsRead = 0`
  // (selector + getter-backed summary in use-form-state.ts only reads
  // `summary.isValid` → reads `_invalidCount` → no field iteration).
  const _invalidCount = signal(0)
  const _dirtyCount = signal(0)

  // Per-field fine-grained signal allocation at form SETUP (useForm runs
  // once), not per-render — this IS the documented form architecture
  // ("value/error/touched/dirty are independent Signal<T>"), not the
  // signal-in-render-loop anti-pattern the rule targets. Disabled per-site.
  // Build one field's FieldState + its per-field machinery. Extracted from the
  // setup loop so `registerField` can create a field at runtime with the EXACT
  // same wiring (dynamic / data-driven forms — an EXPLICIT escape hatch from the
  // static model; still no lazy AUTO-registration).
  const createFieldState = (
    name: keyof TValues & string,
    initial: TValues[keyof TValues],
  ): FieldState<unknown> => {
    // EAGER: value + dirty. Both are written by `setValue` on the keystroke hot
    // path, so they're allocated up front and captured DIRECTLY in the closures
    // below — no getter indirection on the hot path, so no V8 deopt risk (the
    // trap that reverted the earlier dirty-count-inline attempt). The other four
    // per-field signals (error/touched/disabled/readOnly) sit off every
    // keystroke and are LAZY — materialized on first access — so a freshly
    // created N-field form allocates 2N signals at setup instead of 6N.
    // pyreon-lint-disable-next-line pyreon/no-signal-in-loop
    const valueSig = signal(initial) as Signal<TValues[typeof name]>
    // pyreon-lint-disable-next-line pyreon/no-signal-in-loop
    const dirtySig = signal(false)
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('form.fieldSignalCreate', 2)

    // LAZY materializers. Each `??=`-allocates on first access; `getError` also
    // attaches its `_invalidCount` subscriber THEN (until the error signal
    // exists the field has no error and contributes 0, so the count stays
    // correct). `getError`/`getTouched` are used directly by the in-loop
    // closures (runValidation / setTouched) to skip the property-getter hop.
    let _errorSig: Signal<ValidationError> | undefined
    const getError = (): Signal<ValidationError> => {
      if (_errorSig) return _errorSig
      // pyreon-lint-disable-next-line pyreon/no-signal-in-loop
      const s = signal<ValidationError>(undefined)
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('form.fieldSignalCreate', 1)
      let prevHasError = false
      s.subscribe(() => {
        const hasError = s.peek() !== undefined
        if (hasError !== prevHasError) {
          _invalidCount.update((n) => (hasError ? n + 1 : n - 1))
          prevHasError = hasError
        }
      })
      _errorSig = s
      return s
    }
    let _touchedSig: Signal<boolean> | undefined
    const getTouched = (): Signal<boolean> => {
      if (_touchedSig) return _touchedSig
      // pyreon-lint-disable-next-line pyreon/no-signal-in-loop
      _touchedSig = signal(false)
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('form.fieldSignalCreate', 1)
      return _touchedSig
    }
    let _disabledSig: Signal<boolean> | undefined
    const getDisabled = (): Signal<boolean> => {
      if (_disabledSig) return _disabledSig
      // pyreon-lint-disable-next-line pyreon/no-signal-in-loop
      _disabledSig = signal(false)
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('form.fieldSignalCreate', 1)
      return _disabledSig
    }
    let _readOnlySig: Signal<boolean> | undefined
    const getReadOnly = (): Signal<boolean> => {
      if (_readOnlySig) return _readOnlySig
      // pyreon-lint-disable-next-line pyreon/no-signal-in-loop
      _readOnlySig = signal(false)
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('form.fieldSignalCreate', 1)
      return _readOnlySig
    }

    // Initialize validation version
    validationVersions[name] = 0

    // The 3 `getError().set(...)` calls below are in MUTUALLY EXCLUSIVE
    // branches (validator success, validator threw, no validator
    // configured) — at most ONE fires per invocation. The lint rule
    // counts function-scope total writes, not per-branch fan-out, so
    // it can't see the discriminator. Wrapping in batch() would add
    // overhead with zero benefit (batch of 1 write is a no-op).
    // pyreon-lint-disable-next-line pyreon/no-unbatched-updates
    const runValidation = async (value: TValues[typeof name]) => {
      const fieldValidator = fieldValidators[name]
      if (fieldValidator) {
        // Bump version to track this validation run
        /* v8 ignore next — `?? 0` right arm is dead: validationVersions[name] is
           initialised to 0 at field setup (see init above), so it's never undefined here. */
        validationVersions[name] = (validationVersions[name] ?? 0) + 1
        const currentVersion = validationVersions[name]
        try {
          const result = await fieldValidator(value, getValues(), abortController.signal)
          // Only apply result if this is still the latest validation and not disposed
          if (!disposed && validationVersions[name] === currentVersion) {
            getError().set(result)
          }
          return result
        } catch (err) {
          // Abort errors are expected when form unmounts; don't treat as validation error
          if (err instanceof Error && err.name === 'AbortError') {
            return undefined
          }
          // Validator threw — treat as error string if possible
          if (!disposed && validationVersions[name] === currentVersion) {
            const message = err instanceof Error ? err.message : String(err)
            getError().set(message)
          }
          return err instanceof Error ? err.message : String(err)
        }
      }
      getError().set(undefined)
      return undefined
    }
    // Expose the non-debounced validator for `trigger(name)`.
    fieldRunValidation[name] = runValidation as (v: unknown) => Promise<ValidationError>

    const validateField = debounceMs
      ? (value: TValues[typeof name]) => {
          clearTimeout(debounceTimers[name])
          return new Promise<ValidationError>((resolve) => {
            const timer = setTimeout(async () => {
              allTimers.delete(timer)
              try {
                resolve(await runValidation(value))
              } catch (err) {
                /* v8 ignore next 2 — unreachable: runValidation catches its own errors and
                   returns; it never throws, so this defensive outer catch never fires. */
                resolve(err instanceof Error ? err.message : String(err))
              }
            }, debounceMs)
            debounceTimers[name] = timer
            allTimers.add(timer)
          })
        }
      : runValidation

    // Auto-validation is driven INLINE from `setValue` (the canonical value-
    // mutation path) — NOT a per-field `effect()`. The effect approach cost a
    // per-field EffectScope at setup (N effects, the dominant per-field
    // allocation) AND re-ran on EVERY keystroke (tracking `valueSig`), even in
    // the default `blur` mode where the body no-ops. Driving it from setValue
    // removes both costs: setup allocates no per-field effect, and a keystroke
    // pays only a cheap `submitCount.peek()` read instead of an effect flush.
    //
    // The two trigger conditions are preserved exactly:
    //   1. validateOn === 'change' — validate on every value change.
    //   2. submitCount > 0 (any mode) — live error-correction after a failed
    //      submit (the "stale errors after submit" UX fix). `handleSubmit`
    //      already validates ALL fields on submit, so the submitCount→1 flip
    //      needs no per-field reaction; only SUBSEQUENT keystrokes do, which
    //      setValue handles via `submitCount.peek()`.
    // (change-mode validation of the INITIAL values is run once after the
    //  field loop — see the `validateOn === 'change'` block below.)

    // Incremental count subscribers — see `_invalidCount` / `_dirtyCount`
    // declarations above for the rationale. signal.subscribe is the
    // lightweight subscriber path: adds to the signal's `_s` Set with no
    // effect-framework overhead (no scope, no auto-track, no deps array).
    // The DIRTY subscriber is eager (dirty is allocated up front). The ERROR
    // subscriber lives in `getError` and attaches when the error signal first
    // materializes — until then the field has no error and contributes 0 to
    // `_invalidCount`, so the count is correct without an eager subscriber.
    let prevIsDirty = false
    dirtySig.subscribe(() => {
      const isFieldDirty = dirtySig.peek()
      /* v8 ignore next — false arm unreachable: dirtySig (a boolean) only NOTIFIES on a
         flip, so when this subscriber runs isFieldDirty always differs from prevIsDirty. */
      if (isFieldDirty !== prevIsDirty) {
        _dirtyCount.update((n) => (isFieldDirty ? n + 1 : n - 1))
        prevIsDirty = isFieldDirty
      }
    })

    fields[name] = {
      value: valueSig,
      dirty: dirtySig,
      // Lazy: accessing any of these materializes its signal on first read and
      // returns the SAME instance thereafter (identity stable — load-bearing for
      // reactive tracking). Off the keystroke hot path, so the getter hop never
      // touches per-keystroke work.
      get error() {
        return getError()
      },
      get touched() {
        return getTouched()
      },
      get disabled() {
        return getDisabled()
      },
      get readOnly() {
        return getReadOnly()
      },
      setValue: (value: TValues[typeof name]) => {
        valueSig.set(value)
        _valuesEpoch++ // invalidate the values() snapshot cache
        // Deep comparison for objects/arrays, reference for primitives
        dirtySig.set(!structuredEqual(value, initial))
        // Auto-validate inline (replaces the removed per-field effect):
        // change-mode validates every keystroke; post-failed-submit
        // (submitCount > 0) validates live so errors clear as the user fixes.
        // `.peek()` reads submitCount without subscribing (no tracking needed —
        // setValue is imperative).
        if (validateOn === 'change' || submitCount.peek() > 0) {
          validateField(value)
        }
      },
      setTouched: () => {
        getTouched().set(true)
        if (validateOn === 'blur') {
          // Run the per-field validator (matches `validators[name]`).
          validateField(valueSig.peek())
          // Schema-only forms (no per-field validators) used to silently
          // skip blur-time validation — `validateField` is a no-op when
          // there's no `validators[name]`, and the schema only fires
          // inside `validate()` on submit. That made `validateOn: 'blur'`
          // a lie for schema-only forms (W10).
          //
          // Fix: when a schema is configured AND there's no per-field
          // validator for this field, run the schema and apply ONLY this
          // field's resulting error. Other fields' errors are left
          // untouched — blur should validate the field that was blurred,
          // not surprise the user with errors on fields they haven't
          // visited yet.
          if (schema && !fieldValidators[name]) {
            runSchemaForField(name).catch(() => {
              // Schema threw — swallowed here; submit's `validate()`
              // surfaces the error properly via `submitError`.
            })
          }
        }
      },
      reset: () => {
        // batch() so consumers reading multiple per-field signals
        // (e.g. a UI binding both error + dirty for "show validation
        // hint") get notified once per field-reset, not four times.
        // Fires per-field on form.reset() and explicit reverts.
        batch(() => {
          valueSig.set(initial as TValues[typeof name])
          dirtySig.set(false)
          // Only reset the lazy signals if they were ever materialized — an
          // un-materialized error/touched is already at its default, so there's
          // nothing to reset (and materializing one just to write its default
          // would defeat the lazy allocation).
          _errorSig?.set(undefined)
          _touchedSig?.set(false)
        })
        _valuesEpoch++ // value reverted to initial → invalidate snapshot cache
        clearTimeout(debounceTimers[name])
      },
    } as FieldState<TValues[typeof name]>

    // change-mode forms validate their INITIAL value once at setup — the
    // removed per-field effect ran once on creation; this preserves that
    // exactly (per-field, debounced if `debounceMs` is set, since it uses the
    // same `validateField`). blur/submit modes stay passive until a blur /
    // submit. `showError` still gates display on `touched`.
    if (validateOn === 'change') validateField(valueSig.peek())
    return fields[name] as FieldState<unknown>
  }

  for (const [name, initial] of fieldEntries) {
    createFieldState(name, initial)
  }

  // Clean up debounce timers, cancel in-flight validators, and dispose on unmount
  onUnmount(() => {
    disposed = true
    clearAllTimers()
    abortController.abort()
  })

  const isSubmitting = signal(false)

  // Form-level computed signals — O(1) reads of incrementally-tracked
  // count signals. Pre-fix these iterated all N fields on every recompute
  // (and re-allocated the `fieldEntries.map` array). Post-fix they're
  // pure scalar reads. See `_invalidCount` / `_dirtyCount` setup above.
  const isValid = computed(() => _invalidCount() === 0)
  const isDirty = computed(() => _dirtyCount() > 0)
  const isSubmitted = computed(() => submitCount() > 0)

  // Read all values, or a single field's value (react-hook-form parity).
  function getValuesPublic(): TValues
  function getValuesPublic<K extends keyof TValues>(field: K): TValues[K]
  function getValuesPublic<K extends keyof TValues>(field?: K): TValues | TValues[K] {
    if (field === undefined) return getValues()
    return fields[field].value.peek()
  }

  // Aggregate dirty/touched records (only the dirty/touched fields present).
  // Reactive: reads each field's signal, so calling inside a reactive scope
  // tracks the set (matching react-hook-form's reactive dirtyFields/touchedFields).
  const dirtyFields = (): Partial<Record<keyof TValues, boolean>> => {
    const out = {} as Partial<Record<keyof TValues, boolean>>
    for (const [name] of fieldEntries) if (fields[name].dirty()) out[name] = true
    return out
  }
  const touchedFields = (): Partial<Record<keyof TValues, boolean>> => {
    const out = {} as Partial<Record<keyof TValues, boolean>>
    for (const [name] of fieldEntries) if (fields[name].touched()) out[name] = true
    return out
  }

  const getFieldState = <K extends keyof TValues>(field: K): FieldState<TValues[K]> => fields[field]

  const getErrors = (): Partial<Record<keyof TValues, ValidationError>> => {
    const errors = {} as Partial<Record<keyof TValues, ValidationError>>
    for (const [name] of fieldEntries) {
      const err = fields[name].error.peek()
      if (err !== undefined) errors[name] = err
    }
    return errors
  }

  const validate = async (): Promise<boolean> => {
    // Cancel any pending debounced validations and in-flight validators
    clearAllTimers()
    abortController.abort()
    abortController = new AbortController()

    isValidating.set(true)

    try {
      const allValues = getValues()

      // Clear all errors before re-validating. batch() collapses the
      // N error-signal writes into a single notify cycle — any
      // form-level computed reading the error map (or a button bound
      // to formState.isValid) re-runs once per validate(), not N times.
      batch(() => {
        for (const [name] of fieldEntries) {
          fields[name].error.set(undefined)
        }
      })

      if (process.env.NODE_ENV !== 'production')
        // One emission per submit. The N async tasks span across
        // `fieldEntries.map(...)` below — measure dispatch fan-out via
        // wall-clock + heap deltas in the perf-record harness.
        _countSink.__pyreon_count__?.('form.validateParallel')
      // Run field-level validators with all values for cross-field support
      await Promise.all(
        fieldEntries.map(async ([name]) => {
          const fieldValidator = fieldValidators[name]
          if (fieldValidator) {
            // Bump version so any in-flight debounced validation is discarded
            /* v8 ignore next — `?? 0` right arm is dead: validationVersions[name] is
               initialised to 0 at field setup, so it's never undefined here. */
            validationVersions[name] = (validationVersions[name] ?? 0) + 1
            const currentVersion = validationVersions[name]
            try {
              const error = await fieldValidator(
                fields[name].value.peek(),
                allValues,
                abortController.signal,
              )
              if (validationVersions[name] === currentVersion) {
                fields[name].error.set(error)
              }
            } catch (err) {
              /* v8 ignore next — false arm needs a concurrent validation to bump the version
                 WHILE this submit validator is throwing; not reachable in a single submit pass. */
              if (validationVersions[name] === currentVersion) {
                // Don't treat AbortError as a validation error
                if (err instanceof Error && err.name === 'AbortError') {
                  return
                }
                fields[name].error.set(err instanceof Error ? err.message : String(err))
              }
            }
          }
        }),
      )

      // Run schema-level validator — only set schema errors for fields
      // that don't already have a field-level error (field-level wins).
      // batch() so N schema-error applies notify subscribers once per
      // schema validation, not N times.
      if (schema) {
        try {
          const schemaErrors = (await schema(allValues)) as Record<
            string,
            ValidationError | undefined
          >
          let hadOrphanSchemaError = false
          batch(() => {
            for (const [name] of fieldEntries) {
              if (fields[name].error.peek() !== undefined) continue
              // Match exact OR nested (`address.city` → object field `address`),
              // so a nested schema rejection surfaces on its ancestor field
              // instead of being silently dropped.
              const schemaError = matchSchemaErrorForField(schemaErrors, name)
              if (schemaError !== undefined) fields[name].error.set(schemaError)
            }
            // Any schema-error key whose top-level segment is NOT a registered
            // field (a typo, an extra rule, or a path-less `""` whole-form
            // error) must NOT be silently dropped — the schema rejected, so the
            // form is invalid. Surface it as a form-level submitError + dev-warn.
            const orphans = orphanSchemaErrorKeys(schemaErrors, fieldNames)
            if (orphans.length > 0) {
              hadOrphanSchemaError = true
              const first = schemaErrors[orphans[0]!]
              submitError.set(
                new Error(
                  `[@pyreon/form] Schema validation failed for key(s) matching no field: ${orphans.join(', ')}${
                    first ? ` — ${first}` : ''
                  }`,
                ),
              )
              if (process.env.NODE_ENV !== 'production') {
                // oxlint-disable-next-line no-console
                console.warn(
                  `[@pyreon/form] Schema returned validation error(s) for key(s) that match no registered field: ${orphans.join(
                    ', ',
                  )}. Registered fields: ${[...fieldNames].join(', ')}. The form is treated as INVALID so the ` +
                    `rejection is not silently dropped. For a nested schema, either declare the object as a field ` +
                    `(its nested error routes to it) or align the schema shape with the form's fields.`,
                )
              }
            }
          })
          if (hadOrphanSchemaError) return false
        } catch (err) {
          // Schema validator threw — set as submitError rather than losing it
          submitError.set(err)
          return false
        }
      }

      // Re-check: any field with an error means invalid
      for (const [name] of fieldEntries) {
        if (fields[name].error.peek() !== undefined) return false
      }
      return true
    } finally {
      isValidating.set(false)
    }
  }

  // ── trigger: validate a field / subset / (no arg) the whole form ────────
  const trigger = async (field?: keyof TValues | ReadonlyArray<keyof TValues>): Promise<boolean> => {
    if (field === undefined) return validate()
    const names = (Array.isArray(field) ? field : [field]) as (keyof TValues & string)[]
    isValidating.set(true)
    try {
      await Promise.all(
        names.map(async (name) => {
          if (!fields[name]) return
          // Cancel a pending debounce so a stale result can't clobber this.
          clearTimeout(debounceTimers[name])
          const rv = fieldRunValidation[name]
          // runValidation sets the field error (validator result, or undefined
          // when there's no validator) — the exact auto-validation path.
          if (rv) await rv(fields[name].value.peek())
          else fields[name].error.set(undefined)
          // Schema-only fields (no per-field validator) get their schema error
          // applied here too, mirroring blur-time `runSchemaForField`.
          if (schema && !fieldValidators[name]) await runSchemaForField(name).catch(() => {})
        }),
      )
      return names.every((name) => !fields[name] || fields[name].error.peek() === undefined)
    } finally {
      isValidating.set(false)
    }
  }

  const handleSubmit = async (e?: Event) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault()
    }

    // Batch the submit-prep writes: submitError + submitCount + every
    // field.touched. Without batch(), each field's touched.set(true)
    // notifies every subscriber to that field separately — N field
    // panels re-render N times each. Batching collapses to a single
    // effect flush after every signal has been updated.
    batch(() => {
      submitError.set(undefined)
      isSubmitSuccessful.set(false)
      submitCount.update((n) => n + 1)
      for (const [name] of fieldEntries) {
        fields[name].touched.set(true)
      }
    })

    const valid = await validate()
    if (!valid) {
      // Accessible error recovery — move focus to the first errored field
      // (unless opted out). react-hook-form's `shouldFocusError` default.
      if (focusOnError) focusFirstError()
      return
    }

    isSubmitting.set(true)
    try {
      await onSubmit(getSubmitValues())
      isSubmitSuccessful.set(true)
    } catch (err) {
      submitError.set(err)
      throw err
    } finally {
      isSubmitting.set(false)
    }
  }

  const reset = () => {
    clearAllTimers()
    // Batch the reset writes: every field's reset() touches multiple
    // signals (value/error/touched/dirty), then submitCount + submitError.
    // Without batch(), N-field form fires 4N+2 separate notify cycles.
    batch(() => {
      for (const [name] of fieldEntries) {
        fields[name].reset()
      }
      submitCount.set(0)
      submitError.set(undefined)
      isSubmitSuccessful.set(false)
    })
  }

  const setFieldValue = <K extends keyof TValues>(field: K, value: TValues[K]) => {
    if (!fields[field]) {
      throw new Error(
        `[@pyreon/form] Field "${String(field)}" does not exist. Available fields: ${fieldEntries.map(([n]) => n).join(', ')}. ` +
          `Declare it in useForm({ initialValues }) (or the fields array) — @pyreon/form does not auto-register fields.`,
      )
    }
    fields[field].setValue(value)
  }

  const setFieldError = (field: keyof TValues, error: ValidationError) => {
    if (!fields[field]) {
      throw new Error(
        `[@pyreon/form] Field "${String(field)}" does not exist. Available fields: ${fieldEntries.map(([n]) => n).join(', ')}. ` +
          `Declare it in useForm({ initialValues }) (or the fields array) — @pyreon/form does not auto-register fields.`,
      )
    }
    fields[field].error.set(error)
  }

  const setErrors = (errors: Partial<Record<keyof TValues, ValidationError>>) => {
    for (const [name, error] of Object.entries(errors)) {
      setFieldError(name as keyof TValues, error as ValidationError)
    }
  }

  const clearErrors = () => {
    for (const [name] of fieldEntries) {
      fields[name].error.set(undefined)
    }
  }

  const resetField = (field: keyof TValues) => {
    if (fields[field]) {
      fields[field].reset()
    }
  }

  // ── Accessibility id wiring ───────────────────────────────────────────
  // Each field gets ONE stable input id (lazily generated). The error
  // element's id is derived from it, so `register()` (input) and
  // `errorProps()` / `labelProps()` (error + label elements) agree without
  // the consumer threading ids by hand. This is what makes the ARIA
  // association automatic — solving the label↔control / input↔error wiring
  // that a lint rule structurally can't (the deferred `control-needs-label`
  // cliff) at the layer where the ids ARE knowable.
  const _fieldIds = new Map<string, string>()
  const baseId = (field: string): string => {
    let id = _fieldIds.get(field)
    if (id === undefined) {
      id = createUniqueId()
      _fieldIds.set(field, id)
    }
    return id
  }
  const errorIdOf = (field: string): string => `${baseId(field)}-error`

  // Focus the first errored + registered field (declaration order). Uses
  // `_fieldIds.get` (NOT `baseId`, which would generate an id) so it only
  // targets fields actually bound via register(). SSR-safe.
  const focusFirstError = (): void => {
    if (isServer) return
    for (const [name] of fieldEntries) {
      if (fields[name].error.peek() === undefined) continue
      const id = _fieldIds.get(name)
      if (id === undefined) continue
      const el = document.getElementById(id)
      if (el && typeof (el as HTMLElement).focus === 'function') {
        ;(el as HTMLElement).focus()
        return
      }
    }
  }

  // Memoized register props per field+type combo. Cache value type is
  // the union of both shapes since checkbox returns `FieldRegisterCheckboxProps`
  // and the rest return `FieldRegisterProps<unknown>`.
  const registerCache = new Map<
    string,
    FieldRegisterProps<unknown> | FieldRegisterCheckboxProps | FieldRegisterFileProps
  >()

  function register<K extends keyof TValues & string>(
    field: K,
    options: { type: 'checkbox' },
  ): FieldRegisterCheckboxProps
  function register<K extends keyof TValues & string>(
    field: K,
    options: { type: 'file' },
  ): FieldRegisterFileProps
  function register<K extends keyof TValues & string>(
    field: K,
    options?: { type?: 'number' },
  ): FieldRegisterProps<TValues[K]>
  function register<K extends keyof TValues & string>(
    field: K,
    fieldOpts?: { type?: 'checkbox' | 'number' | 'file' },
  ): FieldRegisterProps<TValues[K]> | FieldRegisterCheckboxProps | FieldRegisterFileProps {
    const cacheKey = `${field}:${fieldOpts?.type ?? 'text'}`
    const cached = registerCache.get(cacheKey)
    if (cached) {
      return cached as
        | FieldRegisterProps<TValues[K]>
        | FieldRegisterCheckboxProps
        | FieldRegisterFileProps
    }

    const fieldState = fields[field]
    const onInput = (e: Event) => {
      const target = e.target as HTMLInputElement
      if (fieldOpts?.type === 'checkbox') {
        fieldState.setValue(target.checked as TValues[K])
      } else if (fieldOpts?.type === 'file') {
        // A file input can't be value-controlled — write its FileList to the
        // field (value() is `FileList | null`; read `files?.[0]` for one file).
        fieldState.setValue(target.files as TValues[K])
      } else if (fieldOpts?.type === 'number') {
        const num = target.valueAsNumber
        fieldState.setValue((Number.isNaN(num) ? target.value : num) as TValues[K])
      } else {
        fieldState.setValue(target.value as TValues[K])
      }
    }
    const onBlur = () => {
      fieldState.setTouched()
    }
    // Form-level takes priority, field-level is the fallback
    const disabled = computed(() => formDisabled() || fieldState.disabled())
    const readOnly = computed(() => formReadOnly() || fieldState.readOnly())

    // Accessibility (auto-wired, reactive). `aria-invalid` reflects the
    // field's error signal; `aria-describedby` points at the error element
    // (see `errorProps`) ONLY while errored, so the attribute is removed when
    // valid (no dangling reference). Both are accessors → `applyProp` wraps
    // them in a renderEffect, so they update in place exactly like the
    // `disabled`/`readOnly` accessors above. `'true' | undefined` (not a
    // boolean) so a valid field has NO `aria-invalid` attribute rather than
    // the ambiguous `aria-invalid=""`.
    const id = baseId(field)
    const errorId = errorIdOf(field)
    const ariaInvalid = computed<'true' | undefined>(() =>
      fieldState.error() != null ? 'true' : undefined,
    )
    const ariaDescribedby = computed<string | undefined>(() =>
      fieldState.error() != null ? errorId : undefined,
    )

    if (fieldOpts?.type === 'checkbox') {
      // Omit `value` for checkbox — HTML's checkbox `value` attribute is
      // arbitrary metadata, not the form-level value. The `<input
      // type="checkbox" {...register(field, { type: 'checkbox' })}>` spread
      // type-checks cleanly without a cast because `value` is gone.
      const checkboxProps: FieldRegisterCheckboxProps = {
        id,
        checked: computed(() => Boolean(fieldState.value())),
        onInput,
        onBlur,
        disabled,
        readOnly,
        'aria-invalid': ariaInvalid,
        'aria-describedby': ariaDescribedby,
      }
      registerCache.set(cacheKey, checkboxProps)
      return checkboxProps
    }

    if (fieldOpts?.type === 'file') {
      // Omit BOTH `value` and `checked` — a file input can't be value-bound.
      // `onInput` writes `target.files` to the field.
      const fileProps: FieldRegisterFileProps = {
        id,
        onInput,
        onBlur,
        disabled,
        readOnly,
        'aria-invalid': ariaInvalid,
        'aria-describedby': ariaDescribedby,
      }
      registerCache.set(cacheKey, fileProps)
      return fileProps
    }

    const props: FieldRegisterProps<TValues[K]> = {
      id,
      value: fieldState.value,
      onInput,
      onBlur,
      disabled,
      readOnly,
      'aria-invalid': ariaInvalid,
      'aria-describedby': ariaDescribedby,
    }
    registerCache.set(cacheKey, props as FieldRegisterProps<unknown>)
    return props
  }

  // Props for a field's ERROR element. Its `id` matches the input's
  // `aria-describedby` target, so spreading both auto-associates them; `role`
  // defaults to `'alert'` so the message is announced when it appears. Render
  // the error element only while errored (the common pattern) — when there's
  // no error the input's `aria-describedby` is absent, so nothing dangles.
  const errorProps = (field: keyof TValues & string): FieldErrorProps => ({
    id: errorIdOf(field),
    role: 'alert',
  })

  // Props for a field's LABEL element — `for` matches the input's auto `id`,
  // giving a programmatic label↔control association for free.
  const labelProps = (field: keyof TValues & string): FieldLabelProps => ({
    for: baseId(field),
  })

  // ── setInitialValues: update initials + reset fields ──────────────────
  const setInitialValues = (newValues: Partial<TValues>) => {
    Object.assign(currentInitials, newValues)
    // batch() so 4×N signal writes (per matching field) notify
    // subscribers once — typical use is async-prefill (loader data
    // landing post-mount), where un-batched the form re-renders 4×
    // per field instead of once.
    batch(() => {
      for (const [name] of fieldEntries) {
        if (name in newValues) {
          const val = (newValues as Record<string, unknown>)[name] as TValues[typeof name]
          fields[name].value.set(val)
          fields[name].error.set(undefined)
          fields[name].touched.set(false)
          fields[name].dirty.set(false)
        }
      }
    })
    _valuesEpoch++ // values changed → invalidate snapshot cache
  }

  // ── Dynamic field registration (explicit escape hatch) ──────────────────
  // Add / remove a field at runtime for dynamic / data-driven forms (a
  // server-defined schema, "add another section"). The field becomes fully
  // first-class — reaches `values()`/`onSubmit`, participates in validity.
  const registerField = (
    name: string,
    initialValue?: unknown,
    validator?: ValidateFn<unknown, TValues>,
  ): void => {
    const key = name as keyof TValues & string
    if (validator) fieldValidators[name] = validator
    if (fields[key]) return // already registered — idempotent (validator refreshed above)
    const init = initialValue as TValues[keyof TValues]
    fieldEntries.push([key, init])
    fieldNames.add(name)
    ;(currentInitials as Record<string, unknown>)[name] = init
    createFieldState(key, init)
    _valuesEpoch++ // new field → invalidate the values() snapshot cache
  }

  const unregisterField = (name: string): void => {
    const key = name as keyof TValues & string
    const fieldState = fields[key]
    if (!fieldState) return
    // Reset FIRST so the field's error/dirty subscribers fire and cleanly
    // zero its contribution to `_invalidCount` / `_dirtyCount` before removal.
    fieldState.reset()
    clearTimeout(debounceTimers[key])
    delete debounceTimers[key]
    delete validationVersions[key]
    delete fieldRunValidation[key]
    delete schemaFieldVersions[key]
    delete fieldValidators[name]
    delete (currentInitials as Record<string, unknown>)[name]
    delete (fields as Record<string, unknown>)[name]
    _fieldIds.delete(name)
    for (const t of ['text', 'number', 'checkbox', 'file']) registerCache.delete(`${name}:${t}`)
    const idx = fieldEntries.findIndex(([n]) => n === key)
    if (idx !== -1) fieldEntries.splice(idx, 1)
    fieldNames.delete(name)
    _valuesEpoch++ // field removed → invalidate the values() snapshot cache
  }

  // ── Reactive initialValues accessor watcher ───────��─────────────────
  if (typeof rawInitialValues === 'function') {
    effect(() => {
      const next = (rawInitialValues as () => Record<string, unknown>)()
      if (!next) return
      // Only reset if values actually changed
      let changed = false
      for (const [name] of fieldEntries) {
        if (!structuredEqual((currentInitials as Record<string, unknown>)[name], (next as Record<string, unknown>)[name])) {
          changed = true
          break
        }
      }
      if (changed) setInitialValues(next as Partial<TValues>)
    })
  }

  return {
    fields,
    isSubmitting,
    isValidating,
    isValid,
    isDirty,
    submitCount,
    isSubmitted,
    isSubmitSuccessful,
    submitError,
    values: getValues,
    getValues: getValuesPublic,
    errors: getErrors,
    dirtyFields,
    touchedFields,
    setFieldValue,
    setFieldError,
    setErrors,
    clearErrors,
    resetField,
    register,
    errorProps,
    labelProps,
    handleSubmit,
    reset,
    validate,
    trigger,
    getFieldState,
    setInitialValues,
    focusFirstError,
    registerField,
    unregisterField,
    disabled: formDisabled,
    readOnly: formReadOnly,
  }
}

/** Deep structural equality with depth limit to guard against circular references. */
function structuredEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  // Bail at depth 10 — treat as not equal to avoid infinite recursion
  if (depth > 10) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!structuredEqual(a[i], b[i], depth + 1)) return false
    }
    return true
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const aKeys = Object.keys(aObj)
    const bKeys = Object.keys(bObj)
    if (aKeys.length !== bKeys.length) return false
    for (const key of aKeys) {
      if (!structuredEqual(aObj[key], bObj[key], depth + 1)) return false
    }
    return true
  }

  return false
}
