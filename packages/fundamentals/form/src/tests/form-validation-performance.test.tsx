/**
 * Performance test for form validation strategies.
 * Demonstrates impact of different validation approaches on response time.
 */
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it, vi } from 'vitest'
import { useForm } from '../use-form'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return {
    result: result!,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Form validation performance', () => {
  it('blur validation does not run on every keystroke', async () => {
    const validatorFn = vi.fn(() => undefined)

    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { email: '', password: '' },
        validators: {
          email: validatorFn,
        },
        validateOn: 'blur',
        onSubmit: () => {},
      }),
    )

    // Change field multiple times
    form.fields.email.setValue('a')
    form.fields.email.setValue('ab')
    form.fields.email.setValue('abc')
    form.fields.email.setValue('test@example.com')

    // Validator should NOT be called (no blur event)
    expect(validatorFn).not.toHaveBeenCalled()

    // Only on blur should it validate
    form.fields.email.setTouched()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(validatorFn).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('change validation with debounce batches multiple changes', async () => {
    vi.useFakeTimers()
    try {
      const validatorFn = vi.fn(() => undefined)

      const { result: form, unmount } = mountWith(() =>
        useForm({
          initialValues: { email: '', password: '' },
          validators: {
            email: validatorFn,
          },
          validateOn: 'change',
          debounceMs: 100,
          onSubmit: () => {},
        }),
      )

      // Rapid changes (simulating typing)
      form.fields.email.setValue('t')
      form.fields.email.setValue('te')
      form.fields.email.setValue('tes')
      form.fields.email.setValue('test')

      // No validator call yet (still in debounce window)
      expect(validatorFn).not.toHaveBeenCalled()

      // Advance time past debounce
      await vi.advanceTimersByTimeAsync(150)

      // Should be called exactly once (batched)
      expect(validatorFn).toHaveBeenCalledTimes(1)

      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('change validation without debounce runs on every keystroke (slow)', async () => {
    vi.useFakeTimers()
    try {
      const validatorFn = vi.fn(() => undefined)

      const { result: form, unmount } = mountWith(() =>
        useForm({
          initialValues: { email: '' },
          validators: {
            email: validatorFn,
          },
          validateOn: 'change',
          debounceMs: undefined,
          onSubmit: () => {},
        }),
      )

      // Reset call count (initial setup might trigger one call)
      validatorFn.mockClear()

      // Changes without debounce
      form.fields.email.setValue('t')
      form.fields.email.setValue('te')
      form.fields.email.setValue('tes')
      form.fields.email.setValue('test')

      // Each keystroke triggers validator (4 times)
      expect(validatorFn).toHaveBeenCalledTimes(4)

      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('validates only changed field, not all fields', async () => {
    const emailValidator = vi.fn(() => undefined)
    const passwordValidator = vi.fn(() => undefined)

    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { email: '', password: '' },
        validators: {
          email: emailValidator,
          password: passwordValidator,
        },
        validateOn: 'blur',
        onSubmit: () => {},
      }),
    )

    // Change email and blur
    form.fields.email.setValue('test@example.com')
    form.fields.email.setTouched()

    await new Promise((resolve) => setTimeout(resolve, 50))

    // Only email validator should run, not password
    expect(emailValidator).toHaveBeenCalledTimes(1)
    expect(passwordValidator).not.toHaveBeenCalled()

    unmount()
  })
})
