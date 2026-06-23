// values() / getValues() snapshot cache — rebuilt only when a value-mutation
// method advances the internal epoch. These lock the invalidation contract:
// the cache must reflect every mutation through the form's methods, and stay
// referentially stable between mutations.
import { describe, expect, it } from 'vitest'
import { useForm } from '../use-form'

describe('values() snapshot cache', () => {
  it('reflects setValue / setFieldValue mutations', () => {
    const form = useForm({ initialValues: { a: '', b: 0 }, onSubmit: () => {} })
    expect(form.values()).toEqual({ a: '', b: 0 })
    form.setFieldValue('a', 'x')
    expect(form.values()).toEqual({ a: 'x', b: 0 }) // cache invalidated
    form.fields.a.setValue('y')
    expect(form.values().a).toBe('y') // invalidated again
    form.setFieldValue('b', 42)
    expect(form.values()).toEqual({ a: 'y', b: 42 })
  })

  it('reflects reset() and resetField()', () => {
    const form = useForm({ initialValues: { a: 'init', b: 'init2' }, onSubmit: () => {} })
    form.setFieldValue('a', 'changed')
    form.setFieldValue('b', 'changed2')
    expect(form.values()).toEqual({ a: 'changed', b: 'changed2' })
    form.resetField('a')
    expect(form.values()).toEqual({ a: 'init', b: 'changed2' })
    form.reset()
    expect(form.values()).toEqual({ a: 'init', b: 'init2' })
  })

  it('reflects setInitialValues()', () => {
    const form = useForm({ initialValues: { a: '', b: '' }, onSubmit: () => {} })
    form.setFieldValue('a', 'typed')
    form.setInitialValues({ a: 'fromServer', b: 'alsoServer' })
    expect(form.values()).toEqual({ a: 'fromServer', b: 'alsoServer' })
  })

  it('getValues() and getValues(name) read through the same cache', () => {
    const form = useForm({ initialValues: { email: 'a@b.com', age: 1 }, onSubmit: () => {} })
    expect(form.getValues()).toEqual({ email: 'a@b.com', age: 1 })
    form.setFieldValue('age', 7)
    expect(form.getValues('age')).toBe(7)
    expect(form.getValues()).toEqual({ email: 'a@b.com', age: 7 })
  })

  it('is referentially stable between mutations (cache returns the same object)', () => {
    const form = useForm({ initialValues: { a: '' }, onSubmit: () => {} })
    const first = form.values()
    expect(form.values()).toBe(first) // no mutation → same cached object
    form.setFieldValue('a', 'x')
    expect(form.values()).not.toBe(first) // mutation → fresh object
  })

  it('cross-field validators see fresh values after a setValue', async () => {
    // The internal getValues (used by validators) shares the cache — a
    // validator reading allValues must see the just-set value (epoch bumped
    // before validateField runs).
    let seen: unknown
    const form = useForm({
      initialValues: { a: '', b: '' },
      validateOn: 'change',
      validators: { b: (_v, all) => { seen = (all as { a: string }).a; return undefined } },
      onSubmit: () => {},
    })
    form.setFieldValue('a', 'fresh')
    form.setFieldValue('b', 'trigger') // triggers b's validator (change mode)
    expect(seen).toBe('fresh')
  })
})
