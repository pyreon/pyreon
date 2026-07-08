import { describe, expect, it, vi } from 'vitest'
import type { StandardSchemaLike } from '../types'
import { useForm } from '../use-form'

// P5 — `useForm({ schema })` accepts a RAW Standard Schema (zod/valibot/arktype/
// @pyreon/validate `s`) directly, with NO adapter and NO `as never` cast. The
// `~standard` contract + the bridge live in @pyreon/validation (the universal
// gate); form consumes them. (The bridge's own unit tests live in @pyreon/
// validation — this file covers the end-to-end useForm integration.)

/** Minimal sync Standard Schema over `{ email: string }` that requires email. */
const emailSchema: StandardSchemaLike<{ email: string }> = {
  '~standard': {
    validate: (v: unknown) => {
      const email = (v as { email?: string }).email
      return email ? { value: v } : { issues: [{ message: 'Email required', path: ['email'] }] }
    },
  },
}

describe('useForm — raw Standard Schema accepted directly (no cast)', () => {
  it('rejects invalid input via the raw schema', async () => {
    // NOTE: `schema: emailSchema` — no `as never`, no zodSchema() wrapper.
    const form = useForm<{ email: string }>({
      initialValues: { email: '' },
      schema: emailSchema,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    expect(form.errors().email).toBe('Email required')
  })

  it('accepts valid input via the raw schema', async () => {
    const form = useForm<{ email: string }>({
      initialValues: { email: 'a@b.com' },
      schema: emailSchema,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(true)
    expect(form.errors()).toEqual({})
  })

  it('handleSubmit runs onSubmit only when the raw schema passes', async () => {
    const onSubmit = vi.fn()
    const form = useForm<{ email: string }>({
      initialValues: { email: '' },
      schema: emailSchema,
      onSubmit,
    })
    await form.handleSubmit()
    expect(onSubmit).not.toHaveBeenCalled()
    form.setFieldValue('email', 'a@b.com')
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('a plain SchemaValidateFn still works (no regression)', async () => {
    const form = useForm<{ name: string }>({
      initialValues: { name: '' },
      schema: (v) => (v.name ? {} : { name: 'Required' }),
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    expect(form.errors().name).toBe('Required')
  })
})
