// Regression locks for the 2026-09 @pyreon/form hardening pass. Each describe
// names the failure scenario it closes; every one was bisect-verified (revert
// the fix → the spec fails with the stated symptom).

import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FormState } from '../index'
import { Form, Submit, useField, useForm, useWatch } from '../index'

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reset / setInitialValues invalidate in-flight async validation', () => {
  it('a pending validator resolving after field.reset() does not write its error', async () => {
    const pending = deferred<string | undefined>()
    let seenSignal: AbortSignal | undefined
    const form = useForm({
      initialValues: { username: '' },
      validators: {
        username: (_v, _all, sig) => {
          seenSignal = sig
          return pending.promise
        },
      },
      onSubmit: () => {},
    })
    form.setFieldValue('username', 'taken-name')
    form.fields.username.setTouched() // blur → validator in flight
    form.fields.username.reset()
    pending.resolve('Username is taken')
    await tick()
    expect(form.fields.username.error()).toBeUndefined()
    expect(form.isValid()).toBe(true)
    // A single-field reset only DISCARDS the result — it must not abort the
    // shared signal other fields' in-flight validators are using.
    expect(seenSignal?.aborted).toBe(false)
  })

  it('a pending validator resolving after form.reset() does not write its error, and is aborted', async () => {
    const pending = deferred<string | undefined>()
    let seenSignal: AbortSignal | undefined
    const form = useForm({
      initialValues: { username: '' },
      validators: {
        username: (_v, _all, sig) => {
          seenSignal = sig
          return pending.promise
        },
      },
      onSubmit: () => {},
    })
    form.setFieldValue('username', 'x')
    form.fields.username.setTouched()
    form.reset()
    expect(seenSignal?.aborted).toBe(true)
    pending.resolve('Username is taken')
    await tick()
    expect(form.fields.username.error()).toBeUndefined()
  })

  it('a pending validator resolving after setInitialValues() does not write its error', async () => {
    const pending = deferred<string | undefined>()
    const form = useForm({
      initialValues: { username: '' },
      validators: { username: () => pending.promise },
      onSubmit: () => {},
    })
    form.setFieldValue('username', 'x')
    form.fields.username.setTouched()
    form.setInitialValues({ username: 'server' })
    pending.resolve('Username is taken')
    await tick()
    expect(form.fields.username.error()).toBeUndefined()
  })

  it('a pending SCHEMA blur run resolving after reset() does not write its error', async () => {
    const pending = deferred<Record<string, string | undefined>>()
    const form = useForm({
      initialValues: { username: '' },
      schema: () => pending.promise,
      onSubmit: () => {},
    })
    form.fields.username.setTouched()
    form.reset()
    pending.resolve({ username: 'Required' })
    await tick()
    expect(form.fields.username.error()).toBeUndefined()
  })
})

