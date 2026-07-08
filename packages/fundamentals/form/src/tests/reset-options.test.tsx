import { describe, expect, it } from 'vitest'
import { useForm } from '../use-form'

// P8 — reset ergonomics: `reset(values, { keep* })` + `resetField(field, opts)`.

describe('useForm — reset(values, options) (P8)', () => {
  it('reset() with no arg reverts to the original initial (unchanged behavior)', () => {
    const form = useForm<{ name: string }>({ initialValues: { name: 'init' }, onSubmit: () => {} })
    form.setFieldValue('name', 'edited')
    form.reset()
    expect(form.getValues('name')).toBe('init')
  })

  it('reset(values) resets TO the new values (new baseline)', () => {
    const form = useForm<{ name: string; age: number }>({
      initialValues: { name: 'a', age: 1 },
      onSubmit: () => {},
    })
    form.setFieldValue('name', 'edited')
    form.reset({ name: 'server', age: 42 })
    expect(form.getValues()).toEqual({ name: 'server', age: 42 })
    expect(form.isDirty()).toBe(false)
  })

  it('reset(partial) leaves unnamed fields reverting to their original initial', () => {
    const form = useForm<{ a: string; b: string }>({
      initialValues: { a: 'a0', b: 'b0' },
      onSubmit: () => {},
    })
    form.setFieldValue('a', 'aX')
    form.setFieldValue('b', 'bX')
    form.reset({ a: 'a1' })
    expect(form.getValues('a')).toBe('a1')
    expect(form.getValues('b')).toBe('b0')
  })

  it('keepErrors preserves errors across reset', async () => {
    const form = useForm<{ name: string }>({
      initialValues: { name: '' },
      validators: { name: () => 'Required' },
      onSubmit: () => {},
    })
    await form.validate()
    expect(form.errors().name).toBe('Required')
    form.reset(undefined, { keepErrors: true })
    expect(form.errors().name).toBe('Required')
  })

  it('keepTouched preserves touched across reset', () => {
    const form = useForm<{ name: string }>({ initialValues: { name: '' }, onSubmit: () => {} })
    form.fields.name.setTouched()
    form.reset(undefined, { keepTouched: true })
    expect(form.touchedFields().name).toBe(true)
  })

  it('keepSubmitCount preserves submitCount across reset', async () => {
    const form = useForm<{ name: string }>({
      initialValues: { name: '' },
      validators: { name: () => 'Required' },
      onSubmit: () => {},
    })
    await form.handleSubmit()
    expect(form.submitCount()).toBe(1)
    form.reset(undefined, { keepSubmitCount: true })
    expect(form.submitCount()).toBe(1)
    form.reset()
    expect(form.submitCount()).toBe(0)
  })
})

describe('useForm — resetField(field, options) (P8)', () => {
  it('resetField reverts value + clears error/touched by default', () => {
    const form = useForm<{ name: string }>({ initialValues: { name: 'init' }, onSubmit: () => {} })
    form.setFieldValue('name', 'edited')
    form.setFieldError('name', 'bad')
    form.fields.name.setTouched()
    form.resetField('name')
    expect(form.getValues('name')).toBe('init')
    expect(form.fields.name.error()).toBeUndefined()
    expect(form.fields.name.touched()).toBe(false)
  })

  it('keepError preserves the field error across resetField', () => {
    const form = useForm<{ name: string }>({ initialValues: { name: 'init' }, onSubmit: () => {} })
    form.setFieldError('name', 'bad')
    form.resetField('name', { keepError: true })
    expect(form.fields.name.error()).toBe('bad')
  })

  it('keepTouched preserves touched across resetField', () => {
    const form = useForm<{ name: string }>({ initialValues: { name: 'init' }, onSubmit: () => {} })
    form.fields.name.setTouched()
    form.resetField('name', { keepTouched: true })
    expect(form.fields.name.touched()).toBe(true)
  })
})
