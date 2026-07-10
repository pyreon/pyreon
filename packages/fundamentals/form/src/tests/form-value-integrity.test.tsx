/**
 * Release-audit value-integrity defects (stacked on the field-lookup PR).
 *
 * Four verified defects, each reproduced here BEFORE the fix landed:
 *
 *  1. SILENT SCHEMA BYPASS — `resolveSchemaValidator` returned `undefined`
 *     for an unrecognized non-null `schema` (a zod<3.24 schema without
 *     `~standard`, or a typo'd object), so the form silently skipped ALL
 *     validation: `validate()` → true, `errors()` → {}, onSubmit FIRED.
 *     `@pyreon/store` THROWS for the identical input (`extractParseFn`).
 *     Contract: unrecognized non-null schema throws `[Pyreon]` guidance.
 *
 *  2. NON-DURABLE reset(values) BASELINE — per-field closures captured the
 *     ORIGINAL `initial`: the setValue dirty-compare and `field.reset()`
 *     ignored the `currentInitials` moved by `reset(values)` /
 *     `setInitialValues`. After `reset({ name: 'saved' })`, typing 'x' then
 *     back to 'saved' reported dirty forever; `resetField` and a later plain
 *     `reset()` reverted to the ORIGINAL initial — diverging from the
 *     react-hook-form defaultValues-replacement parity the API claims.
 *     Contract: ONE baseline source of truth (`currentInitials`).
 *
 *  3. NULL/UNDEFINED VALUES SWALLOWED — `values()` / the submit payload used
 *     `fields[name]?.value.peek() ?? initials[name]`, so a field explicitly
 *     set to `null` (a cleared `FileList | null` file field) silently
 *     reported the stale INITIAL. Contract: branch on FIELD EXISTENCE, never
 *     on value nullishness.
 *
 *  4. DYNAMIC-FIELD VERSION COLLISION — `registerField` seeded
 *     `validationVersions[name]` at 0; an unregister + re-register of the
 *     same name restarted the version space, so a still-in-flight OLD async
 *     validator whose captured version collided wrote its stale error onto
 *     the FRESH field. Contract: versions come from a monotonic form-level
 *     counter — a version value is never reused.
 *
 * Bisect: revert any one fix → its describe block fails with the pre-fix
 * behavior asserted in each spec's comment.
 */
import { describe, expect, it } from 'vitest'
import { resolveSchemaValidator, useForm } from '../use-form'

// ─── Defect 1: unrecognized schema must THROW, not silently skip ────────────

describe('schema resolution — unrecognized schema throws instead of silently skipping validation', () => {
  it('useForm({ schema: <non-conforming object> }) throws [Pyreon] guidance (pre-fix: validate() → true, onSubmit fired)', () => {
    expect(() =>
      useForm<{ name: string }>({
        initialValues: { name: '' },
        // A zod<3.24-shaped object: has safeParse but NO `~standard` — the
        // audit's proven silent-bypass input.
        schema: { safeParse: (x: unknown) => x } as never,
        onSubmit: () => {},
      }),
    ).toThrowError(
      /\[Pyreon\] `schema` must be a SchemaValidateFn, a TypedSchemaAdapter.*@pyreon\/validation.*Standard Schema.*zod 3\.24\+.*standardschema\.dev/s,
    )
  })

  it('resolveSchemaValidator throws for non-object non-function values too (schema: 5)', () => {
    expect(() => resolveSchemaValidator(5)).toThrowError(/\[Pyreon\] `schema` must be/)
  })

  it('a plain function stays accepted as SchemaValidateFn', async () => {
    const form = useForm<{ name: string }>({
      initialValues: { name: '' },
      schema: (values) => (values.name === '' ? { name: 'Required' } : {}),
      onSubmit: () => {},
    })
    expect(await form.validate()).toBe(false)
    expect(form.errors().name).toBe('Required')
  })

  it('absent / undefined / null schema stays fine (no schema configured)', async () => {
    const noSchema = useForm<{ name: string }>({ initialValues: { name: '' }, onSubmit: () => {} })
    expect(await noSchema.validate()).toBe(true)
    expect(resolveSchemaValidator(undefined)).toBeUndefined()
    expect(resolveSchemaValidator(null)).toBeUndefined()
  })
})

// ─── Defect 2: reset(values) baseline must be DURABLE ───────────────────────

