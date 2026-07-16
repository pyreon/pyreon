/** @jsxImportSource @pyreon/core */
import type { ComponentFn, Props, VNodeChild } from '@pyreon/core'
import { h, nativeCompat } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { FormProvider, useFormContext } from './context'
import type { FormState } from './types'

// ─── <Form> ─────────────────────────────────────────────────────────────────

export interface FormProps<TValues extends Record<string, unknown>> extends Props {
  /** The form instance created by useForm(). */
  of: FormState<TValues>
  children?: VNodeChild
  /** Optional CSS class for the <form> element. */
  class?: string
  /**
   * Disable all form fields. Disabled fields are excluded from submit values.
   * Accepts a boolean or a reactive accessor (e.g. `query.isFetching`).
   * Form-level disabled always takes priority over field-level.
   */
  disabled?: boolean | (() => boolean)
  /**
   * Make all form fields read-only. Read-only fields are included in submit values.
   * Accepts a boolean or a reactive accessor (e.g. `mutation.isPending`).
   * Form-level readOnly always takes priority over field-level.
   */
  readOnly?: boolean | (() => boolean)
}

/**
 * Renders a `<form>` element that provides form context and handles submit.
 * Children can use `useField('name')` and `useFormContext()` without prop drilling.
 *
 * @example
 * ```tsx
 * <Form of={form} disabled={query.isFetching} readOnly={mutation.isPending}>
 *   <EmailInput />
 *   <PasswordInput />
 *   <Submit>Login</Submit>
 * </Form>
 * ```
 */
const Form: ComponentFn<FormProps<Record<string, unknown>>> = (props) => {
  // Sync disabled/readOnly props to form signals
  const syncDisabled = () => {
    const v = props.disabled
    props.of.disabled.set(typeof v === 'function' ? v() : v ?? false)
  }
  const syncReadOnly = () => {
    const v = props.readOnly
    props.of.readOnly.set(typeof v === 'function' ? v() : v ?? false)
  }

  // If accessor, track reactively
  if (typeof props.disabled === 'function') {
    effect(syncDisabled)
  } else {
    syncDisabled()
  }
  if (typeof props.readOnly === 'function') {
    effect(syncReadOnly)
  } else {
    syncReadOnly()
  }

  return h(
    FormProvider,
    { form: props.of },
    h('form', { onSubmit: props.of.handleSubmit, class: props.class }, props.children),
  )
}

// ─── <Submit> ───────────────────────────────────────────────────────────────

export interface SubmitProps extends Props {
  children?: VNodeChild
  /** Optional CSS class. */
  class?: string
}

/**
 * Submit button that auto-disables while the form is submitting or disabled.
 * Must be inside a `<Form>` or `<FormProvider>`.
 */
const Submit: ComponentFn<SubmitProps> = (props) => {
  const form = useFormContext()
  return h(
    'button',
    {
      type: 'submit',
      disabled: () => form.isSubmitting() || form.disabled(),
      class: props.class,
    },
    props.children ?? 'Submit',
  )
}

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// Form's effect()-based prop sync runs once at setup (not per-render via the
// compat wrapper) AND the inner FormProvider is invoked through h() so its
// provide() reaches Pyreon's setup frame.
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _Form = /* @__PURE__ */ nativeCompat(Form)
export { _Form as Form }
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _Submit = /* @__PURE__ */ nativeCompat(Submit)
export { _Submit as Submit }