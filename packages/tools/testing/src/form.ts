/**
 * `@pyreon/testing/form` — test helpers for `@pyreon/form`.
 *
 * Two layers, matching the two ways forms are tested:
 *
 *   1. HEADLESS (model-level): `renderForm(() => useForm({...}))` — a
 *      renderHook-style harness that runs `useForm` inside a probe component
 *      (no hand-written form component) and returns `{ form, fill, submit }`.
 *      `fill()` drives the form MODEL via `setFieldValue` + `setTouched`;
 *      `submit()` awaits the full `handleSubmit` pipeline.
 *
 *   2. RENDERED (DOM-level): `fillForm(scope, values)` / `submitForm(scope)`
 *      — for testing REAL rendered form components. Fields are located by
 *      ACCESSIBLE LABEL (Testing-Library `getByLabelText` semantics, matching
 *      `register()`'s auto-wired `id` ↔ `labelProps().for` association), and
 *      driven through real `input`/`blur`/`submit` events so `register()`'s
 *      handlers (validation, dirty/touched tracking) run exactly as in an app.
 *
 * Assertions use the package's fluent-matcher convention (`expectSignal` /
 * `expectEffect` precedent): `expectForm(form).toBeValid()` etc. — no
 * `expect.extend` registration, no setup-file ordering, no module
 * augmentation.
 *
 * Requires the optional peer `@pyreon/form`.
 */
import type { FormState } from '@pyreon/form'
import { fireEvent, waitFor, within } from '@testing-library/dom'
import { renderHook } from '@pyreon/testing'

// ─── renderForm ─────────────────────────────────────────────────────────────

export interface RenderFormResult<TValues extends Record<string, unknown>> {
  /** The `FormState` returned by your `useForm` setup. */
  form: FormState<TValues>
  /**
   * Drive the form MODEL: for each entry runs `setFieldValue(field, value)`
   * and marks the field touched (mimicking type-then-blur). Model-level —
   * no DOM events; for rendered inputs use `fillForm()`.
   */
  fill: (values: Partial<TValues>) => void
  /**
   * Run the full submit pipeline (`handleSubmit`) — validators, focus-first-
   * error, `onSubmit`. Resolves when the submit has settled.
   */
  submit: () => Promise<void>
  /** Unmount the probe component (disposes the form's reactive scope). */
  unmount: () => void
}

/**
 * renderHook-style harness for `useForm` — no hand-written component needed.
 *
 * @example
 *   const { form, fill, submit } = renderForm(() =>
 *     useForm({ fields: { email: field('') }, onSubmit }),
 *   )
 *   fill({ email: 'ada@lovelace.dev' })
 *   await submit()
 *   expectForm(form).toBeValid()
 */
export function renderForm<TValues extends Record<string, unknown>>(
  setup: () => FormState<TValues>,
): RenderFormResult<TValues> {
  const { result, unmount } = renderHook(() => setup())
  const form = result.current

  return {
    form,
    fill(values) {
      for (const key of Object.keys(values) as Array<keyof TValues & string>) {
        const field = form.fields[key]
        if (field === undefined) {
          throw new Error(
            `[Pyreon] fill(): "${key}" is not a registered field (known: ${Object.keys(form.fields).join(', ') || 'none'}). Declare it in useForm({ fields }) or register it via form.registerField().`,
          )
        }
        form.setFieldValue(key, values[key] as TValues[typeof key])
        field.setTouched()
      }
    },
    submit: () => form.handleSubmit(),
    unmount,
  }
}

// ─── fillForm / submitForm (rendered components) ────────────────────────────

/** Values accepted by `fillForm` per field: string/number for text-ish inputs,
 * boolean for checkboxes, `File`/`File[]` for file inputs. */
export type FillFormValue = string | number | boolean | File | File[]

function isFileValue(v: FillFormValue): v is File | File[] {
  return typeof File !== 'undefined' && (v instanceof File || (Array.isArray(v) && v.every((f) => f instanceof File)))
}

/**
 * Fill a REAL rendered form by accessible label. Keys are Testing-Library
 * label matchers (exact string or substring — resolved via `getByLabelText`),
 * so this works for any labelled input: `register()`-bound Pyreon-form inputs
 * (whose `labelProps()` wires the association) AND plain HTML forms.
 *
 * Fires real `input` + `blur` events so `register()`'s handlers run —
 * validation (`validateOn: 'blur'` default), dirty + touched tracking.
 * Checkboxes take a boolean (clicked only when the state differs); file
 * inputs take `File | File[]`.
 *
 * @example
 *   render(<SignupForm />)
 *   fillForm(document.body, { Email: 'ada@lovelace.dev', 'Accept terms': true })
 *   await submitForm(document.body)
 */
