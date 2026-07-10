/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it, vi } from 'vitest'
import { Form, Submit } from '../form-component'
import { useForm } from '../use-form'
import { useFormState } from '../use-form-state'
import { FormProvider } from '../context'
import type { SchemaValidateFn } from '../types'

// Test harness: mount a render-prop component so component-scope hooks
// (useForm / useFormState) run inside Pyreon's setup frame.
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

// ─── <Form> reactive disabled / readOnly accessors ───────────────────────────
//
// Covers form-component.tsx:
//   - if@55 / if@60 truthy arm (typeof prop === 'function' → effect())
//   - cond-expr@47 / cond-expr@51 consequent (v() — accessor invoked)

describe('<Form disabled={accessor}> tracks reactively', () => {
  it('reads disabled from a function accessor and updates on signal change', () => {
    const form = useForm({ initialValues: { name: '' }, onSubmit: () => {} })
    const isDisabled = signal(true)
    const ctr = document.createElement('div')

    mount(h(Form, { of: form, disabled: () => isDisabled() }), ctr)
    // cond-expr consequent: v() returned true
    expect(form.disabled()).toBe(true)

    // effect re-runs on signal change
    isDisabled.set(false)
    expect(form.disabled()).toBe(false)
  })

  it('reads readOnly from a function accessor and updates on signal change', () => {
    const form = useForm({ initialValues: { name: '' }, onSubmit: () => {} })
    const isReadOnly = signal(false)
    const ctr = document.createElement('div')

    mount(h(Form, { of: form, readOnly: () => isReadOnly() }), ctr)
    expect(form.readOnly()).toBe(false)

    isReadOnly.set(true)
    expect(form.readOnly()).toBe(true)
  })
})

// ─── <Submit> default children fallback ──────────────────────────────────────
//
// Covers form-component.tsx binary-expr@94#1 (props.children ?? 'Submit')

describe('<Submit> with no children renders default label', () => {
  it('falls back to "Submit" text when no children supplied', () => {
    const form = useForm({ initialValues: { name: '' }, onSubmit: () => {} })
    const ctr = document.createElement('div')

    mount(h(FormProvider, { form }, h(Submit, {})), ctr)
    const btn = ctr.querySelector('button')
    expect(btn?.textContent).toBe('Submit')
  })
})

// ─── useFormState cache hit (shared atoms) ───────────────────────────────────
//
// Covers use-form-state.ts if@148#0 (cached → return cached atoms)

describe('useFormState shares atoms across calls on the same form', () => {
  it('second useFormState() on the same form hits the atoms cache', () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({ initialValues: { email: '' }, onSubmit: () => {} })
      // First call materializes the atoms; second call hits the cache.
      const a = useFormState(form)
      const b = useFormState(form)
      return { form, a, b }
    })

    // Both views observe the same field state.
    result.form.fields.email.setValue('x@y.com')
    expect(result.a().dirtyFields).toEqual({ email: true })
    expect(result.b().dirtyFields).toEqual({ email: true })
    unmount()
  })
})

// ─── schema TypedSchemaAdapter (_infer) ──────────────────────────────────────
//
// Covers use-form.ts cond-expr@115#0 (schemaInput._infer → use .validator)

describe('useForm extracts validator from a TypedSchemaAdapter', () => {
  it('uses the .validator from a { _infer, validator } adapter on submit', async () => {
    const onSubmit = vi.fn()
    const validatorFn: SchemaValidateFn<{ title: string }> = (values) =>
      values.title ? {} : { title: 'Required' }
    const adapter = { _infer: {} as { title: string }, validator: validatorFn }

    const form = useForm({
      initialValues: { title: '' },
      schema: adapter,
      onSubmit,
    })

    await form.handleSubmit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(form.fields.title.error()).toBe('Required')
  })
})

// ─── getSubmitValues: nullish values are first-class ─────────────────────────
//
// This spec used to CODIFY the release-audit defect it now guards against: the
// old `f?.value.peek() ?? currentInitials[name]` fallback swallowed an
// explicit `null` field value and submitted the stale initial (`'default'`).
// Corrected semantics: the payload branches on FIELD EXISTENCE, so an
// explicit null (a cleared `FileList | null` file field) reaches onSubmit.

