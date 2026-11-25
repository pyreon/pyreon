/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it, vi } from 'vitest'
import { Form, Submit } from '../form-component'
import { useField } from '../use-field'
import { useForm } from '../use-form'
import { FormProvider } from '../context'

// ─── useForm with initial values and validators ────────────────────────────

describe('useForm({ initialValues, validators })', () => {
  it('creates a field per initial value', () => {
    const form = useForm({
      initialValues: { email: '', password: '' },
      onSubmit: () => {},
    })

    expect(form.fields.email).toBeDefined()
    expect(form.fields.password).toBeDefined()
    expect(form.fields.email.value()).toBe('')
    expect(form.fields.password.value()).toBe('')
  })

  it('field validators run on submit', async () => {
    const onSubmit = vi.fn()
    const form = useForm({
      initialValues: { email: '' },
      validators: { email: (v: string) => (!v ? 'Required' : undefined) },
      onSubmit,
    })

    await form.handleSubmit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(form.fields.email.error()).toBe('Required')
  })

  it('cross-field validation works via allValues', async () => {
    const onSubmit = vi.fn()
    const form = useForm({
      initialValues: { password: 'secret', confirmPassword: 'wrong' },
      validators: {
        confirmPassword: (v: string, all: Record<string, unknown>) => (v !== all.password ? 'Must match' : undefined),
      },
      onSubmit,
    })

    await form.handleSubmit()
    expect(form.fields.confirmPassword.error()).toBe('Must match')

    // Fix the value via field state directly
    form.fields.confirmPassword.setValue('secret')
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalled()
  })

  it('values() returns typed snapshot', () => {
    const form = useForm({ initialValues: { name: 'Alice', age: 30 }, onSubmit: () => {} })

    const values = form.values()
    expect(values.name).toBe('Alice')
    expect(values.age).toBe(30)
  })
})

// ─── useField with context ──────────────────────────────────────────────────

describe('useField(name) — context mode', () => {
  it('reads field from FormProvider context', () => {
    const form = useForm({ initialValues: { email: 'test@example.com' }, onSubmit: () => {} })
    const ctr = document.createElement('div')

    let fieldValue: string | undefined
    const Inner = () => {
      const f = useField('email')
      fieldValue = f.value() as string
      return null
    }

    mount(h(FormProvider, { form }, h(Inner, {})), ctr)
    expect(fieldValue).toBe('test@example.com')
  })

  it('throws when field name not found', () => {
    const form = useForm({ initialValues: { email: '' }, onSubmit: () => {} })
    const ctr = document.createElement('div')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let caughtError: Error | undefined
    const Inner = () => {
      try {
        useField('nonexistent')
      } catch (e) {
        caughtError = e as Error
      }
      return null
    }

    mount(h(FormProvider, { form }, h(Inner, {})), ctr)
    expect(caughtError).toBeDefined()
    expect(caughtError!.message).toContain('nonexistent')
    errorSpy.mockRestore()
  })

  it('register() works from context-based useField', () => {
    const form = useForm({ initialValues: { email: '' }, onSubmit: () => {} })
    const ctr = document.createElement('div')

    let registerResult: ReturnType<ReturnType<typeof useField>['register']> | undefined
    const Inner = () => {
      const f = useField('email')
      registerResult = f.register()
      return null
    }

    mount(h(FormProvider, { form }, h(Inner, {})), ctr)
    expect(registerResult).toBeDefined()
    expect(registerResult!.value).toBeDefined()
    expect(registerResult!.onInput).toBeDefined()
    expect(registerResult!.onBlur).toBeDefined()
  })
})

// ─── <Form> + <Submit> ──────────────────────────────────────────────────────

describe('<Form> + <Submit>', () => {
  it('<Form of={form}> provides context and renders <form>', () => {
    const form = useForm({ initialValues: { email: '' }, onSubmit: () => {} })
    const ctr = document.createElement('div')

    mount(h(Form, { of: form }, h('input', { id: 'test' })), ctr)

    expect(ctr.querySelector('form')).not.toBeNull()
    expect(ctr.querySelector('#test')).not.toBeNull()
  })

  it('<Form> provides context so handleSubmit works', async () => {
    const onSubmit = vi.fn()
    const form = useForm({ initialValues: { email: 'test@example.com' }, onSubmit })
    const ctr = document.createElement('div')

    mount(h(Form, { of: form }, h(Submit, {}, 'Go')), ctr)

    // Call handleSubmit directly (DOM event dispatch doesn't reliably
    // fire h()-attached handlers in happy-dom)
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledWith({ email: 'test@example.com' })
  })

  it('<Submit> renders with correct type and text', () => {
    const form = useForm({ initialValues: { email: '' }, onSubmit: () => {} })
    const ctr = document.createElement('div')

    mount(h(Form, { of: form }, h(Submit, {}, 'Login')), ctr)

    const button = ctr.querySelector('button')!
    expect(button.type).toBe('submit')
    expect(button.textContent).toBe('Login')
  })

  it('isSubmitting signal tracks async onSubmit', async () => {
    let resolveSubmit: () => void
    const submitPromise = new Promise<void>((r) => { resolveSubmit = r })
    const form = useForm({ initialValues: { email: 'a@b.com' }, onSubmit: () => submitPromise })

    expect(form.isSubmitting()).toBe(false)

    const submitP = form.handleSubmit()
    // isSubmitting is set AFTER validate() resolves — flush multiple microtasks
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(form.isSubmitting()).toBe(true)

    resolveSubmit!()
    await submitP
    expect(form.isSubmitting()).toBe(false)
  })

  it('useField works inside <Form> without explicit form prop', () => {
    const form = useForm({ initialValues: { email: 'hello@world.com' }, onSubmit: () => {} })
    const ctr = document.createElement('div')

    let value: string | undefined
    const EmailInput = () => {
      const f = useField<string>('email')
      value = f.value()
      return h('input', { ...f.register() })
    }

    mount(h(Form, { of: form }, h(EmailInput, {})), ctr)
    expect(value).toBe('hello@world.com')
  })

  it('useField<T> narrows the type via generic', () => {
    const form = useForm({ initialValues: { age: 25 }, onSubmit: () => {} })
    const ctr = document.createElement('div')

    let value: number | undefined
    const AgeInput = () => {
      const f = useField<number>('age')
      value = f.value()
      return null
    }

    mount(h(Form, { of: form }, h(AgeInput, {})), ctr)
    expect(value).toBe(25)
  })
})