export function fillForm(scope: HTMLElement, values: Record<string, FillFormValue>): void {
  const q = within(scope)
  for (const label of Object.keys(values)) {
    const value = values[label] as FillFormValue
    const el = q.getByLabelText(label, { exact: true, selector: 'input, textarea, select' })
    const input = el as HTMLInputElement

    if (input.type === 'checkbox' || input.type === 'radio') {
      if (typeof value !== 'boolean') {
        throw new Error(
          `[Pyreon] fillForm(): field "${label}" is a ${input.type} — pass a boolean, got ${typeof value}.`,
        )
      }
      if (input.checked !== value) fireEvent.click(input)
    } else if (input.type === 'file') {
      if (!isFileValue(value)) {
        throw new Error(
          `[Pyreon] fillForm(): field "${label}" is a file input — pass a File or File[], got ${typeof value}.`,
        )
      }
      const files = Array.isArray(value) ? value : [value]
      fireEvent.input(input, { target: { files } })
    } else {
      fireEvent.input(el, { target: { value: String(value) } })
    }
    fireEvent.blur(el)
  }
}

/**
 * Submit a REAL rendered form: finds the `<form>` element in `scope` (or
 * `scope` itself) and fires a `submit` event — exactly what `<Form of={form}>`
 * wires to `handleSubmit`. Resolves after a macrotask so synchronous
 * validators + the submit pipeline settle; forms with ASYNC validators or an
 * async `onSubmit` should still `await waitFor(...)` on the resulting state.
 */
export async function submitForm(scope: HTMLElement): Promise<void> {
  const formEl =
    scope instanceof HTMLFormElement ? scope : (scope.querySelector('form') ?? scope.closest('form'))
  if (formEl === null) {
    throw new Error(
      '[Pyreon] submitForm(): no <form> element found in the given scope. Render your fields inside <Form of={form}> (or a plain <form>), or pass the form element directly.',
    )
  }
  fireEvent.submit(formEl)
  // One macrotask: lets the (possibly promise-chained) handleSubmit pipeline
  // run sync validators + a sync onSubmit to completion.
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

// ─── expectForm (fluent assertions) ─────────────────────────────────────────

export interface FormAssertions<TValues extends Record<string, unknown>> {
  /** Assert `form.isValid()` — reflects validators that have RUN (run `await form.validate()` or submit first to force full validation). */
  toBeValid(): void
  /** Assert the form is invalid (`!form.isValid()`). */
  toBeInvalid(): void
  /** Assert a field currently has an error; optionally that the message matches. */
  toHaveFieldError(field: keyof TValues & string, match?: string | RegExp): void
  /** Assert a field currently has NO error. */
  toHaveNoFieldError(field: keyof TValues & string): void
  /** Assert at least one field value differs from its initial value. */
  toBeDirty(): void
  /** Assert no field value differs from its initial value. */
  toBePristine(): void
  /** Assert the given SUBSET of current values matches exactly (per-key ===, deep-equal via JSON for objects). */
  toHaveValues(expected: Partial<TValues>): void
}

/**
 * Fluent assertions over a `FormState` (same convention as `expectSignal`).
 *
 * @example
 *   expectForm(form).toHaveFieldError('email', /invalid/)
 *   expectForm(form).toBeDirty()
 *   expectForm(form).toHaveValues({ email: 'ada@lovelace.dev' })
 */
export function expectForm<TValues extends Record<string, unknown>>(
  form: FormState<TValues>,
): FormAssertions<TValues> {
  const fail = (msg: string): never => {
    throw new Error(`[Pyreon] expectForm: ${msg}`)
  }
  const errorsNow = () => form.errors() as Record<string, string | undefined>
  return {
    toBeValid() {
      if (!form.isValid()) {
        fail(`expected form to be valid, but it has errors: ${JSON.stringify(errorsNow())}`)
      }
    },
    toBeInvalid() {
      if (form.isValid()) fail('expected form to be invalid, but it has no errors')
    },
    toHaveFieldError(field, match) {
      const error = errorsNow()[field]
      if (error === undefined) {
        const present = Object.keys(errorsNow())
        fail(
          `expected field "${field}" to have an error, but it has none${present.length > 0 ? ` (fields with errors: ${present.join(', ')})` : ''}. Note: validators run on blur/submit — call form.setTouched via fill(), await form.validate(), or submit first.`,
        )
      }
      if (match !== undefined) {
        const ok = typeof match === 'string' ? error === match : match.test(error as string)
        if (!ok) fail(`expected field "${field}" error to match ${String(match)}, got "${error}"`)
      }
    },
    toHaveNoFieldError(field) {
      const error = errorsNow()[field]
      if (error !== undefined) fail(`expected field "${field}" to have no error, got "${error}"`)
    },
    toBeDirty() {
      if (!form.isDirty()) fail('expected form to be dirty, but no field differs from its initial value')
    },
    toBePristine() {
      if (form.isDirty()) {
        fail(`expected form to be pristine, but these fields are dirty: ${Object.keys(form.dirtyFields()).join(', ')}`)
      }
    },
    toHaveValues(expected) {
      const actual = form.values() as Record<string, unknown>
      for (const key of Object.keys(expected)) {
        const want = (expected as Record<string, unknown>)[key]
        const got = actual[key]
        const equal =
          want === got ||
          (typeof want === 'object' && want !== null && JSON.stringify(want) === JSON.stringify(got))
        if (!equal) {
          fail(`expected values.${key} to be ${JSON.stringify(want)}, got ${JSON.stringify(got)}`)
        }
      }
    },
  }
}

// Re-export waitFor so form tests awaiting async validation don't need a
// second import site.
export { waitFor }
