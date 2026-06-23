// DOM-level proof for form ARIA auto-wiring. The node `a11y-autowire.test.ts`
// checks the `register()` accessor VALUES; this mounts the real consumer shape
// — `<input {...register()}>` + `<label {...labelProps()}>` + a conditionally-
// rendered `<span {...errorProps()}>` — and asserts the LIVE element attributes
// update reactively (mount ≠ works). Spread goes through the compiler's
// `_applyProps`, which renderEffect-wraps the function-valued aria-* accessors.
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { useForm } from '../use-form'
import type { FormState } from '../types'

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

describe('form a11y auto-wiring — rendered DOM', () => {
  it('label↔input + input↔error associate, and aria-invalid toggles reactively', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    let form!: FormState<{ email: string }>
    function App() {
      // No validators/validateOn — drive error state directly via
      // setFieldError/clearErrors so the test isolates the ARIA wiring from
      // validation timing (validateOn:'change' would auto-error the empty
      // required field on mount, which is correct but a different concern).
      form = useForm({ initialValues: { email: '' }, onSubmit: () => {} })
      return (
        <div>
          <label {...form.labelProps('email')} data-testid="label">
            Email
          </label>
          <input {...form.register('email')} data-testid="input" />
          {() =>
            form.fields.email.error() ? (
              <span {...form.errorProps('email')} data-testid="err">
                {form.fields.email.error()}
              </span>
            ) : null
          }
        </div>
      )
    }
    const dispose = mount(h(App, {}), c)
    await flush()

    const input = c.querySelector('[data-testid=input]')!
    const label = c.querySelector('[data-testid=label]')!

    // Auto id + label association.
    expect(input.getAttribute('id')).toBeTruthy()
    expect(label.getAttribute('for')).toBe(input.getAttribute('id'))

    // Valid → no aria-invalid / aria-describedby attributes.
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(input.getAttribute('aria-describedby')).toBeNull()

    // Error it → input flips invalid + links to the error element.
    form.setFieldError('email', 'Required')
    await flush()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const err = c.querySelector('[data-testid=err]')!
    expect(err).toBeTruthy()
    expect(err.getAttribute('role')).toBe('alert')
    expect(input.getAttribute('aria-describedby')).toBe(err.getAttribute('id'))

    // Clear → attributes removed (no dangling reference).
    form.clearErrors()
    await flush()
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(input.getAttribute('aria-describedby')).toBeNull()

    if (typeof dispose === 'function') dispose()
    c.remove()
  })
})
