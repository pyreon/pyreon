/**
 * Compile-time contract: every `@pyreon/form` component and hook that takes a
 * form accepts a TYPED form (`FormState<{ email: string }>`), written the way
 * the docs write it — JSX for components, a plain call for hooks.
 *
 * `FieldState<T>.setValue` is contravariant in `T`, so a component typed
 * against `FormState<Record<string, unknown>>` rejects every typed form under
 * `strict` (#4309). The runtime tests build `h(Form, { of })`, which is not
 * checked the same way, so only a JSX type test catches the class. This file
 * is checked by the package's `tsc --noEmit` (tsconfig includes `src/`).
 */
import { describe, expectTypeOf, it } from 'vitest'
import {
  field,
  Form,
  FormProvider,
  Submit,
  useField,
  useForm,
  useFormState,
  useWatch,
} from '../index'

function typedForm() {
  return useForm({ initialValues: { email: '', age: 0 }, onSubmit: () => {} })
}

function fieldsForm() {
  return useForm({
    fields: [field('email', ''), field('remember', false)],
    onSubmit: () => {},
  })
}

describe('components accept a typed form in JSX', () => {
  it('<Form of> takes a typed initialValues form', () => {
    const form = typedForm()
    const view = (
      <Form of={form}>
        <Submit>Save</Submit>
      </Form>
    )
    expectTypeOf(view).not.toBeAny()
  })

  it('<Form of> takes a typed field() form', () => {
    const form = fieldsForm()
    const view = (
      <Form of={form} disabled={() => false} readOnly class="f">
        <span />
      </Form>
    )
    expectTypeOf(view).not.toBeAny()
  })

  it('<FormProvider form> takes a typed form', () => {
    const form = typedForm()
    const view = (
      <FormProvider form={form}>
        <span />
      </FormProvider>
    )
    expectTypeOf(view).not.toBeAny()
  })

  it('<Form of> still rejects a non-form (negative)', () => {
    // @ts-expect-error — `of` must be a FormState
    const view = <Form of={{ email: '' }} />
    expectTypeOf(view).not.toBeAny()
  })
})

describe('hooks accept a typed form', () => {
  it('useField / useFormState / useWatch keep the field types', () => {
    const form = typedForm()
    expectTypeOf(useField(form, 'email').value()).toEqualTypeOf<string>()
    expectTypeOf(useFormState(form, (s) => s.isValid)()).toEqualTypeOf<boolean>()
    expectTypeOf(useWatch(form, 'age')()).toEqualTypeOf<number>()
  })
})
