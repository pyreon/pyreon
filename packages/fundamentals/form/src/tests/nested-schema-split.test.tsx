import { s } from '@pyreon/validate'
import { describe, expect, it, vi } from 'vitest'
import { matchSchemaErrorForField, useForm } from '../use-form'

// Auto-splitting a NESTED schema's per-leaf-path errors to registered dot-path
// LEAF fields — the runtime residual left by #2209 (first-class dot-path leaf
// fields). A DECLARATIVE schema over a dot-path-leaf form receives the NESTED
// value shape (rebuilt from the flat value model), so a real zod/valibot/`s`
// nested schema validates correctly, and its `address.city`-keyed errors route
// to the LEAF field `address.city` (preferred), else to the nearest registered
// ANCESTOR object field (`address`), else are flagged as orphans (never
// silently dropped). See .claude/rules/anti-patterns.md schema-error-routing.
//
// The `schema: … as never` cast is the honest acknowledgement that typed
// deep-path inference (`NestValues<T>`) is DEFERRED (#2209): the schema is
// authored against the nested domain shape while `useForm<TValues>` types the
// flat value model — the two shapes deliberately don't line up at the type
// level yet. Runtime routing is fully wired.

type DotForm = {
  name: string
  'address.city': string
  'address.zip': string
}

describe('nested schema auto-split — leaf preference', () => {
  it('routes a real nested `s` schema error to the registered LEAF field, not the ancestor', async () => {
    const form = useForm<DotForm>({
      initialValues: { name: 'x', 'address.city': '', 'address.zip': '10001' },
      schema: s.object({
        name: s.string(),
        address: s.object({ city: s.string().min(1), zip: s.string() }),
      }) as never,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    // The nested schema's `address.city` error lands on the LEAF field …
    expect(form.errors()['address.city']).toBe('Must be at least 1 characters')
    // … NOT on the top-level ancestor `address` (there is no such field, and it
    // must not appear as a spurious key either).
    expect((form.errors() as Record<string, unknown>)['address']).toBeUndefined()
    // No orphan: `address.city` is an exact leaf field, so no submitError.
    expect(form.submitError()).toBeUndefined()
  })

  it('does not call onSubmit while a nested-schema leaf error exists', async () => {
    const onSubmit = vi.fn()
    const form = useForm<DotForm>({
      initialValues: { name: 'x', 'address.city': '', 'address.zip': '10001' },
      schema: s.object({
        name: s.string(),
        address: s.object({ city: s.string().min(1), zip: s.string() }),
      }) as never,
      onSubmit,
    })
    await form.handleSubmit()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('a valid nested payload passes and calls onSubmit with the FLAT values', async () => {
    const submitted: unknown[] = []
    const form = useForm<DotForm>({
      initialValues: { name: 'x', 'address.city': 'NYC', 'address.zip': '10001' },
      schema: s.object({
        name: s.string(),
        address: s.object({ city: s.string().min(1), zip: s.string().min(1) }),
      }) as never,
      onSubmit: (v) => {
        submitted.push(v)
      },
    })
    expect(await form.validate()).toBe(true)
    await form.handleSubmit()
    // The value model stays FLAT end-to-end — onSubmit sees flat dot-path keys.
    expect(submitted[0]).toEqual({ name: 'x', 'address.city': 'NYC', 'address.zip': '10001' })
  })
})

describe('nested schema auto-split — ancestor fallback (object field)', () => {
  it('routes a nested error to the ancestor object field when only the ancestor is registered', async () => {
    const form = useForm<{ address: { city: string } }>({
      initialValues: { address: { city: '' } },
      schema: s.object({ address: s.object({ city: s.string().min(1) }) }) as never,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    // Only the OBJECT field `address` is registered → the nested `address.city`
    // error surfaces on its ancestor (the documented fallback, preserved).
    const errs = form.errors() as Record<string, unknown>
    expect(errs['address']).toBe('Must be at least 1 characters')
    // The flat model has no `address.city` field → no leaf key.
    expect(errs['address.city']).toBeUndefined()
  })
})

describe('nested schema auto-split — orphan (unmatched key still surfaces)', () => {
  it('flags a nested-schema key matching NO field as an orphan (form invalid + submitError)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = useForm<DotForm>({
      initialValues: { name: 'x', 'address.city': 'NYC', 'address.zip': '10001' },
      // `billing` has no matching field — the nested schema errors on it and it
      // must NOT be silently dropped.
      schema: s.object({
        name: s.string(),
        address: s.object({ city: s.string(), zip: s.string() }),
        billing: s.object({ zip: s.string().min(1) }),
      }) as never,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    expect(String(form.submitError())).toContain('billing')
    warn.mockRestore()
  })
})

describe('nested schema auto-split — tie-break: leaf wins over ancestor (both registered)', () => {
  it('routes an `address.city` error to the LEAF, never the object ancestor, when BOTH are registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = useForm<Record<string, unknown>>({
      // Both an object field `address` AND a dot-path leaf `address.city` are
      // declared (the ambiguity case — dev-warns). A plain-function schema
      // returns the flat `address.city` key directly, isolating the ROUTING
      // tie-break from the nesting transform.
      initialValues: { address: { city: '' }, 'address.city': '' },
      schema: (() => ({ 'address.city': 'City is required' })) as never,
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    // The more-specific LEAF field claims the error …
    expect(form.errors()['address.city']).toBe('City is required')
    // … and the object ancestor does NOT double-claim it (the leaf-preference
    // tie-break; the bisect target).
    expect(form.errors()['address']).toBeUndefined()
    warn.mockRestore()
  })
})

describe('matchSchemaErrorForField — leaf-preference tie-break (pure, 3-arg)', () => {
  it('an ancestor field does NOT claim a key owned by a registered leaf field', () => {
    const errs = { 'address.city': 'req' }
    const names = new Set(['address', 'address.city'])
    // The object field `address` no longer claims `address.city` …
    expect(matchSchemaErrorForField(errs, 'address', names)).toBeUndefined()
    // … the leaf field claims it exactly.
    expect(matchSchemaErrorForField(errs, 'address.city', names)).toBe('req')
  })

  it('the ancestor still claims a nested key when no leaf field owns it', () => {
    const errs = { 'address.city': 'req' }
    const names = new Set(['address'])
    expect(matchSchemaErrorForField(errs, 'address', names)).toBe('req')
  })

  it('the deepest registered object ancestor wins for a deep key', () => {
    const errs = { 'a.b.c': 'x' }
    const names = new Set(['a', 'a.b'])
    // `a` must not claim `a.b.c` — the closer object field `a.b` owns it.
    expect(matchSchemaErrorForField(errs, 'a', names)).toBeUndefined()
    expect(matchSchemaErrorForField(errs, 'a.b', names)).toBe('x')
  })

  it('omitting fieldNames keeps the legacy first-nested-key behavior', () => {
    // The 2-arg form (used by the existing pure tests) is unchanged.
    expect(matchSchemaErrorForField({ 'address.city': 'req' }, 'address')).toBe('req')
  })
})
