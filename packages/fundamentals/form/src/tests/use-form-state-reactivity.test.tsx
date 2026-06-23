// Regression: a no-selector `useFormState(form)` read in the rendered DOM must
// update reactively. The `_invalidCount`/`_dirtyCount` count signals are
// updated by a DEFERRED field-signal subscriber, so the no-selector summary —
// which also depends on the field signals via the errors/dirtyFields atoms —
// used to re-derive on the field-signal change BEFORE the count caught up,
// rendering a stale isValid/isDirty (the FormDemo "Dirty"/"Invalid" badge
// never flipping). The fix derives isValid/isDirty from the field atoms (same
// dep), not the late counts. These mount specs lock that the DOM updates.
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { useForm } from '../use-form'
import { useFormState } from '../use-form-state'
import type { FormState } from '../types'

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

describe('useFormState no-selector — reactive in the rendered DOM', () => {
  it('isDirty flips Pristine → Dirty when a field changes', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    let form: FormState<{ a: string }>
    function App() {
      form = useForm({ initialValues: { a: '' }, onSubmit: () => {} })
      const state = useFormState(form)
      return h('span', { 'data-testid': 'd' }, () => (state().isDirty ? 'Dirty' : 'Pristine'))
    }
    const dispose = mount(h(App, {}), c)
    await flush()
    const span = c.querySelector('[data-testid=d]')!
    expect(span.textContent).toBe('Pristine')
    form!.setFieldValue('a', 'x')
    await flush()
    expect(span.textContent).toBe('Dirty') // was stuck at 'Pristine' before the fix
    if (typeof dispose === 'function') dispose()
    c.remove()
  })

  it('isValid flips when an error appears/clears', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    let form: FormState<{ a: string }>
    function App() {
      form = useForm({
        initialValues: { a: '' },
        validators: { a: (v) => (v ? undefined : 'Required') },
        onSubmit: () => {},
      })
      const state = useFormState(form)
      return h('span', { 'data-testid': 'v' }, () => (state().isValid ? 'Valid' : 'Invalid'))
    }
    const dispose = mount(h(App, {}), c)
    await flush()
    expect(c.querySelector('[data-testid=v]')!.textContent).toBe('Valid')
    await form!.validate() // empty 'a' → error → invalid
    await flush()
    expect(c.querySelector('[data-testid=v]')!.textContent).toBe('Invalid')
    form!.setFieldValue('a', 'ok')
    await form!.trigger('a') // clears the error
    await flush()
    expect(c.querySelector('[data-testid=v]')!.textContent).toBe('Valid')
    if (typeof dispose === 'function') dispose()
    c.remove()
  })
})
