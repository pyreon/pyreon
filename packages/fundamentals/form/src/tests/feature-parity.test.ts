// Feature-parity additions (react-hook-form surface): trigger, dirtyFields,
// touchedFields, getValues(name), getFieldState, isSubmitted,
// isSubmitSuccessful. Headless (useForm runs outside a component).
import { describe, expect, it } from 'vitest'
import { useForm } from '../use-form'

const required = (v: string): string | undefined => (v ? undefined : 'Required')

describe('trigger(field?)', () => {
  it('validates a single field and returns its validity', async () => {
    const form = useForm({
      initialValues: { email: '', name: '' },
      validators: { email: required, name: required },
      onSubmit: () => {},
    })
    // Only email is invalid-empty; trigger just email.
    expect(await form.trigger('email')).toBe(false)
    expect(form.fields.email.error()).toBe('Required')
    // name was NOT triggered → no error set on it.
    expect(form.fields.name.error()).toBeUndefined()
    form.setFieldValue('email', 'a@b.com')
    expect(await form.trigger('email')).toBe(true)
    expect(form.fields.email.error()).toBeUndefined()
  })

  it('validates a subset (array) and returns combined validity', async () => {
    const form = useForm({
      initialValues: { a: '', b: 'ok', c: '' },
      validators: { a: required, b: required, c: required },
      onSubmit: () => {},
    })
    expect(await form.trigger(['a', 'b'])).toBe(false) // a empty
    expect(form.fields.a.error()).toBe('Required')
    expect(form.fields.b.error()).toBeUndefined()
    expect(form.fields.c.error()).toBeUndefined() // not triggered
  })

  it('with no argument validates the whole form (= validate())', async () => {
    const form = useForm({
      initialValues: { a: '', b: '' },
      validators: { a: required, b: required },
      onSubmit: () => {},
    })
    expect(await form.trigger()).toBe(false)
    expect(form.fields.a.error()).toBe('Required')
    expect(form.fields.b.error()).toBe('Required')
  })

  it('applies a schema error for a schema-only field', async () => {
    const form = useForm({
      initialValues: { email: '' },
      schema: (values) => (values.email ? {} : { email: 'Schema: required' }),
      onSubmit: () => {},
    })
    expect(await form.trigger('email')).toBe(false)
    expect(form.fields.email.error()).toBe('Schema: required')
  })
})

describe('dirtyFields / touchedFields', () => {
  it('reports only dirty fields', () => {
    const form = useForm({ initialValues: { a: '', b: '', c: '' }, onSubmit: () => {} })
    expect(form.dirtyFields()).toEqual({})
    form.setFieldValue('a', 'x')
    form.setFieldValue('c', 'y')
    expect(form.dirtyFields()).toEqual({ a: true, c: true })
    // reverting a clears it from the record
    form.setFieldValue('a', '')
    expect(form.dirtyFields()).toEqual({ c: true })
  })

  it('reports only touched fields', () => {
    const form = useForm({ initialValues: { a: '', b: '' }, onSubmit: () => {} })
    expect(form.touchedFields()).toEqual({})
    form.fields.a.setTouched()
    expect(form.touchedFields()).toEqual({ a: true })
  })
})

describe('getValues(field?)', () => {
  it('returns all values with no arg, one value with a field arg', () => {
    const form = useForm({ initialValues: { email: 'a@b.com', age: 3 }, onSubmit: () => {} })
    expect(form.getValues()).toEqual({ email: 'a@b.com', age: 3 })
    expect(form.getValues('email')).toBe('a@b.com')
    expect(form.getValues('age')).toBe(3)
    form.setFieldValue('age', 7)
    expect(form.getValues('age')).toBe(7)
  })
})

describe('getFieldState(field)', () => {
  it('returns the live FieldState (same object as fields[field])', () => {
    const form = useForm({ initialValues: { email: '' }, onSubmit: () => {} })
    expect(form.getFieldState('email')).toBe(form.fields.email)
    form.getFieldState('email').setValue('x')
    expect(form.fields.email.value()).toBe('x')
  })
})

describe('isSubmitted / isSubmitSuccessful', () => {
  it('isSubmitted flips true after a submit attempt and resets with reset()', async () => {
    const form = useForm({ initialValues: { a: 'ok' }, onSubmit: () => {} })
    expect(form.isSubmitted()).toBe(false)
    await form.handleSubmit()
    expect(form.isSubmitted()).toBe(true)
    form.reset()
    expect(form.isSubmitted()).toBe(false)
  })

  it('isSubmitSuccessful is true only after a successful submit', async () => {
    let allow = false
    const form = useForm({
      initialValues: { a: '' },
      validators: { a: (v) => (allow && v ? undefined : 'no') },
      onSubmit: () => {},
    })
    // first submit fails validation
    await form.handleSubmit()
    expect(form.isSubmitSuccessful()).toBe(false)
    // make it pass
    allow = true
    form.setFieldValue('a', 'x')
    await form.handleSubmit()
    expect(form.isSubmitSuccessful()).toBe(true)
    // reset clears it
    form.reset()
    expect(form.isSubmitSuccessful()).toBe(false)
  })

  it('isSubmitSuccessful is false after onSubmit throws', async () => {
    const form = useForm({
      initialValues: { a: 'ok' },
      onSubmit: () => {
        throw new Error('boom')
      },
    })
    await expect(form.handleSubmit()).rejects.toThrow('boom')
    expect(form.isSubmitSuccessful()).toBe(false)
    expect(form.submitError()).toBeInstanceOf(Error)
  })
})
