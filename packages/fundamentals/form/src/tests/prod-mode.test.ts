/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// ─── Production-mode dev-gate coverage ───────────────────────────────────────
//
// Several hot paths in use-form.ts / use-form-state.ts are gated on
//   `if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.(...)`.
// In normal (dev/test) runs only the TRUE side executes; the FALSE side
// (production — counter skipped) is never measured. This file stubs
// NODE_ENV=production BEFORE importing the modules so the gates evaluate
// false and the same code paths run WITHOUT the counter emit.
//
// The modules are imported lazily (after the stub) so the gate reads the
// stubbed value at evaluation time. They carry no module-level NODE_ENV
// read, but the per-call gates do.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let useForm: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let useFormState: any

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production')
  ;({ useForm } = await import('../use-form'))
  ;({ useFormState } = await import('../use-form-state'))
})

afterAll(() => {
  vi.unstubAllEnvs()
})

function Capture<T>({ fn }: { fn: () => T }) {
  fn()
  return null
}

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(h(Capture, { fn: () => (result = fn()) }), el)
  return {
    result: result as T,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

describe('use-form in production mode (dev-gate false side)', () => {
  it('builds fields, validates, and reads form-state without the counter emits', async () => {
    const onSubmit = vi.fn()
    const { result, unmount } = mountWith(() => {
      // Field loop runs the gated fieldSignalCreate block with the counter
      // skipped (auto-validation is inline in setValue — no per-field effect).
      const form = useForm({
        initialValues: { email: '', name: '' },
        validators: {
          email: (v: string) => (v ? undefined : 'Required'),
        },
        onSubmit,
      })
      // useFormState no-selector path → gated formStateScan (112) skipped,
      // plus the touched/dirty/errors atom computeds (152/161/170).
      const state = useFormState(form)
      return { form, state }
    })

    // Touch + dirty a field so the atom maps materialize all branches.
    result.form.fields.name.setValue('Alice')
    result.form.fields.name.setTouched()

    const snap = result.state()
    expect(snap.dirtyFields).toEqual({ name: true })
    expect(snap.touchedFields).toEqual({ name: true })
    expect(snap.errors).toEqual({})

    // validate() runs the gated validateParallel (479) block.
    const ok = await result.form.validate()
    expect(ok).toBe(false)
    expect(result.form.fields.email.error()).toBe('Required')

    unmount()
  })

  it('process.env.NODE_ENV is production for this suite', () => {
    expect(process.env.NODE_ENV).toBe('production')
  })
})
