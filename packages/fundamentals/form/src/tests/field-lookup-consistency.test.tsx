/**
 * Unknown-field-name consistency across EVERY lookup API.
 *
 * Release-audit finding (0.41.1's error-message fix covered only 3 sites):
 * the same user mistake — an undeclared field name — produced five different
 * behaviors: useField/setFieldValue/setFieldError threw actionable guidance,
 * `register()` (the flagship binding API) crashed with a bare
 * `TypeError: … reading 'value'`, `useWatch` crashed bare, `trigger()` counted
 * the unknown field VALID (violating "matched no field must mean INVALID" —
 * the schema-error-routing principle), `getFieldState()` returned `undefined`
 * typed non-optional, and `setInitialValues`/`reset(values)` silently merged
 * typo keys into the baseline.
 *
 * The contract locked here:
 *  - binding/subscription APIs (register, useWatch, useField) THROW the
 *    actionable `[@pyreon/form]` guidance;
 *  - validity APIs treat unknown as INVALID (trigger → false + dev-warn);
 *  - probes stay probes (getFieldState → `undefined`, honestly typed);
 *  - baseline writes skip + dev-warn unknown keys (server payloads carry
 *    extra keys like `id` — throwing would break the documented
 *    reset-to-server-data flow; silent merge hid typos).
 *
 * Bisect: revert any one guard → its spec fails (bare TypeError instead of
 * the guidance / `true` instead of `false` / polluted baseline).
 */
import { describe, expect, it, vi } from 'vitest'
import { useField } from '../use-field'
import { useForm } from '../use-form'
import { useWatch } from '../use-watch'

function makeForm() {
  return useForm<{ title: string; count: number }>({
    initialValues: { title: 't0', count: 0 },
    onSubmit: () => {},
  })
}

describe('unknown-field consistency — binding APIs throw actionable guidance', () => {
  it('register("missing") throws the guidance, not a bare TypeError', () => {
    const form = makeForm()
    expect(() => form.register('missing' as never)).toThrowError(
      /\[@pyreon\/form\] register\("missing"\).*does not exist.*Available fields: title, count.*registerField\("missing"/s,
    )
  })

  it('useWatch(form, "missing") throws the guidance (single form)', () => {
    const form = makeForm()
    expect(() => useWatch(form, 'missing' as never)).toThrowError(
      /\[@pyreon\/form\] useWatch\("missing"\).*not found.*Available fields: title, count/s,
    )
  })

  it('useWatch(form, [known, missing]) throws the guidance (array form)', () => {
    const form = makeForm()
    expect(() => useWatch(form, ['title', 'missing'] as never)).toThrowError(
      /\[@pyreon\/form\] useWatch\("missing"\).*not found/s,
    )
  })

  it('useField message carries the full guidance (was asserted nowhere)', () => {
    const form = makeForm()
    expect(() => useField(form as never, 'missing' as never)).toThrowError(
      /\[@pyreon\/form\] useField\("missing"\).*not found.*Available fields: title, count.*does not auto-register/s,
    )
  })
})

describe('unknown-field consistency — validity means INVALID, probes stay probes', () => {
  it('trigger("missing") resolves FALSE (was: true = silently valid)', async () => {
    const form = makeForm()
    await expect(form.trigger('missing' as never)).resolves.toBe(false)
  })

  it('trigger(["title", "missing"]) resolves FALSE even when the known field is valid', async () => {
    const form = makeForm()
    await expect(form.trigger(['title', 'missing'] as never)).resolves.toBe(false)
    // The known-only set is still valid — the false above came from the
    // unknown name, not from `title`.
    await expect(form.trigger('title')).resolves.toBe(true)
  })

  it('trigger with an unknown name dev-warns naming it', async () => {
    const form = makeForm()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await form.trigger('missing' as never)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"missing"'))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('INVALID'))
    } finally {
      warn.mockRestore()
    }
  })

  it('getFieldState("missing") returns undefined (honest probe; typed | undefined)', () => {
    const form = makeForm()
    const missing = form.getFieldState('missing' as never)
    expect(missing).toBeUndefined()
    const known = form.getFieldState('title')
    expect(known).toBeDefined()
    expect(known!.value.peek()).toBe('t0')
  })
})

describe('unknown-key consistency — baseline writes skip + dev-warn', () => {
  it('setInitialValues with a typo key skips it (no baseline pollution) + dev-warns', () => {
    const form = makeForm()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      form.setInitialValues({ title: 'new', ghost: 'x' } as never)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"ghost"'))
      // The known key applied; the typo key never reaches values().
      expect(form.getValues()).toEqual({ title: 'new', count: 0 })
      expect('ghost' in (form.getValues() as Record<string, unknown>)).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })

  it('reset(values) with an extra server key still applies the known keys', () => {
    const form = makeForm()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      form.reset({ title: 'saved', id: 'row-9' } as never)
      expect(form.getValues('title')).toBe('saved')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('fields-array overload accepts focusOnError (was TS2769)', () => {
  it('typechecks and runs with focusOnError: false', async () => {
    const { field } = await import('../field')
    const title = field('title', '')
    const form = useForm({
      fields: [title],
      onSubmit: () => {},
      focusOnError: false,
    })
    expect(form.getValues('title')).toBe('')
  })
})