describe('reset(values) — the new baseline is durable (one source of truth)', () => {
  it('dirty compare uses the NEW baseline: edit then revert-to-saved → isDirty false (pre-fix: true forever)', () => {
    const form = useForm<{ name: string }>({
      initialValues: { name: 'orig' },
      onSubmit: () => {},
    })
    form.reset({ name: 'saved' })
    expect(form.isDirty()).toBe(false)
    form.setFieldValue('name', 'x')
    expect(form.isDirty()).toBe(true)
    form.setFieldValue('name', 'saved') // back to the NEW baseline
    expect(form.fields.name.dirty()).toBe(false)
    expect(form.isDirty()).toBe(false)
  })

  it('resetField() reverts to the NEW baseline, not the original initial (pre-fix: "orig")', () => {
    const form = useForm<{ name: string }>({
      initialValues: { name: 'orig' },
      onSubmit: () => {},
    })
    form.reset({ name: 'saved' })
    form.setFieldValue('name', 'x')
    form.resetField('name')
    expect(form.getValues('name')).toBe('saved')
    expect(form.values().name).toBe('saved')
  })

  it('a later plain reset() reverts to the NEW baseline (react-hook-form defaultValues-replacement parity; pre-fix: "orig")', () => {
    const form = useForm<{ name: string }>({
      initialValues: { name: 'orig' },
      onSubmit: () => {},
    })
    form.reset({ name: 'saved' })
    form.setFieldValue('name', 'x')
    form.reset()
    expect(form.getValues('name')).toBe('saved')
    expect(form.isDirty()).toBe(false)
  })

  it('setInitialValues moves the baseline for the dirty compare too (same mechanism)', () => {
    const form = useForm<{ name: string }>({
      initialValues: { name: 'orig' },
      onSubmit: () => {},
    })
    form.setInitialValues({ name: 'server' })
    form.setFieldValue('name', 'typed')
    expect(form.isDirty()).toBe(true)
    form.setFieldValue('name', 'server')
    expect(form.isDirty()).toBe(false)
  })

  it('_dirtyCount stays consistent across baseline moves: edit → revert → re-edit → reset settles at 0', () => {
    const form = useForm<{ name: string; age: number }>({
      initialValues: { name: 'orig', age: 1 },
      onSubmit: () => {},
    })
    form.setFieldValue('name', 'x') // dirty vs orig
    expect(form.isDirty()).toBe(true)
    form.reset({ name: 'saved' }) // baseline moves; age reverts to 1
    expect(form.isDirty()).toBe(false)
    form.setFieldValue('name', 'x')
    form.setFieldValue('age', 2)
    expect(form.dirtyFields()).toEqual({ name: true, age: true })
    form.setFieldValue('name', 'saved') // revert to NEW baseline
    form.setFieldValue('age', 1) // revert to (unchanged) baseline
    expect(form.dirtyFields()).toEqual({})
    expect(form.isDirty()).toBe(false)
    form.setFieldValue('name', 'y')
    expect(form.isDirty()).toBe(true)
    form.reset()
    expect(form.isDirty()).toBe(false)
    expect(form.getValues()).toEqual({ name: 'saved', age: 1 })
  })

  it('reset(partial): unnamed fields still revert to their own (unmoved) baseline', () => {
    const form = useForm<{ a: string; b: string }>({
      initialValues: { a: 'a0', b: 'b0' },
      onSubmit: () => {},
    })
    form.setFieldValue('a', 'aX')
    form.setFieldValue('b', 'bX')
    form.reset({ a: 'a1' })
    expect(form.getValues()).toEqual({ a: 'a1', b: 'b0' })
    expect(form.isDirty()).toBe(false)
  })
})

// ─── Defect 3: null/undefined are first-class values ────────────────────────

describe('values()/submit — null/undefined field values are not swallowed by the initial', () => {
  it('values() reports null after setFieldValue(field, null) (pre-fix: stale initial 30)', () => {
    const form = useForm<{ age: number | null }>({
      initialValues: { age: 30 },
      onSubmit: () => {},
    })
    form.setFieldValue('age', null)
    expect(form.values().age).toBeNull()
    expect(form.getValues().age).toBeNull()
  })

  it('the submit payload carries the null (the cleared file-field flow)', async () => {
    let payload: { file: string | null } | undefined
    const form = useForm<{ file: string | null }>({
      // stands in for a server-prefilled FileList
      initialValues: { file: 'server-file.png' },
      onSubmit: (v) => {
        payload = v
      },
    })
    form.setFieldValue('file', null)
    await form.handleSubmit()
    expect(payload).toBeDefined()
    expect(payload!.file).toBeNull()
  })

  it('undefined is preserved too', () => {
    const form = useForm<{ note: string | undefined }>({
      initialValues: { note: 'seed' },
      onSubmit: () => {},
    })
    form.setFieldValue('note', undefined)
    expect(form.values().note).toBeUndefined()
    expect('note' in form.values()).toBe(true)
  })
})

// ─── Defect 4: re-register must not reuse the version space ─────────────────

describe('dynamic fields — unregister + re-register never reuses validation versions', () => {
  it('a stale in-flight validator from the OLD registration cannot write onto the FRESH field', async () => {
    const form = useForm<Record<string, unknown>>({
      initialValues: {},
      onSubmit: () => {},
    })

    // Old registration: async validator we resolve manually.
    let resolveOld: ((err: string) => void) | undefined
    form.registerField('tag', '', () => new Promise<string>((r) => (resolveOld = r)))

    // Start validation — captures the old field's current version.
    const p1 = form.validate()
    expect(resolveOld).toBeDefined()

    // Unregister + re-register the SAME name (fresh field, sync validator).
    form.unregisterField('tag')
    form.registerField('tag', '', () => undefined)

    // Fresh validation run on the new field — pre-fix this bumps the fresh
    // field's version to the SAME value the old run captured (both = 1).
    const p2 = form.validate()

    // NOW the old validator resolves with its stale error.
    resolveOld!('stale error from the old registration')
    await Promise.all([p1, p2])

    // Pre-fix: `errors()` → { tag: 'stale error from the old registration' }
    // (the stale write passed the `=== currentVersion` guard). Post-fix the
    // monotonic counter makes the old captured version unmatchable.
    expect(form.errors()).toEqual({})
    expect(form.fields.tag!.error.peek()).toBeUndefined()
  })

  it('seeding invariant: a re-registered field validates correctly with its own validator', async () => {
    const form = useForm<Record<string, unknown>>({
      initialValues: {},
      onSubmit: () => {},
    })
    form.registerField('tag', '', (v) => (v === '' ? 'Required' : undefined))
    expect(await form.validate()).toBe(false)
    form.unregisterField('tag')
    form.registerField('tag', 'filled', (v) => (v === '' ? 'Required' : undefined))
    expect(await form.validate()).toBe(true)
    form.setFieldValue('tag', '')
    expect(await form.validate()).toBe(false)
    expect(form.errors().tag).toBe('Required')
  })
})