describe('submit payload preserves an explicit nullish field value', () => {
  it('carries null to onSubmit instead of falling back to the initial', async () => {
    const onSubmit = vi.fn()
    const form = useForm<{ tag: string | null }>({
      initialValues: { tag: 'default' },
      onSubmit,
    })

    form.fields.tag.setValue(null)
    await form.handleSubmit()

    expect(onSubmit).toHaveBeenCalledWith({ tag: null })
  })
})

// ─── async validator: AbortError swallowed ───────────────────────────────────
//
// Covers use-form.ts if@293#0 (runValidation catch → AbortError → return undefined)

describe('async field validator swallows AbortError', () => {
  it('does not set an error when the validator throws an AbortError', async () => {
    let resolveValidator: (() => void) | undefined
    const form = useForm({
      initialValues: { email: '' },
      validators: {
        email: async (_v, _all, signal) => {
          await new Promise<void>((res) => {
            resolveValidator = res
            signal?.addEventListener('abort', () => res())
          })
          if (signal?.aborted) {
            const e = new Error('aborted')
            e.name = 'AbortError'
            throw e
          }
          return undefined
        },
      },
      validateOn: 'change',
      onSubmit: () => {},
    })

    // Start a change-mode validation (effect fires on setValue).
    form.fields.email.setValue('a')
    await Promise.resolve()

    // validate() aborts the in-flight controller, causing the awaited
    // validator to throw AbortError on the next microtask.
    const validatePromise = form.validate()
    resolveValidator?.()
    await validatePromise
    await Promise.resolve()

    // AbortError swallowed → no error string set from the aborted run.
    expect(form.fields.email.error()).toBeUndefined()
  })
})

// ─── async validator: non-Error thrown → String(err) ─────────────────────────
//
// Covers use-form.ts cond-expr@298#1 + cond-expr@301#1 (String(err) arms in
// runValidation's catch, change-mode path).

describe('async field validator stringifies a non-Error throw', () => {
  it('sets String(err) when the change-mode validator throws a non-Error', async () => {
    const form = useForm({
      initialValues: { email: '' },
      validators: {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        email: async () => {
          throw 'plain-string-failure'
        },
      },
      validateOn: 'change',
      onSubmit: () => {},
    })

    form.fields.email.setValue('a')
    // Let the auto-revalidation effect + async validator settle.
    await new Promise((r) => setTimeout(r, 0))
    await Promise.resolve()

    expect(form.fields.email.error()).toBe('plain-string-failure')
  })
})

// ─── async validator: stale result discarded ─────────────────────────────────
//
// Covers use-form.ts if@297#1 (false side: version mismatch → don't set error).
// A slow first validator resolves AFTER a fast second one bumped the version.

describe('async field validator discards stale results', () => {
  it('a slow first run does not clobber a fast second run', async () => {
    let calls = 0
    const form = useForm({
      initialValues: { email: '' },
      validators: {
        email: async (v: string) => {
          calls++
          const myCall = calls
          // First call is slow (50ms), second is fast (0ms).
          await new Promise((r) => setTimeout(r, myCall === 1 ? 50 : 0))
          return v === 'final' ? undefined : `err-${myCall}`
        },
      },
      validateOn: 'change',
      onSubmit: () => {},
    })

    // First (slow) run — produces err-1 but will be stale.
    form.fields.email.setValue('first')
    await new Promise((r) => setTimeout(r, 5))
    // Second (fast) run bumps the version → wins.
    form.fields.email.setValue('final')
    // Wait for the slow first run to resolve (it must be discarded).
    await new Promise((r) => setTimeout(r, 80))
    await Promise.resolve()

    // The stale err-1 was discarded; the fast 'final' run cleared the error.
    expect(form.fields.email.error()).toBeUndefined()
  })
})

// ─── error/dirty subscriber: no-transition arm ───────────────────────────────
//
// Covers use-form.ts if@366#1 + if@374#1 (the count-subscriber's
// `if (next !== prev)` FALSE side — set the same error/dirty value twice).