describe('handleSubmit is re-entrancy safe', () => {
  it('a double submit during async validation calls onSubmit once', async () => {
    const onSubmit = vi.fn()
    const form = useForm({
      initialValues: { a: 'x' },
      validators: { a: async () => (await tick(20), undefined) },
      onSubmit,
    })
    await Promise.all([form.handleSubmit(), form.handleSubmit()])
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('<Submit> is disabled while validating', async () => {
    const pending = deferred<string | undefined>()
    let form!: FormState<{ a: string }>
    const host = document.createElement('div')
    mount(
      h(() => {
        form = useForm({
          initialValues: { a: 'x' },
          validators: { a: () => pending.promise },
          onSubmit: () => {},
        })
        return h(Form, { of: form }, h(Submit, null, 'Go'))
      }, null),
      host,
    )
    const btn = host.querySelector('button')!
    expect(btn.disabled).toBe(false)
    const p = form.handleSubmit()
    await tick()
    expect(btn.disabled).toBe(true)
    pending.resolve(undefined)
    await p
    expect(btn.disabled).toBe(false)
  })
})

describe("an empty-string ('') validator result is valid everywhere", () => {
  const make = () =>
    useForm({
      initialValues: { name: '' },
      validators: { name: (v: string) => (v.length < 2 ? 'short' : '') },
      onSubmit: () => {},
    })

  it('register(): no aria-invalid / aria-describedby', () => {
    const form = make()
    form.setFieldValue('name', 'ada')
    form.fields.name.error.set('')
    const props = form.register('name')
    expect((props['aria-invalid'] as () => unknown)()).toBeUndefined()
    expect((props['aria-describedby'] as () => unknown)()).toBeUndefined()
  })

  it('useField(): hasError / showError are false', () => {
    const form = make()
    const f = useField(form, 'name')
    form.fields.name.touched.set(true)
    form.fields.name.error.set('')
    expect(f.hasError()).toBe(false)
    expect(f.showError()).toBe(false)
  })

  it('trigger() returns true', async () => {
    const form = make()
    form.setFieldValue('name', 'ada')
    await expect(form.trigger('name')).resolves.toBe(true)
  })

  it('focusFirstError() skips an empty-string field', () => {
    const form = useForm({
      initialValues: { a: '', b: '' },
      onSubmit: () => {},
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    mount(h('div', null, h('input', form.register('a') as never), h('input', form.register('b') as never)), host)
    form.fields.a.error.set('')
    form.fields.b.error.set('bad')
    form.focusFirstError()
    expect(document.activeElement?.id).toBe(form.register('b').id)
    host.remove()
  })
})

describe('debounceMs applies to schema-validated fields', () => {
  it('change-mode schema runs are debounced', async () => {
    const schema = vi.fn((v: { a: string }) => ({ a: v.a.length < 3 ? 'short' : undefined }))
    const form = useForm({
      initialValues: { a: 'abcd' },
      schema,
      validateOn: 'change',
      debounceMs: 30,
      onSubmit: () => {},
    })
    await tick(60)
    schema.mockClear()
    form.setFieldValue('a', 'x')
    form.setFieldValue('a', 'xy')
    form.setFieldValue('a', 'xyz')
    expect(schema).toHaveBeenCalledTimes(0)
    await tick(60)
    expect(schema).toHaveBeenCalledTimes(1)
    expect(form.fields.a.error()).toBeUndefined()
  })
})

describe('dirty tracking compares non-plain values correctly', () => {
  it('a changed Date marks the field dirty', () => {
    const form = useForm({
      initialValues: { when: new Date('2026-01-01') },
      onSubmit: () => {},
    })
    form.setFieldValue('when', new Date('2026-06-01'))
    expect(form.fields.when.dirty()).toBe(true)
    form.setFieldValue('when', new Date('2026-01-01'))
    expect(form.fields.when.dirty()).toBe(false)
  })

  it('a changed Map / Set marks the field dirty', () => {
    const form = useForm({
      initialValues: { m: new Map([['a', 1]]), s: new Set([1]) },
      onSubmit: () => {},
    })
    form.setFieldValue('m', new Map([['a', 2]]))
    form.setFieldValue('s', new Set([2]))
    expect(form.fields.m.dirty()).toBe(true)
    expect(form.fields.s.dirty()).toBe(true)
    form.setFieldValue('m', new Map([['a', 1]]))
    form.setFieldValue('s', new Set([1]))
    expect(form.fields.m.dirty()).toBe(false)
    expect(form.fields.s.dirty()).toBe(false)
  })

  it('a different File is dirty; values of different prototypes differ', () => {
    const f1 = new File(['a'], 'a.txt')
    const form = useForm({
      initialValues: { file: f1 as File | null, obj: {} as object },
      onSubmit: () => {},
    })
    form.setFieldValue('file', new File(['a'], 'a.txt'))
    expect(form.fields.file.dirty()).toBe(true)
    form.setFieldValue('obj', new Date(0))
    expect(form.fields.obj.dirty()).toBe(true)
  })

  it('a different class instance with no own keys is dirty (identity, not a key walk)', () => {
    class Token {}
    const form = useForm({ initialValues: { tok: new Token() }, onSubmit: () => {} })
    form.setFieldValue('tok', new Token())
    expect(form.fields.tok.dirty()).toBe(true)
  })
})

describe('onSubmit errors are captured, not rethrown by default', () => {
  it('handleSubmit resolves and sets submitError', async () => {
    const form = useForm({
      initialValues: { a: 'x' },
      onSubmit: () => {
        throw new Error('boom')
      },
    })
    await expect(form.handleSubmit()).resolves.toBeUndefined()
    expect((form.submitError() as Error).message).toBe('boom')
  })

  it('{ rethrow: true } opts into the rejection', async () => {
    const form = useForm({
      initialValues: { a: 'x' },
      onSubmit: () => {
        throw new Error('boom')
      },
    })
    await expect(form.handleSubmit({ rethrow: true })).rejects.toThrow('boom')
  })

  it('a <Form> submit event with a throwing onSubmit produces no unhandled rejection', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (e: unknown) => unhandled.push(e)
    process.on('unhandledRejection', onUnhandled)
    const host = document.createElement('div')
    document.body.appendChild(host)
    let form!: FormState<{ a: string }>
    mount(
      h(() => {
        form = useForm({
          initialValues: { a: 'x' },
          onSubmit: async () => {
            throw new Error('server down')
          },
        })
        return h(Form, { of: form }, h(Submit, null, 'Go'))
      }, null),
      host,
    )
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await tick(20)
    process.off('unhandledRejection', onUnhandled)
    host.remove()
    expect(unhandled).toEqual([])
    expect((form.submitError() as Error).message).toBe('server down')
  })
})

describe('a schema throwing on blur / change / trigger is surfaced', () => {
  const throwing = () => {
    throw new Error('schema exploded')
  }

  it('blur sets submitError and dev-warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = useForm({ initialValues: { a: '' }, schema: throwing, onSubmit: () => {} })
    form.fields.a.setTouched()
    await tick()
    expect((form.submitError() as Error).message).toBe('schema exploded')
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith('[Pyreon]'))).toBe(true)
  })

  it('change-mode sets submitError', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = useForm({
      initialValues: { a: '' },
      schema: throwing,
      validateOn: 'change',
      onSubmit: () => {},
    })
    await tick()
    expect((form.submitError() as Error).message).toBe('schema exploded')
  })

  it('trigger() sets submitError and returns false', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = useForm({ initialValues: { a: '' }, schema: throwing, onSubmit: () => {} })
    await expect(form.trigger('a')).resolves.toBe(false)
    expect((form.submitError() as Error).message).toBe('schema exploded')
  })
})

