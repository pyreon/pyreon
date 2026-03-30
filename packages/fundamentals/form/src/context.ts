import type { Props, VNode, VNodeChild } from '@pyreon/core'
import { createContext, provide, useContext } from '@pyreon/core'
import type { FormState } from './types'

const FormContext = createContext<FormState<Record<string, unknown>> | null>(null)

export interface FormProviderProps<TValues extends Record<string, unknown>> extends Props {
  form: FormState<TValues>
  children?: VNodeChild
}

/**
 * Provide a form instance to the component tree so nested components
 * can access it via `useFormContext()`.
 *
 * @example
 * const form = useForm({ initialValues: { email: '' }, onSubmit: ... })
 *
 * <FormProvider form={form}>
 *   <EmailField />
 *   <SubmitButton />
 * </FormProvider>
 */
export function FormProvider<TValues extends Record<string, unknown>>(
  props: FormProviderProps<TValues>,
): VNode {
  provide(FormContext, props.form as FormState<Record<string, unknown>>)

  const ch = props.children
  return (typeof ch === 'function' ? (ch as () => VNodeChild)() : ch) as VNode
}

/**
 * Access the form instance from the nearest `FormProvider`.
 * Must be called within a component tree wrapped by `FormProvider`.
 *
 * @example
 * function EmailField() {
 *   const form = useFormContext<{ email: string }>()
 *   return <input {...form.register('email')} />
 * }
 */
export function useFormContext<
  TValues extends Record<string, unknown> = Record<string, unknown>,
>(): FormState<TValues> {
  const form = useContext(FormContext)
  if (!form) {
    throw new Error('[@pyreon/form] useFormContext() must be used within a <FormProvider>.')
  }
  // Generic narrowing: context stores FormState<Record<string, unknown>>
  // but callers narrow to their specific TValues at the call site.
  return form as FormState<TValues>
}
