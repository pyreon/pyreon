import { afterEach, describe, expect, it } from 'vitest'
import { useForm } from '../use-form'

// P3 — accessible error recovery: on a failed submit, focus moves to the first
// errored + registered field (react-hook-form's `shouldFocusError`, default on).

function mountInput(id: string): HTMLInputElement {
  const el = document.createElement('input')
  el.id = id
  document.body.appendChild(el)
  return el
}

describe('useForm — focus-first-error (P3)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('focuses the first errored+registered field on failed submit', async () => {
    const form = useForm<{ email: string; name: string }>({
      initialValues: { email: '', name: '' },
      validators: { email: () => 'Required', name: () => 'Required' },
      onSubmit: () => {},
    })
    const emailEl = mountInput(form.register('email').id)
    mountInput(form.register('name').id)
    await form.handleSubmit()
    expect(document.activeElement).toBe(emailEl)
  })

  it('focuses the FIRST field WITH an error (skips valid earlier fields)', async () => {
    const form = useForm<{ email: string; name: string }>({
      initialValues: { email: 'a@b.com', name: '' },
      validators: {
        email: (v) => (v ? undefined : 'Required'),
        name: () => 'Required',
      },
      onSubmit: () => {},
    })
    mountInput(form.register('email').id)
    const nameEl = mountInput(form.register('name').id)
    await form.handleSubmit()
    expect(document.activeElement).toBe(nameEl)
  })

  it('does NOT focus when focusOnError: false', async () => {
    const form = useForm<{ email: string }>({
      initialValues: { email: '' },
      validators: { email: () => 'Required' },
      focusOnError: false,
      onSubmit: () => {},
    })
    const emailEl = mountInput(form.register('email').id)
    emailEl.blur()
    await form.handleSubmit()
    expect(document.activeElement).not.toBe(emailEl)
  })

  it('exposes focusFirstError() for manual use', async () => {
    const form = useForm<{ email: string }>({
      initialValues: { email: '' },
      validators: { email: () => 'Required' },
      focusOnError: false,
      onSubmit: () => {},
    })
    const emailEl = mountInput(form.register('email').id)
    await form.validate()
    form.focusFirstError()
    expect(document.activeElement).toBe(emailEl)
  })

  it('skips an errored field that was never register()ed — no throw, no focus', async () => {
    const form = useForm<{ email: string }>({
      initialValues: { email: '' },
      validators: { email: () => 'Required' },
      onSubmit: () => {},
    })
    // No register() → no known id → nothing to focus, must not throw.
    await expect(form.handleSubmit()).resolves.toBeUndefined()
  })

  it('does not focus on a successful submit', async () => {
    const form = useForm<{ email: string }>({
      initialValues: { email: 'a@b.com' },
      validators: { email: (v) => (v ? undefined : 'Required') },
      onSubmit: () => {},
    })
    const emailEl = mountInput(form.register('email').id)
    emailEl.blur()
    await form.handleSubmit()
    expect(document.activeElement).not.toBe(emailEl)
  })
})
