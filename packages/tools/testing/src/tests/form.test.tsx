/**
 * `@pyreon/testing/form` — happy-dom suite.
 *
 * Layer 1 (headless): renderForm drives the MODEL (setFieldValue + touch).
 * Layer 2 (rendered): fillForm/submitForm drive REAL DOM events against a
 * register()-bound form (label-associated per the a11y auto-wire contract).
 * Layer 3: expectForm fluent assertions, positive + negative + message shape.
 *
 * Real-Chromium twin: library-helpers.browser.test.tsx (delegation-path
 * fill/submit).
 */
import type { FormState } from '@pyreon/form'
import { Form, useForm } from '@pyreon/form'
import { describe, expect, it } from 'vitest'
import { expectForm, fillForm, renderForm, submitForm } from '../form'
import { render } from '../render'

type Login = {
  email: string
  password: string
}

const requiredEmail = (v: string) => (v.includes('@') ? undefined : 'invalid email')

function makeOptions(onSubmit: (values: Login) => void | Promise<void> = () => {}) {
  return {
    initialValues: { email: '', password: '' } as Login,
    validators: { email: requiredEmail },
    onSubmit,
  }
}

describe('renderForm (headless harness)', () => {
  it('fill() writes values through setFieldValue and marks touched', () => {
    const { form, fill, unmount } = renderForm(() => useForm<Login>(makeOptions()))
    fill({ email: 'ada@lovelace.dev' })
    expect(form.values().email).toBe('ada@lovelace.dev')
    expect(form.fields.email.touched()).toBe(true)
    expect(form.fields.email.dirty()).toBe(true)
    unmount()
  })

  it('fill() with an unregistered field throws an actionable error', () => {
    const { fill, unmount } = renderForm(() => useForm<Login>(makeOptions()))
    expect(() => fill({ nope: 'x' } as unknown as Partial<Login>)).toThrow(
      /"nope" is not a registered field.*email, password/,
    )
    unmount()
  })

  it('submit() runs the full pipeline — valid form reaches onSubmit', async () => {
    let submitted: Login | null = null
    const { fill, submit, form, unmount } = renderForm(() =>
      useForm<Login>(makeOptions((v) => void (submitted = v))),
    )
    fill({ email: 'ada@lovelace.dev', password: 'pw' })
    await submit()
    expect(submitted).toEqual({ email: 'ada@lovelace.dev', password: 'pw' })
    expect(form.isSubmitSuccessful()).toBe(true)
    unmount()
  })

  it('submit() on an invalid form surfaces field errors, onSubmit not called', async () => {
    let calls = 0
    const { submit, form, unmount } = renderForm(() =>
      useForm<Login>(makeOptions(() => void calls++)),
    )
    await submit()
    expect(calls).toBe(0)
    expect(form.errors().email).toBe('invalid email')
    unmount()
  })
})

describe('fillForm / submitForm (rendered form)', () => {
  function LoginForm(props: { onSubmit: (values: Login) => void }) {
    const form = useForm<Login>({
      initialValues: { email: '', password: '' },
      validators: { email: requiredEmail },
      onSubmit: props.onSubmit,
    })
    const email = form.register('email')
    const password = form.register('password')
    return (
      <Form of={form as never}>
        <label {...form.labelProps('email')}>Email</label>
        <input id={email.id} value={email.value} onInput={email.onInput} onBlur={email.onBlur} />
        <label {...form.labelProps('password')}>Password</label>
        <input
          id={password.id}
          value={password.value}
          onInput={password.onInput}
          onBlur={password.onBlur}
        />
        <button type="submit">Go</button>
      </Form>
    )
  }

  it('fills labelled inputs via real input+blur events and submits the <form>', async () => {
    let submitted: Login | null = null
    const { container } = render(<LoginForm onSubmit={(v) => void (submitted = v)} />)

    fillForm(container, { Email: 'ada@lovelace.dev', Password: 'pw' })
    await submitForm(container)

    expect(submitted).toEqual({ email: 'ada@lovelace.dev', password: 'pw' })
  })

  it('blur after fill triggers the default validateOn:"blur" validation', async () => {
    let form!: FormState<Login>
    function Probe() {
      form = useForm<Login>(makeOptions())
      const email = form.register('email')
      return (
        <div>
          <label {...form.labelProps('email')}>Email</label>
          <input id={email.id} value={email.value} onInput={email.onInput} onBlur={email.onBlur} />
        </div>
      )
    }
    const { container } = render(<Probe />)
    fillForm(container, { Email: 'not-an-email' })
    // validateOn 'blur' — the fired blur event ran the validator.
    await expect
      .poll(() => form.errors().email)
      .toBe('invalid email')
    expect(container.querySelector('input')!.value).toBe('not-an-email')
  })

  it('checkbox fields take booleans and only click on state mismatch', () => {
    const { container } = render(
      <form>
        <label for="terms">Accept terms</label>
        <input id="terms" type="checkbox" />
      </form>,
    )
    const box = container.querySelector('input')!
    fillForm(container, { 'Accept terms': true })
    expect(box.checked).toBe(true)
    // Same value again → no toggle-off.
    fillForm(container, { 'Accept terms': true })
    expect(box.checked).toBe(true)
    fillForm(container, { 'Accept terms': false })
    expect(box.checked).toBe(false)
  })

  it('radio inputs also take booleans', () => {
    const { container } = render(
      <form>
        <label for="opt-a">Option A</label>
        <input id="opt-a" type="radio" name="opt" />
      </form>,
    )
    fillForm(container, { 'Option A': true })
    expect((container.querySelector('input') as HTMLInputElement).checked).toBe(true)
  })

  it('checkbox with a non-boolean value throws an actionable error', () => {
    const { container } = render(
      <form>
        <label for="cb">Check</label>
        <input id="cb" type="checkbox" />
      </form>,
    )
    expect(() => fillForm(container, { Check: 'yes' })).toThrow(/is a checkbox — pass a boolean/)
  })

  it('file inputs take File / File[] (target.files set on the input event)', () => {
    let files: FileList | File[] | null = null
    const { container } = render(
      <form>
        <label for="upload">Upload</label>
        <input
          id="upload"
          type="file"
          onInput={(e: Event) => {
            files = (e.target as HTMLInputElement).files
          }}
        />
      </form>,
    )
    const file = new File(['x'], 'x.txt', { type: 'text/plain' })
    fillForm(container, { Upload: file })
    expect(files).not.toBeNull()
    expect((files as unknown as ArrayLike<File>)[0]!.name).toBe('x.txt')

    fillForm(container, { Upload: [file, new File(['y'], 'y.txt')] })
    expect((files as unknown as ArrayLike<File>).length).toBe(2)
  })

  it('file input with a non-File value throws an actionable error', () => {
    const { container } = render(
      <form>
        <label for="f">Attachment</label>
        <input id="f" type="file" />
      </form>,
    )
    expect(() => fillForm(container, { Attachment: 'nope' })).toThrow(/is a file input — pass a File/)
  })

  it('numbers are stringified for text-ish inputs', () => {
    const { container } = render(
      <form>
        <label for="qty">Quantity</label>
        <input id="qty" type="number" />
      </form>,
    )
    fillForm(container, { Quantity: 42 })
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('42')
  })

  it('submitForm accepts the <form> element itself and ancestors-of scope', async () => {
    let submits = 0
    const { container } = render(
      <form onSubmit={(e: Event) => (e.preventDefault(), submits++)}>
        <div id="inner">
          <button type="submit">Go</button>
        </div>
      </form>,
    )
    const formEl = container.querySelector('form') as HTMLFormElement
    await submitForm(formEl) // scope IS the form
    await submitForm(container) // descendant lookup
    await submitForm(formEl.querySelector('#inner') as HTMLElement) // ancestor lookup (closest)
    expect(submits).toBe(3)
  })

  it('submitForm with no <form> anywhere throws an actionable error', async () => {
    const { container } = render(<div>no form here</div>)
    await expect(submitForm(container)).rejects.toThrow(/no <form> element found/)
  })
})

