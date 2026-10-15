import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useForm } from '../index'

/**
 * The form creates its AbortController on first use instead of at setup.
 * These specs lock what that must not change: a form that never validates
 * creates none, and a validator that starts after unmount still receives an
 * already-aborted signal.
 */

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

afterEach(() => vi.restoreAllMocks())

describe('lazy AbortController', () => {
  it('creates no AbortController for a form that never validates', () => {
    const Real = globalThis.AbortController
    let created = 0
    vi.stubGlobal(
      'AbortController',
      class extends Real {
        constructor() {
          super()
          created++
        }
      },
    )
    try {
      const { result: form, unmount } = mountWith(() =>
        useForm({ initialValues: { a: '', b: 0 }, onSubmit: () => {} }),
      )
      form.fields.a.setValue('x')
      expect(created).toBe(0)
      unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('gives a validator that starts after unmount an aborted signal', async () => {
    let seen: AbortSignal | undefined
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { email: '' },
        validators: {
          email: (_v: string, _all: unknown, signal?: AbortSignal) => {
            seen = signal
            return undefined
          },
        },
        // 'blur', so nothing validates (and no controller exists) before unmount.
        validateOn: 'blur',
        onSubmit: () => {},
      }),
    )
    unmount()
    form.fields.email.setTouched()
    await Promise.resolve()
    expect(seen).toBeInstanceOf(AbortSignal)
    expect(seen?.aborted).toBe(true)
  })
})
