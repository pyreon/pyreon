import { describe, expect, it } from 'vitest'
import { useForm } from '../use-form'
import { useField } from '../use-field'
import type { FieldRegisterProps } from '../types'

describe('form a11y auto-wiring — register() ARIA', () => {
  const make = () =>
    useForm({
      initialValues: { email: '' },
      validators: { email: (v: string) => (v.length === 0 ? 'Required' : undefined) },
      validateOn: 'change',
      onSubmit: () => {},
    })

  it('register() returns a stable id + reactive aria accessors', () => {
    const form = make()
    const props = form.register('email') as FieldRegisterProps<string>
    expect(typeof props.id).toBe('string')
    // Stable across calls (memoized).
    expect((form.register('email') as FieldRegisterProps<string>).id).toBe(props.id)
    expect(typeof props['aria-invalid']).toBe('function')
    expect(typeof props['aria-describedby']).toBe('function')
  })

  it('aria-invalid is undefined when valid, "true" when errored (reactive)', () => {
    const form = make()
    const props = form.register('email') as FieldRegisterProps<string>
    // Initially no error → no aria-invalid attribute.
    expect(props['aria-invalid']!()).toBeUndefined()
    expect(props['aria-describedby']!()).toBeUndefined()

    form.setFieldError('email', 'Required')
    expect(props['aria-invalid']!()).toBe('true')
    expect(props['aria-describedby']!()).toBe(form.errorProps('email').id)

    form.clearErrors()
    expect(props['aria-invalid']!()).toBeUndefined()
    expect(props['aria-describedby']!()).toBeUndefined()
  })

  it('errorProps / labelProps ids agree with the input', () => {
    const form = make()
    const props = form.register('email') as FieldRegisterProps<string>
    // label `for` ↔ input id
    expect(form.labelProps('email').for).toBe(props.id)
    // error id ↔ input id (derived), and role announces it
    const err = form.errorProps('email')
    expect(err.id).toBe(`${props.id}-error`)
    expect(err.role).toBe('alert')
  })

  it('useField(form, name) exposes field-scoped errorProps / labelProps that agree with the input', () => {
    const form = make()
    const f = useField(form, 'email')
    const props = f.register() as FieldRegisterProps<string>
    expect(f.labelProps().for).toBe(props.id)
    expect(f.errorProps().id).toBe(`${props.id}-error`)
    expect(f.errorProps().role).toBe('alert')
  })

  it('register + trigger work for a field without a validator (no aria-invalid)', async () => {
    const form = useForm({ initialValues: { note: '' }, onSubmit: () => {} })
    const props = form.register('note') as FieldRegisterProps<string>
    expect(props.id).toBeTruthy()
    expect(props['aria-invalid']!()).toBeUndefined()
    // trigger() on a field with no validator clears its error → stays valid,
    // so aria-invalid remains absent.
    await form.trigger('note')
    expect(props['aria-invalid']!()).toBeUndefined()
    expect(form.labelProps('note').for).toBe(props.id)
  })

  it('checkbox register() also carries id + aria accessors', () => {
    const form = useForm({
      initialValues: { agree: false },
      validators: { agree: (v: boolean) => (v ? undefined : 'Must agree') },
      validateOn: 'change',
      onSubmit: () => {},
    })
    const cb = form.register('agree', { type: 'checkbox' })
    expect(typeof cb.id).toBe('string')
    expect(cb['aria-invalid']!()).toBeUndefined()
    form.setFieldError('agree', 'Must agree')
    expect(cb['aria-invalid']!()).toBe('true')
  })
})
