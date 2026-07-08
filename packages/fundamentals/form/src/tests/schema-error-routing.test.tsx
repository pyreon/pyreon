import { describe, expect, it, vi } from 'vitest'
import {
  matchSchemaErrorForField,
  orphanSchemaErrorKeys,
  useForm,
} from '../use-form'

// B1 — schema-error routing. Before this fix, a schema-error keyed by a nested
// dot-path (`address.city`, produced by the zod/valibot/arktype adapters) or a
// path-less `""` key matched NO top-level field, so `validate()` dropped it and
// reported the form VALID while the schema had rejected — a silent submit of
// invalid data. See .claude/rules/anti-patterns.md.

describe('matchSchemaErrorForField (pure)', () => {
  it('returns an exact key match', () => {
    expect(matchSchemaErrorForField({ email: 'bad' }, 'email')).toBe('bad')
  })
  it('matches a nested key to its top-level ancestor field', () => {
    expect(matchSchemaErrorForField({ 'address.city': 'req' }, 'address')).toBe('req')
  })
  it('prefers an exact match over a nested one', () => {
    expect(matchSchemaErrorForField({ address: 'whole', 'address.city': 'req' }, 'address')).toBe(
      'whole',
    )
  })
  it('does NOT false-match a sibling with a shared prefix', () => {
    // `addressLine2` must not match field `address` (no dot boundary).
    expect(matchSchemaErrorForField({ 'addressLine2.foo': 'x' }, 'address')).toBeUndefined()
  })
  it('returns undefined when nothing matches', () => {
    expect(matchSchemaErrorForField({ email: 'bad' }, 'name')).toBeUndefined()
  })
})

describe('orphanSchemaErrorKeys (pure)', () => {
  const fields = new Set(['address', 'email'])
  it('flags a key whose top-level segment is not a field', () => {
    expect(orphanSchemaErrorKeys({ phone: 'req' }, fields)).toEqual(['phone'])
  })
  it('does NOT flag a nested key under a registered field', () => {
    expect(orphanSchemaErrorKeys({ 'address.city': 'req' }, fields)).toEqual([])
  })
  it('flags the path-less "" whole-form key', () => {
    expect(orphanSchemaErrorKeys({ '': 'form bad' }, fields)).toEqual([''])
  })
  it('ignores undefined values', () => {
    expect(orphanSchemaErrorKeys({ phone: undefined }, fields)).toEqual([])
  })
})

describe('useForm — nested schema error is no longer dropped (B1)', () => {
  it('validate() returns FALSE and surfaces the nested error on its ancestor field', async () => {
    const form = useForm<{ address: { city: string } }>({
      initialValues: { address: { city: '' } },
      schema: ((values: { address: { city: string } }) =>
        values.address?.city ? {} : { 'address.city': 'City is required' }) as never,
      onSubmit: () => {},
    })
    const valid = await form.validate()
    expect(valid).toBe(false)
    // The object-valued `address` field now carries the nested error.
    expect(form.errors()).toEqual({ address: 'City is required' })
  })

  it('handleSubmit does NOT call onSubmit when a nested schema error exists', async () => {
    const onSubmit = vi.fn()
    const form = useForm<{ address: { city: string } }>({
      initialValues: { address: { city: '' } },
      schema: ((v: { address: { city: string } }) =>
        v.address?.city ? {} : { 'address.city': 'City is required' }) as never,
      onSubmit,
    })
    await form.handleSubmit()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('a schema error for a key matching NO field invalidates + sets submitError (no silent pass)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = useForm<{ email: string }>({
      initialValues: { email: 'a@b.com' },
      // schema rejects a field that isn't registered — a real shape mismatch.
      schema: (() => ({ phone: 'Phone is required' })) as never,
      onSubmit: () => {},
    })
    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(String((form.submitError as () => unknown)())).toContain('phone')
    warn.mockRestore()
  })

  it('a path-less "" whole-form schema error invalidates (was dropped before)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = useForm<{ email: string }>({
      initialValues: { email: 'x' },
      schema: (() => ({ '': 'Form is invalid' })) as never,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    warn.mockRestore()
  })

  it('field-level error still WINS over a schema error for the same field', async () => {
    const form = useForm<{ email: string }>({
      initialValues: { email: '' },
      validators: { email: () => 'field-level error' },
      schema: (() => ({ email: 'schema error' })) as never,
      onSubmit: () => {},
    })
    await form.validate()
    expect(form.errors().email).toBe('field-level error')
  })

  it('exact top-level schema errors still apply (no regression)', async () => {
    const form = useForm<{ email: string }>({
      initialValues: { email: '' },
      schema: ((v: { email: string }) => (v.email ? {} : { email: 'Required' })) as never,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    expect(form.errors().email).toBe('Required')
  })
})

describe('useForm — nested schema error on blur (B1)', () => {
  it('blurring an object field surfaces its nested schema error', async () => {
    const form = useForm<{ address: { city: string } }>({
      initialValues: { address: { city: '' } },
      validateOn: 'blur',
      schema: ((v: { address: { city: string } }) =>
        v.address?.city ? {} : { 'address.city': 'City is required' }) as never,
      onSubmit: () => {},
    })
    form.fields.address.setTouched()
    // runSchemaForField is async — flush a microtask.
    await Promise.resolve()
    await Promise.resolve()
    expect(form.fields.address.error()).toBe('City is required')
  })
})