describe('count subscribers skip when error/dirty does not transition', () => {
  it('setting the same error twice does not double-count invalid', () => {
    const form = useForm({ initialValues: { a: '', b: '' }, onSubmit: () => {} })

    // Two error sets with the SAME truthiness → second is a no-transition.
    form.setFieldError('a', 'bad')
    form.setFieldError('a', 'still-bad')
    expect(form.isValid()).toBe(false)

    // Clearing once flips back; clearing again is a no-transition (already clear).
    form.setFieldError('a', undefined)
    form.setFieldError('a', undefined)
    expect(form.isValid()).toBe(true)
  })

  it('setting the value to the same dirty state does not double-count dirty', () => {
    const form = useForm({ initialValues: { a: 'x' }, onSubmit: () => {} })

    // First change → dirty true (transition).
    form.fields.a.setValue('y')
    expect(form.isDirty()).toBe(true)
    // Second change to another non-initial value → dirty stays true (no transition).
    form.fields.a.setValue('z')
    expect(form.isDirty()).toBe(true)
    // Revert to initial → dirty false (transition).
    form.fields.a.setValue('x')
    expect(form.isDirty()).toBe(false)
  })
})

// ─── runSchemaForField catch on blur (schema throws) ─────────────────────────
//
// Covers use-form.ts anonymous_16@410 (the .catch(() => {}) callback fires when
// the blur-time schema validation rejects).

describe('schema throwing on blur is swallowed', () => {
  it('runs the schema on blur and swallows a rejection', async () => {
    const throwingSchema: SchemaValidateFn<{ title: string }> = async () => {
      throw new Error('schema exploded')
    }
    const form = useForm({
      initialValues: { title: '' },
      schema: throwingSchema,
      validateOn: 'blur',
      onSubmit: () => {},
    })

    // Blur a schema-only field → runSchemaForField runs, rejects, .catch swallows.
    form.fields.title.setTouched()
    // Let the rejected promise + .catch settle without an unhandled rejection.
    await new Promise((r) => setTimeout(r, 0))

    // No throw escaped; the field's error stays untouched by the swallowed reject.
    expect(form.fields.title.touched()).toBe(true)
  })
})

// ─── submit-path validator: non-Error throw → String(err) ───────────────────
//
// Covers use-form.ts cond-expr@507#1 (String(err) in validate()'s catch, where
// the field validator throws a non-Error during a submit-triggered validate()).

describe('submit-path validator stringifies a non-Error throw', () => {
  it('sets String(err) when the validator throws a non-Error in validate()', async () => {
    const form = useForm({
      initialValues: { email: '' },
      validators: {
        // throws synchronously during validate() → caught at line 501
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        email: () => {
          throw 'submit-string-failure'
        },
      },
      // 'submit' so the change-effect doesn't pre-run the validator.
      validateOn: 'submit',
      onSubmit: () => {},
    })

    await form.validate()
    expect(form.fields.email.error()).toBe('submit-string-failure')
  })
})

// ─── submit-path validator: AbortError swallowed ─────────────────────────────
//
// Covers use-form.ts if@504#0 (validate() catch → AbortError → return without
// setting an error, version still current).

describe('submit-path validator swallows AbortError', () => {
  it('does not set an error when a submit-path validator throws AbortError', async () => {
    const form = useForm({
      initialValues: { email: '' },
      validators: {
        email: () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          throw e
        },
      },
      validateOn: 'submit',
      onSubmit: () => {},
    })

    await form.validate()
    // AbortError swallowed at line 504 → error stays undefined.
    expect(form.fields.email.error()).toBeUndefined()
  })
})

// ─── submit-path validator: stale version discarded ──────────────────────────
//
// Covers use-form.ts if@502#1 (false side: a second validate() bumped the
// version while the first was in-flight → the first's result is discarded).

describe('submit-path validator discards a stale concurrent run', () => {
  it('a slow first validate() does not write once a fast second validate() bumped the version', async () => {
    let calls = 0
    const form = useForm({
      initialValues: { email: 'x' },
      validators: {
        email: async () => {
          calls++
          const myCall = calls
          // First validate()'s run is slow; second is immediate.
          await new Promise((r) => setTimeout(r, myCall === 1 ? 40 : 0))
          return myCall === 1 ? 'stale-error' : undefined
        },
      },
      validateOn: 'submit',
      onSubmit: () => {},
    })

    // Kick off the slow first validate() (does not await yet).
    const first = form.validate()
    // Second validate() bumps the per-field version and resolves fast.
    const second = form.validate()
    await second
    // Now let the slow first run resolve — its write must be discarded.
    await first
    await Promise.resolve()

    // The stale 'stale-error' from the first run was discarded (version moved).
    expect(form.fields.email.error()).toBeUndefined()
  })
})

