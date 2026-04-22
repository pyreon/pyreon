import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { computed, effect, signal } from '@pyreon/reactivity'
import type { FieldDefinition, InferFieldValues } from './field'
import { isFieldDefinition } from './field'
import type {
  FieldRegisterProps,
  FieldState,
  FormState,
  UseFormOptions,
  ValidateFn,
  ValidationError,
} from './types'

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
    } as unknown as UseFormOptions<TValues>) as FormState<TValues>
  }

  // ── Legacy path ───────────────────────────────────────────────────────
  const opts = options as UseFormOptions<Record<string, unknown>>
  const { initialValues, onSubmit, validators, schema: schemaInput, validateOn = 'blur', debounceMs } = opts

  // Extract validator from TypedSchemaAdapter if provided, otherwise use as-is
  const schema = schemaInput && '_infer' in schemaInput ? schemaInput.validator : schemaInput

  // Build field states
  const fieldEntries = Object.entries(initialValues) as [
    keyof TValues & string,
    TValues[keyof TValues],
  ][]

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

  // Helper to get all current values (used by cross-field validators)
  const getValues = (): TValues => {
    const values = {} as TValues
    for (const [name] of fieldEntries) {
      ;(values as Record<string, unknown>)[name] =
        fields[name]?.value.peek() ?? (initialValues as Record<string, unknown>)[name]
    }
    return values
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

  // Track whether the form has been disposed (unmounted)
  let disposed = false

  for (const [name, initial] of fieldEntries) {
    const valueSig = signal(initial) as Signal<TValues[typeof name]>
    const errorSig = signal<ValidationError>(undefined)
    const touchedSig = signal(false)
    const dirtySig = signal(false)

    // Initialize validation version
    validationVersions[name] = 0

    const runValidation = async (value: TValues[typeof name]) => {
      const fieldValidator = validators?.[name]
      if (fieldValidator) {
        // Bump version to track this validation run
        validationVersions[name] = (validationVersions[name] ?? 0) + 1
        const currentVersion = validationVersions[name]
        try {
          const result = await fieldValidator(value, getValues(), abortController.signal)
          // Only apply result if this is still the latest validation and not disposed
          if (!disposed && validationVersions[name] === currentVersion) {
            errorSig.set(result)
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
            errorSig.set(message)
          }
          return err instanceof Error ? err.message : String(err)
        }
      }
      errorSig.set(undefined)
      return undefined
    }

    const validateField = debounceMs
      ? (value: TValues[typeof name]) => {
          clearTimeout(debounceTimers[name])
          return new Promise<ValidationError>((resolve) => {
            const timer = setTimeout(async () => {
              allTimers.delete(timer)
              try {
                resolve(await runValidation(value))
              } catch (err) {
                resolve(err instanceof Error ? err.message : String(err))
              }
            }, debounceMs)
            debounceTimers[name] = timer
            allTimers.add(timer)
          })
        }
      : runValidation

    // Auto-validate on change if configured
    if (validateOn === 'change') {
      effect(() => {
        const v = valueSig()
        validateField(v)
      })
    }

    fields[name] = {
      value: valueSig,
      error: errorSig,
      touched: touchedSig,
      dirty: dirtySig,
      setValue: (value: TValues[typeof name]) => {
        valueSig.set(value)
        // Deep comparison for objects/arrays, reference for primitives
        dirtySig.set(!structuredEqual(value, initial))
      },
      setTouched: () => {
        touchedSig.set(true)
        if (validateOn === 'blur') {
          validateField(valueSig.peek())
        }
      },
      reset: () => {
        valueSig.set(initial as TValues[typeof name])
        errorSig.set(undefined)
        touchedSig.set(false)
        dirtySig.set(false)
        clearTimeout(debounceTimers[name])
      },
    } as FieldState<TValues[typeof name]>
  }

  // Clean up debounce timers, cancel in-flight validators, and dispose on unmount
  onUnmount(() => {
    disposed = true
    clearAllTimers()
    abortController.abort()
  })

  const isSubmitting = signal(false)
  const submitCount = signal(0)

  // Form-level computed signals
  const isValid = computed(() => {
    for (const name of fieldEntries.map(([n]) => n)) {
      if (fields[name].error() !== undefined) return false
    }
    return true
  })

  const isDirty = computed(() => {
    for (const name of fieldEntries.map(([n]) => n)) {
      if (fields[name].dirty()) return true
    }
    return false
  })

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

      // Clear all errors before re-validating
      for (const [name] of fieldEntries) {
        fields[name].error.set(undefined)
      }

      // Run field-level validators with all values for cross-field support
      await Promise.all(
        fieldEntries.map(async ([name]) => {
          const fieldValidator = validators?.[name]
          if (fieldValidator) {
            // Bump version so any in-flight debounced validation is discarded
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
      // that don't already have a field-level error (field-level wins)
      if (schema) {
        try {
          const schemaErrors = await schema(allValues)
          for (const [name] of fieldEntries) {
            const schemaError = schemaErrors[name]
            if (schemaError !== undefined && fields[name].error.peek() === undefined) {
              fields[name].error.set(schemaError)
            }
          }
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

  const handleSubmit = async (e?: Event) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault()
    }

    submitError.set(undefined)
    submitCount.update((n) => n + 1)

    // Mark all fields as touched
    for (const [name] of fieldEntries) {
      fields[name].touched.set(true)
    }

    const valid = await validate()
    if (!valid) return

    isSubmitting.set(true)
    try {
      await onSubmit(getValues())
    } catch (err) {
      submitError.set(err)
      throw err
    } finally {
      isSubmitting.set(false)
    }
  }

  const reset = () => {
    clearAllTimers()
    for (const [name] of fieldEntries) {
      fields[name].reset()
    }
    submitCount.set(0)
    submitError.set(undefined)
  }

  const setFieldValue = <K extends keyof TValues>(field: K, value: TValues[K]) => {
    if (!fields[field]) {
      throw new Error(
        `[@pyreon/form] Field "${String(field)}" does not exist. Available fields: ${fieldEntries.map(([n]) => n).join(', ')}`,
      )
    }
    fields[field].setValue(value)
  }

  const setFieldError = (field: keyof TValues, error: ValidationError) => {
    if (!fields[field]) {
      throw new Error(
        `[@pyreon/form] Field "${String(field)}" does not exist. Available fields: ${fieldEntries.map(([n]) => n).join(', ')}`,
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

  // Memoized register props per field+type combo
  const registerCache = new Map<string, FieldRegisterProps<unknown>>()

  const register = <K extends keyof TValues & string>(
    field: K,
    opts?: { type?: 'checkbox' | 'number' },
  ): FieldRegisterProps<TValues[K]> => {
    const cacheKey = `${field}:${opts?.type ?? 'text'}`
    const cached = registerCache.get(cacheKey)
    if (cached) return cached as FieldRegisterProps<TValues[K]>

    const fieldState = fields[field]
    const props: FieldRegisterProps<TValues[K]> = {
      value: fieldState.value,
      onInput: (e: Event) => {
        const target = e.target as HTMLInputElement
        if (opts?.type === 'checkbox') {
          fieldState.setValue(target.checked as TValues[K])
        } else if (opts?.type === 'number') {
          const num = target.valueAsNumber
          fieldState.setValue((Number.isNaN(num) ? target.value : num) as TValues[K])
        } else {
          fieldState.setValue(target.value as TValues[K])
        }
      },
      onBlur: () => {
        fieldState.setTouched()
      },
    }

    if (opts?.type === 'checkbox') {
      props.checked = computed(() => Boolean(fieldState.value()))
    }

    registerCache.set(cacheKey, props as FieldRegisterProps<unknown>)
    return props
  }

  return {
    fields,
    isSubmitting,
    isValidating,
    isValid,
    isDirty,
    submitCount,
    submitError,
    values: getValues,
    errors: getErrors,
    setFieldValue,
    setFieldError,
    setErrors,
    clearErrors,
    resetField,
    register,
    handleSubmit,
    reset,
    validate,
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
