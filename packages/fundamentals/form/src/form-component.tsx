/** @jsxImportSource @pyreon/core */
import type { ComponentFn, Props, VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { FormProvider } from './context'
import { useFormContext } from './context'
import type { FormState } from './types'

// ─── <Form> ─────────────────────────────────────────────────────────────────

export interface FormProps<TValues extends Record<string, unknown>> extends Props {
  /** The form instance created by useForm(). */
  of: FormState<TValues>
  children?: VNodeChild
  /** Optional CSS class for the <form> element. */
  class?: string
}

/**
 * Renders a `<form>` element that provides form context and handles submit.
 * Children can use `useField('name')` and `useFormContext()` without prop drilling.
 *
 * @example
 * ```tsx
 * <Form of={form}>
 *   <EmailInput />
 *   <PasswordInput />
 *   <Submit>Login</Submit>
 * </Form>
 * ```
 */
export const Form: ComponentFn<FormProps<Record<string, unknown>>> = (props) => {
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
 * Submit button that auto-disables while the form is submitting.
 * Must be inside a `<Form>` or `<FormProvider>`.
 *
 * @example
 * ```tsx
 * <Form of={form}>
 *   <Submit>Login</Submit>
 * </Form>
 * ```
 */
export const Submit: ComponentFn<SubmitProps> = (props) => {
  const form = useFormContext()
  return h(
    'button',
    { type: 'submit', disabled: form.isSubmitting, class: props.class },
    props.children ?? 'Submit',
  )
}