// ─── reactive initialValues accessor returns falsy ───────────────────────────
//
// Covers use-form.ts if@724#0 (the watcher's `if (!next) return` truthy arm).

describe('reactive initialValues accessor guarding against falsy', () => {
  it('skips the reset when the accessor returns a falsy value', () => {
    const initials = signal<{ name: string } | null>({ name: 'Alice' })
    const { result, unmount } = mountWith(() =>
      useForm({
        initialValues: () => initials() as { name: string },
        onSubmit: () => {},
      }),
    )

    expect(result.fields.name.value()).toBe('Alice')

    // Accessor flips to null → watcher hits `if (!next) return`, no reset.
    initials.set(null)
    // Field retains its prior value (no crash, no reset to nullish).
    expect(result.fields.name.value()).toBe('Alice')
    unmount()
  })
})

// ─── structuredEqual deep recursion guard ────────────────────────────────────
//
// Covers use-form.ts if@768#0 (depth > 10 → return false). Reached via
// setValue's dirty comparison against an 11+-level-deep initial object.

describe('deep nested value comparison bails at the recursion guard', () => {
  it('treats >10-level-deep equal objects as not-equal (dirty becomes true)', () => {
    // Build a 12-level-deep nested object.
    const makeDeep = (): Record<string, unknown> => {
      let node: Record<string, unknown> = { leaf: 1 }
      for (let i = 0; i < 12; i++) node = { child: node }
      return node
    }

    const form = useForm<{ tree: Record<string, unknown> }>({
      initialValues: { tree: makeDeep() },
      onSubmit: () => {},
    })

    // Set a structurally-IDENTICAL but >10-deep object. The depth guard at
    // depth>10 returns false → structuredEqual is false → dirty flips true.
    form.fields.tree.setValue(makeDeep())
    expect(form.fields.tree.dirty()).toBe(true)
  })
})

// ─── trigger() on a validator-less field clears a stale error ────────────────
// Covers use-form.ts trigger(): the `else fields[name].error.set(undefined)`
// arm — a field with NO per-field validator must have any manually-set
// (server) error CLEARED by trigger, mirroring the auto-validation path.

describe('trigger() on a field without a validator', () => {
  it('clears a manually-set error (no validator → nothing can re-assert it)', async () => {
    const form = useForm<{ name: string }>({
      initialValues: { name: '' },
      onSubmit: () => {},
    })
    form.setFieldError('name', 'server says no')
    expect(form.errors().name).toBe('server says no')
    await expect(form.trigger('name')).resolves.toBe(true)
    expect(form.errors().name).toBeUndefined()
  })
})

// ─── useFormState selector reads the getter-backed scalar view ───────────────
// Covers use-form-state.ts summary getters (isDirty) on the SELECTOR path —
// the no-selector path derives isDirty from the atoms, so only a selector
// exercises the getter.

describe('useFormState(form, selector) — scalar getters', () => {
  it('a selector reading s.isDirty tracks the dirty flip', () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({ initialValues: { a: '' }, onSubmit: () => {} })
      const dirty = useFormState(form, (s) => s.isDirty)
      return { form, dirty }
    })
    expect(result.dirty()).toBe(false)
    result.form.setFieldValue('a', 'x')
    expect(result.dirty()).toBe(true)
  })
})

// ─── resolveSchemaValidator rejects a non-schema object at definition ────────
// Covers use-form.ts resolveSchemaValidator's throw tail (#2152): a `schema`
// that is neither a function, a typed adapter, nor a Standard Schema THROWS
// at useForm() time — silently disabling all schema validation (the pre-#2152
// behavior) would let invalid data through unnoticed.

describe('useForm({ schema }) with a non-schema object', () => {
  it('throws a [Pyreon]-prefixed definition-time error naming the accepted shapes', () => {
    expect(() =>
      useForm<{ name: string }>({
        initialValues: { name: '' },
        schema: { not: 'a schema' } as never,
        onSubmit: () => {},
      }),
    ).toThrow(/\[Pyreon\] `schema` must be a SchemaValidateFn/)
  })
})
