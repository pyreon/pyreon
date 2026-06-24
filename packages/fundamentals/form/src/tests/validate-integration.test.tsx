/**
 * Dogfood: a real `@pyreon/validate` `s.object` schema driving `@pyreon/form`
 * end-to-end via `toFormValidator`. Proves the validate→form integration works
 * through the actual `useForm` runtime (field errors, submit gating, blur),
 * not just the adapter in isolation.
 */
import { mount } from '@pyreon/runtime-dom'
import { s, toFormValidator } from '@pyreon/validate'
import { describe, expect, test } from 'vitest'
import { useForm } from '../use-form'

function Capture<T>({ fn }: { fn: () => T }) {
  fn()
  return null
}
function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(<Capture fn={() => { result = fn() }} />, el)
  return { result: result as T, unmount }
}

const schema = s.object({
  email: s.string().email(),
  age: s.number().int().min(18),
})

// `type` (not `interface`) — an interface has no implicit index signature, so
// it wouldn't satisfy useForm's `TValues extends Record<string, unknown>`.
type Values = {
  email: string
  age: number
}

describe('@pyreon/validate → @pyreon/form (dogfood)', () => {
  test('validate() surfaces per-field errors from the s schema', async () => {
    const { result: form } = mountWith(() =>
      useForm<Values>({
        initialValues: { email: 'nope', age: 5 },
        schema: toFormValidator(schema),
        onSubmit: () => {},
      }),
    )

    const ok = await form.validate()
    expect(ok).toBe(false)
    expect(form.fields.email.error()).toBeTruthy()
    expect(form.fields.age.error()).toBeTruthy()
  })

  test('valid values pass and call onSubmit with the data', async () => {
    let submitted: Values | undefined
    const { result: form } = mountWith(() =>
      useForm<Values>({
        initialValues: { email: 'a@b.co', age: 21 },
        schema: toFormValidator(schema),
        onSubmit: (values) => {
          submitted = values
        },
      }),
    )

    const ok = await form.validate()
    expect(ok).toBe(true)
    expect(form.fields.email.error()).toBeUndefined()
    expect(form.fields.age.error()).toBeUndefined()

    await form.handleSubmit()
    expect(submitted).toEqual({ email: 'a@b.co', age: 21 })
  })

  test('only the failing field gets an error', async () => {
    const { result: form } = mountWith(() =>
      useForm<Values>({
        initialValues: { email: 'a@b.co', age: 5 }, // only age invalid
        schema: toFormValidator(schema),
        onSubmit: () => {},
      }),
    )

    await form.validate()
    expect(form.fields.email.error()).toBeUndefined()
    expect(form.fields.age.error()).toBeTruthy()
  })

  test('blur validates the blurred field via the schema', async () => {
    const { result: form } = mountWith(() =>
      useForm<Values>({
        initialValues: { email: 'nope', age: 21 },
        schema: toFormValidator(schema),
        validateOn: 'blur',
        onSubmit: () => {},
      }),
    )

    expect(form.fields.email.error()).toBeUndefined()
    form.fields.email.setTouched()
    await Promise.resolve()
    await Promise.resolve()
    expect(form.fields.email.error()).toBeTruthy()
  })

  test('fixing a value clears its error on re-validate', async () => {
    const { result: form } = mountWith(() =>
      useForm<Values>({
        initialValues: { email: 'nope', age: 21 },
        schema: toFormValidator(schema),
        onSubmit: () => {},
      }),
    )

    await form.validate()
    expect(form.fields.email.error()).toBeTruthy()

    form.fields.email.setValue('fixed@example.com')
    await form.validate()
    expect(form.fields.email.error()).toBeUndefined()
  })
})
