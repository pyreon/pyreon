import { describe, expect, it, vi } from 'vitest'
import { nestValues } from '../path'
import { useForm } from '../use-form'

// First-class dot-path LEAF fields. A key containing a dot (`address.city`)
// declares a leaf field addressable exactly like a top-level one; a
// schema/validator error keyed by the same dot-path routes to the LEAF (not the
// ancestor). The value model stays FLAT (values()/onSubmit keep the dot-path
// keys); `nestValues` converts to a nested API payload. See .claude/rules/
// anti-patterns.md schema-error-routing entry.

type DotForm = {
  name: string
  'address.city': string
  'address.zip': string
}

describe('dot-path leaf fields — addressing', () => {
  it('creates a first-class leaf field addressable by the dot-path key', () => {
    const form = useForm<DotForm>({
      initialValues: { name: '', 'address.city': '', 'address.zip': '' },
      onSubmit: () => {},
    })
    expect(form.fields['address.city']).toBeDefined()
    form.setFieldValue('address.city', 'NYC')
    expect(form.getValues('address.city')).toBe('NYC')
    expect(form.fields['address.city'].dirty()).toBe(true)
  })

  it('values()/onSubmit keep FLAT dot-path keys; nestValues() converts to nested', async () => {
    const submitted: unknown[] = []
    const form = useForm<DotForm>({
      initialValues: { name: 'Ada', 'address.city': '', 'address.zip': '' },
      onSubmit: (values) => {
        submitted.push(values)
      },
    })
    form.setFieldValue('address.city', 'NYC')
    form.setFieldValue('address.zip', '10001')
    // values() is flat — field-name-keyed (honest typing, no footgun).
    expect(form.values()).toEqual({ name: 'Ada', 'address.city': 'NYC', 'address.zip': '10001' })
    await form.handleSubmit()
    expect(submitted[0]).toEqual({ name: 'Ada', 'address.city': 'NYC', 'address.zip': '10001' })
    // Opt in to a nested payload at the backend boundary.
    expect(nestValues(form.values())).toEqual({
      name: 'Ada',
      address: { city: 'NYC', zip: '10001' },
    })
  })
})

describe('dot-path leaf fields — per-field validators route to the leaf', () => {
  it('surfaces a leaf error on the leaf field, not the ancestor', async () => {
    const form = useForm<DotForm>({
      initialValues: { name: 'x', 'address.city': '', 'address.zip': '' },
      validators: {
        'address.city': (v) => (v ? undefined : 'City is required'),
        'address.zip': (v, all) =>
          /^\d{5}$/.test(v) ? undefined : `Bad zip for ${(all as DotForm).name}`,
      },
      onSubmit: () => {},
    })
    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(form.fields['address.city'].error()).toBe('City is required')
    // cross-field access sees the flat all-values record
    expect(form.fields['address.zip'].error()).toBe('Bad zip for x')
    // errors() is keyed by the flat dot-path field names
    expect(form.errors()).toEqual({
      'address.city': 'City is required',
      'address.zip': 'Bad zip for x',
    })
  })
})