describe('edge arms', () => {
  it('Maps / Sets of different size are dirty', () => {
    const form = useForm({
      initialValues: { m: new Map([['a', 1]]), s: new Set([1]) },
      onSubmit: () => {},
    })
    form.setFieldValue('m', new Map())
    form.setFieldValue('s', new Set([1, 2]))
    expect(form.fields.m.dirty()).toBe(true)
    expect(form.fields.s.dirty()).toBe(true)
  })

  it('a schema throw that lands after a reset is discarded (stale run)', async () => {
    let reject!: (e: unknown) => void
    const form = useForm({
      initialValues: { a: '' },
      schema: () =>
        new Promise<Record<string, string>>((_r, rej) => {
          reject = rej
        }),
      onSubmit: () => {},
    })
    form.fields.a.setTouched()
    form.reset()
    reject(new Error('late'))
    await tick()
    expect(form.submitError()).toBeUndefined()
  })
})

describe("register(name, { type: 'number' }) with an empty / invalid input", () => {
  it('stores undefined rather than the raw string', () => {
    const form = useForm({ initialValues: { age: 3 as number | undefined }, onSubmit: () => {} })
    const props = form.register('age', { type: 'number' })
    const input = document.createElement('input')
    input.type = 'number'
    input.value = ''
    props.onInput({ target: input } as unknown as Event)
    expect(form.values().age).toBeUndefined()
  })
})

describe('useWatch(form) sees fields registered after the watch', () => {
  it('includes a registerField() field and tracks it', () => {
    const form = useForm({ initialValues: { a: 1 } as Record<string, unknown>, onSubmit: () => {} })
    const all = useWatch(form)
    expect(all()).toEqual({ a: 1 })
    form.registerField('b', 2)
    expect(all()).toEqual({ a: 1, b: 2 })
    form.setFieldValue('b', 3)
    expect(all()).toEqual({ a: 1, b: 3 })
    form.unregisterField('a')
    expect(all()).toEqual({ b: 3 })
  })
})

describe('error prefixes', () => {
  it('uses the [Pyreon] prefix', () => {
    const form = useForm({ initialValues: { a: 1 }, onSubmit: () => {} })
    expect(() => form.setFieldValue('nope' as 'a', 1)).toThrow(/^\[Pyreon\]/)
  })
})

describe('useField().register supports the file overload', () => {
  it('returns a value-less bag for type: file', () => {
    const form = useForm({ initialValues: { upload: null as FileList | null }, onSubmit: () => {} })
    const f = useField(form, 'upload')
    const props = f.register({ type: 'file' })
    expect('value' in props).toBe(false)
    expect(typeof props.onInput).toBe('function')
  })
})
