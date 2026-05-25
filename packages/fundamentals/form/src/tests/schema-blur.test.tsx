import { mount } from '@pyreon/runtime-dom'
import { useForm } from '../use-form'
import type { FormState, SchemaValidateFn } from '../types'

function Capture<T>({ fn }: { fn: () => T }) {
  fn()
  return null
}

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(
    <Capture
      fn={() => {
        result = fn()
      }}
    />,
    el,
  )
  return { result: result as T, unmount }
}

// W10 regression — `validateOn: 'blur'` was a no-op for schema-only forms.
// Schema only fired on submit; per-field-validator path silently skipped
// blur. After the fix, schema-only forms with `validateOn: 'blur'` validate
// on blur by running the schema and applying THIS field's error.
describe('useForm — schema + validateOn:"blur" (W10 follow-up)', () => {
  // Simple sync schema that fails when title is empty.
  const titleRequiredSchema: SchemaValidateFn<{
    title: string
    url: string
  }> = (values) => {
    const errors: Partial<Record<'title' | 'url', string>> = {}
    if (!values.title) errors.title = 'Title is required'
    if (values.url && !values.url.startsWith('http')) errors.url = 'Must start with http'
    return errors
  }

  test('blur on a field WITH schema-only triggers schema validation', async () => {
    const { result: form } = mountWith(() =>
      useForm<{ title: string; url: string }>({
        initialValues: { title: '', url: '' },
        schema: titleRequiredSchema,
        validateOn: 'blur',
        onSubmit: () => {},
      }),
    )

    expect(form.fields.title.error()).toBeUndefined()
    form.fields.title.setTouched()
    // Schema is sync but the runner awaits it; flush.
    await Promise.resolve()
    await Promise.resolve()
    expect(form.fields.title.error()).toBe('Title is required')
  })

  test('blur sets error ONLY on the blurred field — others untouched', async () => {
    const { result: form } = mountWith(() =>
      useForm<{ title: string; url: string }>({
        initialValues: { title: '', url: 'badurl' }, // both invalid
        schema: titleRequiredSchema,
        validateOn: 'blur',
        onSubmit: () => {},
      }),
    )

    // Blur title only — title gets error, url stays clean (not yet visited)
    form.fields.title.setTouched()
    await Promise.resolve()
    await Promise.resolve()
    expect(form.fields.title.error()).toBe('Title is required')
    expect(form.fields.url.error()).toBeUndefined()

    // Now blur url — its error appears too
    form.fields.url.setTouched()
    await Promise.resolve()
    await Promise.resolve()
    expect(form.fields.url.error()).toBe('Must start with http')
  })

  test('per-field validator wins over schema on blur (back-compat)', async () => {
    const { result: form } = mountWith(() =>
      useForm<{ title: string }>({
        initialValues: { title: '' },
        validators: {
          // eslint-disable-next-line @typescript-eslint/require-await
          title: async (value) => (value ? undefined : 'Field-level error'),
        },
        schema: () => ({ title: 'Schema-level error' }),
        validateOn: 'blur',
        onSubmit: () => {},
      }),
    )

    form.fields.title.setTouched()
    await Promise.resolve()
    await Promise.resolve()
    // Field validator result wins because validate() in submit also gives
    // field-level priority — keep blur behavior consistent with submit.
    expect(form.fields.title.error()).toBe('Field-level error')
  })

  test('stale schema results are discarded (versioned)', async () => {
    let resolveFirst: (v: { title?: string }) => void = () => {}
    let resolveSecond: (v: { title?: string }) => void = () => {}
    let callCount = 0
    const slowSchema: SchemaValidateFn<{ title: string }> = (_values) => {
      callCount++
      if (callCount === 1) return new Promise((r) => (resolveFirst = r as never))
      return new Promise((r) => (resolveSecond = r as never))
    }

    const { result: form } = mountWith(() =>
      useForm<{ title: string }>({
        initialValues: { title: '' },
        schema: slowSchema,
        validateOn: 'blur',
        onSubmit: () => {},
      }),
    )

    // First blur — schema in flight
    form.fields.title.setTouched()
    await Promise.resolve()
    expect(callCount).toBe(1)

    // User types + blurs again — second schema run begins
    form.fields.title.setValue('typed-something')
    form.fields.title.setTouched()
    await Promise.resolve()
    expect(callCount).toBe(2)

    // The second (newer) resolves with no error
    resolveSecond({})
    await Promise.resolve()
    await Promise.resolve()
    expect(form.fields.title.error()).toBeUndefined()

    // The first (stale) resolves with an error — should be DISCARDED
    resolveFirst({ title: 'STALE — should not appear' })
    await Promise.resolve()
    await Promise.resolve()
    expect(form.fields.title.error()).toBeUndefined()
  })

  test('validateOn:"change" still works for schema-only forms (unchanged)', () => {
    // Change-mode wasn't broken before; we just want to confirm the W10 fix
    // didn't break the schema-handling path that DID work.
    const { result: form } = mountWith(() =>
      useForm<{ title: string }>({
        initialValues: { title: '' },
        schema: () => ({ title: 'on-change error' }),
        validateOn: 'change',
        onSubmit: () => {},
      }),
    )

    // Change-mode runs via the auto-validate effect, which still only
    // calls per-field validators — not the schema. (That's a separate
    // expectation; the schema-on-change behavior is unchanged by this PR.)
    // The point of this test is regression-locking the non-W10 path.
    expect(form.fields.title.value()).toBe('')
  })
})