describe('dot-path leaf fields — flat-keyed schema routes to the leaf (B1 leaf fix)', () => {
  it('routes the leaf error to the leaf field and does NOT set a spurious submitError', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = useForm<DotForm>({
      initialValues: { name: 'x', 'address.city': '', 'address.zip': '00000' },
      schema: ((v: Record<string, unknown>) =>
        v['address.city'] ? {} : { 'address.city': 'City is required' }) as never,
      onSubmit: () => {},
    })
    const valid = await form.validate()
    expect(valid).toBe(false)
    // routes to the LEAF field
    expect(form.fields['address.city'].error()).toBe('City is required')
    // BUG FIX: `address.city` is an exact field, so orphan detection must NOT
    // flag it — no spurious submitError, no "matches no field" warning.
    expect(form.submitError()).toBeUndefined()
    const orphanWarned = warn.mock.calls.some((c) =>
      String(c[0]).includes('match no registered field'),
    )
    expect(orphanWarned).toBe(false)
    warn.mockRestore()
  })

  it('a genuinely-unmatched schema key is STILL flagged as orphan (no regression)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = useForm<DotForm>({
      initialValues: { name: '', 'address.city': '', 'address.zip': '' },
      schema: (() => ({ 'billing.zip': 'Bad' })) as never,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    expect(String(form.submitError())).toContain('billing.zip')
    warn.mockRestore()
  })

  it('does not call onSubmit while a leaf schema error exists', async () => {
    const onSubmit = vi.fn()
    const form = useForm<DotForm>({
      initialValues: { name: 'x', 'address.city': '', 'address.zip': '00000' },
      schema: ((v: Record<string, unknown>) =>
        v['address.city'] ? {} : { 'address.city': 'City is required' }) as never,
      onSubmit,
    })
    await form.handleSubmit()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('dot-path leaf fields — blur + trigger route to the leaf', () => {
  it('blur runs a leaf per-field validator', async () => {
    const form = useForm<DotForm>({
      initialValues: { name: '', 'address.city': '', 'address.zip': '' },
      validateOn: 'blur',
      validators: { 'address.city': (v) => (v ? undefined : 'City is required') },
      onSubmit: () => {},
    })
    form.fields['address.city'].setTouched()
    await Promise.resolve()
    await Promise.resolve()
    expect(form.fields['address.city'].error()).toBe('City is required')
  })

  it('trigger(leaf) validates just the leaf field', async () => {
    const form = useForm<DotForm>({
      initialValues: { name: '', 'address.city': '', 'address.zip': '' },
      validators: {
        'address.city': (v) => (v ? undefined : 'City is required'),
        name: (v) => (v ? undefined : 'Name is required'),
      },
      onSubmit: () => {},
    })
    const ok = await form.trigger('address.city')
    expect(ok).toBe(false)
    expect(form.fields['address.city'].error()).toBe('City is required')
    // trigger of only the leaf must NOT validate `name`
    expect(form.fields.name.error()).toBeUndefined()
  })
})

describe('dot-path leaf fields — reset / registerField', () => {
  it('reset(values) re-bases a leaf field durably', () => {
    const form = useForm<DotForm>({
      initialValues: { name: '', 'address.city': '', 'address.zip': '' },
      onSubmit: () => {},
    })
    form.setFieldValue('address.city', 'LA')
    expect(form.fields['address.city'].dirty()).toBe(true)
    form.reset({ 'address.city': 'LA' } as Partial<DotForm>)
    // 'LA' is now the baseline → not dirty
    expect(form.fields['address.city'].dirty()).toBe(false)
    expect(form.getValues('address.city')).toBe('LA')
  })

  it('registerField can add a dot-path leaf field at runtime', () => {
    const form = useForm<Record<string, unknown>>({
      initialValues: { name: '' },
      onSubmit: () => {},
    })
    form.registerField('contact.email', '')
    expect(form.fields['contact.email']).toBeDefined()
    form.setFieldValue('contact.email', 'a@b.com')
    expect(form.values()).toEqual({ name: '', 'contact.email': 'a@b.com' })
  })
})

describe('dot-path leaf fields — ambiguity dev-warn', () => {
  it('warns when both an object field and a leaf under it are declared', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useForm<Record<string, unknown>>({
      initialValues: { address: { city: '' }, 'address.city': '' },
      onSubmit: () => {},
    })
    const conflicted = warn.mock.calls.some((c) => String(c[0]).includes('Ambiguous field'))
    expect(conflicted).toBe(true)
    warn.mockRestore()
  })

  it('does NOT warn for sibling leaf fields', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useForm<DotForm>({
      initialValues: { name: '', 'address.city': '', 'address.zip': '' },
      onSubmit: () => {},
    })
    const conflicted = warn.mock.calls.some((c) => String(c[0]).includes('Ambiguous field'))
    expect(conflicted).toBe(false)
    warn.mockRestore()
  })
})
