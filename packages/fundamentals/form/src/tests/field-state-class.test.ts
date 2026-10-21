import { useForm } from '../use-form'

// Fields are a class (prototype getters for the lazy signals) rather than an
// object literal with accessors — see FieldStateImpl. These pin the contract
// that change must keep.
describe('FieldState — class shape', () => {
  const make = () => useForm({ initialValues: { email: '', age: 0 }, onSubmit: () => {} })

  it('lazy signals are created on first read and keep their identity', () => {
    const f = make().fields.email
    const e = f.error
    expect(f.error).toBe(e)
    expect(f.touched).toBe(f.touched)
    expect(f.disabled).toBe(f.disabled)
    expect(f.readOnly).toBe(f.readOnly)
    expect(e()).toBeUndefined()
    expect(f.touched()).toBe(false)
  })

  it('methods still work when destructured off the field', () => {
    const form = make()
    const { setValue, setTouched, reset, value, dirty } = form.fields.email
    setValue('a@b')
    expect(value()).toBe('a@b')
    expect(dirty()).toBe(true)
    setTouched()
    expect(form.fields.email.touched()).toBe(true)
    reset()
    expect(value()).toBe('')
    expect(dirty()).toBe(false)
    expect(form.fields.email.touched()).toBe(false)
  })

  it('reset clears a materialized error and touched, and leaves unread ones unmaterialized', () => {
    const form = make()
    const f = form.fields.age
    f.error.set('bad')
    f.setTouched()
    f.reset()
    expect(f.error()).toBeUndefined()
    expect(f.touched()).toBe(false)
  })

  it('own enumerable keys are the public data and methods only', () => {
    expect(Object.keys(make().fields.email).sort()).toEqual(['dirty', 'reset', 'setTouched', 'setValue', 'value'])
  })
})
