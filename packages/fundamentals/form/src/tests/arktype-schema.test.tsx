import { type } from 'arktype'
import { describe, expect, it, vi } from 'vitest'
import { useForm } from '../use-form'

// `useForm({ schema })` must accept a RAW ArkType schema directly. ArkType
// schemas are CALLABLES (`type({...})` returns a function) that carry the
// `~standard` entrypoint — the shape the object mocks in standard-schema.test
// can't reproduce, which is exactly why the function-short-circuit bug hid.
//
// Before the fix, `resolveSchemaValidator` returned any `typeof === 'function'`
// value as a hand-written `SchemaValidateFn` BEFORE it ever tried
// `isStandardSchema`, so a raw ArkType schema was invoked as the whole-form
// validator (wrong signature) and validation was silently wrong — the form
// reported VALID for invalid input. The reorder (isStandardSchema before the
// bare-function fallback) + @pyreon/validation #2243 (isStandardSchema accepts
// callables) makes a raw ArkType schema work end-to-end.

const userSchema = type({
  email: 'string.email',
  password: 'string >= 8',
})

describe('useForm — raw ArkType schema (callable Standard Schema)', () => {
  it('sanity: an ArkType schema is a callable carrying `~standard`', () => {
    expect(typeof userSchema).toBe('function')
    expect('~standard' in userSchema).toBe(true)
  })

  it('rejects invalid input and surfaces the error on the field', async () => {
    const form = useForm<{ email: string; password: string }>({
      // NOTE: `schema: userSchema` — the raw `type(...)` callable, no adapter,
      // no `as never` cast.
      initialValues: { email: '', password: '' },
      schema: userSchema,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    expect(form.errors().email).toBeTruthy()
  })

  it('accepts valid input', async () => {
    const form = useForm<{ email: string; password: string }>({
      initialValues: { email: 'a@b.com', password: '12345678' },
      schema: userSchema,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(true)
    expect(form.errors()).toEqual({})
  })

  it('handleSubmit runs onSubmit only when the ArkType schema passes', async () => {
    const onSubmit = vi.fn()
    const form = useForm<{ email: string; password: string }>({
      initialValues: { email: '', password: '' },
      schema: userSchema,
      onSubmit,
    })
    await form.handleSubmit()
    expect(onSubmit).not.toHaveBeenCalled()
    form.setFieldValue('email', 'a@b.com')
    form.setFieldValue('password', '12345678')
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('a hand-written SchemaValidateFn (function WITHOUT `~standard`) still works — no regression', async () => {
    // The reorder keeps the bare-function fallback intact: a plain validate
    // function (no `~standard`) must still be treated as a SchemaValidateFn.
    // This passes in BOTH the broken and fixed states — it locks the fallback.
    const form = useForm<{ name: string }>({
      initialValues: { name: '' },
      schema: (v) => (v.name ? {} : { name: 'Required' }),
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    expect(form.errors().name).toBe('Required')
  })
})