// ─── setInitialValues ───────────────────────────────────────────────────────

describe('setInitialValues', () => {
  it('updates field values and clears state', () => {
    const form = useForm({ initialValues: { name: '', email: '' }, onSubmit: () => {} })

    // Simulate user typing
    form.fields.name.setValue('dirty')
    form.fields.name.touched.set(true)

    // Async data arrives
    form.setInitialValues({ name: 'Alice', email: 'alice@example.com' })

    expect(form.fields.name.value()).toBe('Alice')
    expect(form.fields.email.value()).toBe('alice@example.com')
    expect(form.fields.name.touched()).toBe(false)
    expect(form.fields.name.dirty()).toBe(false)
  })

  it('partial update only affects specified fields', () => {
    const form = useForm({ initialValues: { name: 'Bob', email: 'bob@test.com' }, onSubmit: () => {} })

    form.setInitialValues({ email: 'new@test.com' })

    expect(form.fields.name.value()).toBe('Bob') // unchanged
    expect(form.fields.email.value()).toBe('new@test.com')
  })
})

// ─── Reactive initialValues ─────────────────────────────────────────────────

describe('reactive initialValues accessor', () => {
  it('auto-resets when accessor returns new values', async () => {
    const data = signal<{ name: string } | null>(null)

    const form = useForm({
      initialValues: () => ({ name: data()?.name ?? '' }),
      onSubmit: () => {},
    })

    expect(form.fields.name.value()).toBe('')

    // Simulate query data arriving
    data.set({ name: 'Alice' })
    await new Promise<void>((r) => setTimeout(r, 10))

    expect(form.fields.name.value()).toBe('Alice')
  })
})

// ─── disabled / readOnly ────────────────────────────────────────────────────

describe('disabled / readOnly', () => {
  it('form-level disabled signal is reactive', () => {
    const form = useForm({ initialValues: { name: 'test' }, onSubmit: () => {} })

    expect(form.disabled()).toBe(false)
    form.disabled.set(true)
    expect(form.disabled()).toBe(true)
  })

  it('field-level disabled is independent', () => {
    const form = useForm({ initialValues: { name: 'test' }, onSubmit: () => {} })

    form.fields.name.disabled.set(true)
    expect(form.fields.name.disabled()).toBe(true)
    expect(form.disabled()).toBe(false) // form is not disabled
  })

  it('register() includes disabled/readOnly computed (form OR field)', () => {
    const form = useForm({ initialValues: { name: 'test' }, onSubmit: () => {} })

    const reg = form.register('name' as never)
    expect(reg.disabled!()).toBe(false)
    expect(reg.readOnly!()).toBe(false)

    // Field-level disabled
    form.fields.name.disabled.set(true)
    expect(reg.disabled!()).toBe(true)

    // Reset field, set form-level
    form.fields.name.disabled.set(false)
    form.disabled.set(true)
    expect(reg.disabled!()).toBe(true) // form takes priority
  })

  it('disabled fields excluded from submit values', async () => {
    const onSubmit = vi.fn()
    const form = useForm({ initialValues: { name: 'Alice', email: 'alice@test.com' }, onSubmit })

    // Disable email field
    form.fields.email.disabled.set(true)

    await form.handleSubmit()

    // onSubmit should NOT receive email
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Alice' })
  })

  it('readOnly fields included in submit values', async () => {
    const onSubmit = vi.fn()
    const form = useForm({ initialValues: { name: 'Alice', email: 'alice@test.com' }, onSubmit })

    form.fields.email.readOnly.set(true)

    await form.handleSubmit()

    // readOnly fields ARE included
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Alice', email: 'alice@test.com' })
  })

  it('<Form disabled> sets form-level disabled', () => {
    const form = useForm({ initialValues: { name: '' }, onSubmit: () => {} })
    const ctr = document.createElement('div')

    mount(h(Form, { of: form, disabled: true }), ctr)
    expect(form.disabled()).toBe(true)
  })

  it('<Form readOnly> sets form-level readOnly', () => {
    const form = useForm({ initialValues: { name: '' }, onSubmit: () => {} })
    const ctr = document.createElement('div')

    mount(h(Form, { of: form, readOnly: true }), ctr)
    expect(form.readOnly()).toBe(true)
  })
})
