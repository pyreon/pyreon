import { describe, expect, it, vi } from 'vitest'
import { useForm } from '../use-form'

// P4 — explicit runtime field registration for dynamic / data-driven forms.
// `registerField` / `unregisterField` mutate the field model in lockstep so a
// dynamically-added field is fully first-class (values/onSubmit/validity) and a
// removed field leaves no residue in the invalid/dirty counts.

describe('useForm — registerField (P4)', () => {
  it('a registered field reaches getValues() and onSubmit', async () => {
    const onSubmit = vi.fn()
    const form = useForm<Record<string, unknown>>({ initialValues: { a: 1 }, onSubmit })
    form.registerField('b', 'hello')
    expect(form.getValues()).toEqual({ a: 1, b: 'hello' })
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledWith({ a: 1, b: 'hello' })
  })

  it('setFieldValue works on a registered field (no throw)', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('email', '')
    form.setFieldValue('email', 'x@y.com')
    expect(form.getValues('email')).toBe('x@y.com')
  })

  it('a registered validator participates in form validity', async () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('name', '', (v) => (v ? undefined : 'Required'))
    expect(await form.validate()).toBe(false)
    expect(form.errors().name).toBe('Required')
    form.setFieldValue('name', 'ok')
    expect(await form.validate()).toBe(true)
  })

  it('re-registering is idempotent + refreshes the validator', async () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('x', 'keep')
    form.registerField('x', 'ignored', () => 'now required')
    expect(form.getValues('x')).toBe('keep') // value not clobbered
    expect(await form.validate()).toBe(false) // validator now active
  })

  it('register() DOM binding works on a dynamically-registered field', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('city', '')
    const reg = form.register('city')
    reg.onInput({ target: { value: 'Berlin' } } as unknown as Event)
    expect(form.getValues('city')).toBe('Berlin')
  })

  it('reset() reverts a dynamically-registered field to its initial', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('n', 'init')
    form.setFieldValue('n', 'edited')
    form.reset()
    expect(form.getValues('n')).toBe('init')
  })
})

describe('useForm — unregisterField (P4)', () => {
  it('removes the field from getValues()', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: { a: 1 }, onSubmit: () => {} })
    form.registerField('b', 2)
    form.unregisterField('b')
    expect(form.getValues()).toEqual({ a: 1 })
  })

  it('clears the removed field error contribution → isValid recovers', async () => {
    const form = useForm<Record<string, unknown>>({ initialValues: { a: '' }, onSubmit: () => {} })
    form.registerField('b', '', () => 'Required')
    await form.validate()
    expect(form.isValid()).toBe(false)
    form.unregisterField('b')
    expect(form.isValid()).toBe(true) // b's error contribution removed cleanly
  })

  it('clears the removed field dirty contribution → isDirty recovers', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: { a: 'a' }, onSubmit: () => {} })
    form.registerField('b', 'b0')
    form.setFieldValue('b', 'edited')
    expect(form.isDirty()).toBe(true)
    form.unregisterField('b')
    expect(form.isDirty()).toBe(false)
  })

  it('unregistering an unknown field is a no-op', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: { a: 1 }, onSubmit: () => {} })
    expect(() => form.unregisterField('nope')).not.toThrow()
    expect(form.getValues()).toEqual({ a: 1 })
  })

  it('a re-registered field after unregister is fresh', async () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('x', '', () => 'req')
    await form.validate()
    expect(form.isValid()).toBe(false)
    form.unregisterField('x')
    form.registerField('x', 'val') // no validator this time
    expect(await form.validate()).toBe(true)
  })
})
