import { mount } from '@pyreon/runtime-dom'
import { useField, useForm } from '../index'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Capture<T>({ fn }: { fn: () => T }) {
  fn()
  return null
}

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(
    <Capture
      fn={() => {
        result = fn()
      }}
    />,
    el,
  )
  return {
    result: result!,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

type SignupForm = {
  username: string
  email: string
  password: string
}

// ─── Integration tests ───────────────────────────────────────────────────────

describe('Form integration', () => {
  it('useForm with initialValues provides correct field values', () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<SignupForm>({
        initialValues: { username: 'alice', email: 'alice@test.com', password: 'secret' },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    expect(form.fields.username.value()).toBe('alice')
    expect(form.fields.email.value()).toBe('alice@test.com')
    expect(form.fields.password.value()).toBe('secret')
    expect(form.isDirty()).toBe(false)
    expect(form.isValid()).toBe(true)
    unmount()
  })

  it('useField tracks form state for a specific field', () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm<SignupForm>({
        initialValues: { username: '', email: '', password: '' },
        onSubmit: () => {
          /* noop */
        },
      })
      const field = useField(form, 'email')
      return { form, field }
    })

    expect(result.field.value()).toBe('')
    result.form.fields.email.setValue('test@example.com')
    expect(result.field.value()).toBe('test@example.com')
    unmount()
  })

  it('handleSubmit calls onSubmit with current values', async () => {
    let submitted: SignupForm | undefined
    const { result: form, unmount } = mountWith(() =>
      useForm<SignupForm>({
        initialValues: { username: 'bob', email: 'bob@test.com', password: '12345678' },
        onSubmit: (values) => {
          submitted = values
        },
      }),
    )

    await form.handleSubmit()
    expect(submitted).toEqual({
      username: 'bob',
      email: 'bob@test.com',
      password: '12345678',
    })
    expect(form.submitCount()).toBe(1)
    unmount()
  })

  it('validation error is accessible on field', async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<SignupForm>({
        initialValues: { username: '', email: '', password: '' },
        validators: {
          username: (v) => (!v ? 'Username is required' : undefined),
          email: (v) => (!v ? 'Email is required' : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    await form.handleSubmit()
    expect(form.fields.username.error()).toBe('Username is required')
    expect(form.fields.email.error()).toBe('Email is required')
    expect(form.isValid()).toBe(false)
    unmount()
  })

  it('reset restores fields to initial values', async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<SignupForm>({
        initialValues: { username: '', email: '', password: '' },
        validators: {
          username: (v) => (!v ? 'Required' : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.username.setValue('changed')
    form.fields.username.setTouched()
    await form.handleSubmit()

    form.reset()
    expect(form.fields.username.value()).toBe('')
    expect(form.fields.username.error()).toBeUndefined()
    expect(form.fields.username.touched()).toBe(false)
    expect(form.fields.username.dirty()).toBe(false)
    expect(form.submitCount()).toBe(0)
    unmount()
  })
})