describe('expectForm (fluent assertions)', () => {
  it('toBeValid / toBeInvalid', async () => {
    const { form, submit, fill, unmount } = renderForm(() => useForm<Login>(makeOptions()))
    expectForm(form).toBeValid() // no validator has run yet — honest contract
    await submit()
    expectForm(form).toBeInvalid()
    expect(() => expectForm(form).toBeValid()).toThrow(/expected form to be valid.*invalid email/)
    fill({ email: 'ada@lovelace.dev' })
    await submit()
    expectForm(form).toBeValid()
    expect(() => expectForm(form).toBeInvalid()).toThrow(/expected form to be invalid/)
    unmount()
  })

  it('toHaveFieldError with exact string / RegExp / no matcher + negative', async () => {
    const { form, submit, unmount } = renderForm(() => useForm<Login>(makeOptions()))
    await submit()
    expectForm(form).toHaveFieldError('email')
    expectForm(form).toHaveFieldError('email', 'invalid email')
    expectForm(form).toHaveFieldError('email', /invalid/)
    expectForm(form).toHaveNoFieldError('password')
    expect(() => expectForm(form).toHaveFieldError('password')).toThrow(
      /expected field "password" to have an error.*fields with errors: email/,
    )
    expect(() => expectForm(form).toHaveFieldError('email', 'other message')).toThrow(
      /error to match other message/,
    )
    expect(() => expectForm(form).toHaveFieldError('email', /nope/)).toThrow(/error to match \/nope\//)
    expect(() => expectForm(form).toHaveNoFieldError('email')).toThrow(
      /expected field "email" to have no error/,
    )
    unmount()
  })

  it('toHaveFieldError names the run-validators-first footgun when NO field has errors', () => {
    const { form, unmount } = renderForm(() => useForm<Login>(makeOptions()))
    expect(() => expectForm(form).toHaveFieldError('email')).toThrow(/validators run on blur\/submit/)
    unmount()
  })

  it('toBeDirty / toBePristine', () => {
    const { form, fill, unmount } = renderForm(() => useForm<Login>(makeOptions()))
    expectForm(form).toBePristine()
    expect(() => expectForm(form).toBeDirty()).toThrow(/expected form to be dirty/)
    fill({ email: 'x@y.z' })
    expectForm(form).toBeDirty()
    expect(() => expectForm(form).toBePristine()).toThrow(/fields are dirty: email/)
    unmount()
  })

  it('toHaveValues — subset compare, primitives + deep objects', () => {
    const { form, fill, unmount } = renderForm(() =>
      useForm({
        initialValues: { email: '', tags: [] as string[] },
        onSubmit: () => {},
      }),
    )
    fill({ email: 'a@b.c', tags: ['x', 'y'] })
    expectForm(form).toHaveValues({ email: 'a@b.c' })
    expectForm(form).toHaveValues({ tags: ['x', 'y'] })
    expect(() => expectForm(form).toHaveValues({ email: 'other' })).toThrow(
      /expected values\.email to be "other", got "a@b\.c"/,
    )
    expect(() => expectForm(form).toHaveValues({ tags: ['z'] })).toThrow(/expected values\.tags/)
    unmount()
  })
})
