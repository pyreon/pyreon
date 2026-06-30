/**
 * Pyreon form impl — idiomatic `@pyreon/form`.
 *
 * Uses `useForm` + per-field `register()` (the documented binding API) and the
 * `@pyreon/validation` zod adapter with the SHARED schema. Built with explicit
 * `h()` calls (no JSX) so it sits next to the React-Hook-Form impl with no
 * jsxImportSource conflict and no `.map`-slot template-ordering surprises — the
 * fine-grained binding is identical to what the compiler emits for the JSX form.
 *
 * Commit boundary: NONE. Signal writes patch the bound text node synchronously,
 * so the DOM is committed when `fn()` returns (the runner omits `commit`).
 */
import { h } from '@pyreon/core'
import { useForm, type FormState } from '@pyreon/form'
import { mount } from '@pyreon/runtime-dom'
import { zodSchema } from '@pyreon/validation/zod'
import { setInput, fieldInputCount, visibleErrorCount } from '../dom'
import { bench, type BenchSuite } from '../runner'
import { FIELD_NAMES, emptyValues, formSchema, type FormValues } from '../../shared/schema'

type PyForm = FormState<FormValues>

/** A 12-keystroke word typed per timed keystroke run (lifts the per-run work
 *  above Chromium's ~100µs performance.now() resolution floor; also realistic
 *  — users type words). */
const TYPED = 'abcdefghijkl'

interface Mounted {
  form: PyForm
  dispose: () => void
}

function mountForm(container: HTMLElement, validateOn: 'blur' | 'change' | 'submit'): Mounted {
  let captured: PyForm | undefined

  function PyreonForm() {
    const form = useForm({
      initialValues: emptyValues(),
      schema: zodSchema(formSchema),
      validateOn,
      onSubmit: () => {},
    })
    captured = form
    const rows = FIELD_NAMES.map((name) => {
      const r = form.register(name)
      return h(
        'div',
        null,
        h('input', {
          'data-field': name,
          value: () => r.value(),
          onInput: r.onInput,
          onBlur: r.onBlur,
        }),
        h('span', { 'data-error': name }, () => form.fields[name].error() ?? ''),
      )
    })
    return h('form', null, ...rows)
  }

  const dispose = mount(h(PyreonForm, null), container)
  return {
    form: captured as PyForm,
    dispose: () => {
      if (typeof dispose === 'function') dispose()
      container.innerHTML = ''
    },
  }
}

export async function runPyreon(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: 'Pyreon', container, results: [] }

  // ── Scenario: mount-12-fields (fresh form each timed run) ────────────────
  {
    // Track the live mount in a 1-element stack: reset disposes the prior
    // mount before fn mounts a fresh one, so each timed run measures a real
    // cold mount. (Array element access avoids the closure-reassigned-`let`
    // narrowing quirk in tsc.)
    const live: Mounted[] = []
    await bench('mount-12-fields', suite, () => {
      live.push(mountForm(container, 'blur'))
    }, {
      reset: () => {
        live.pop()?.dispose()
      },
      verify: (c) => {
        if (fieldInputCount(c) !== 12) throw new Error(`mount: expected 12 inputs, got ${fieldInputCount(c)}`)
      },
    })
    live.pop()?.dispose()
  }

  // ── Scenario: keystroke-blur (no per-keystroke validation) ───────────────
  // Type a whole word (TYPED.length distinct keystrokes) per timed run — each
  // a real value-commit — so the per-run work clears Chromium's ~100µs
  // performance.now() resolution floor and the median is meaningful. More
  // realistic too: users type words, not single chars.
  {
    const { dispose } = mountForm(container, 'blur')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) setInput(input, TYPED.slice(0, i))
    }, {
      reset: () => setInput(input, ''),
      verify: () => {
        if (input.value !== TYPED) throw new Error('keystroke-blur: value not committed')
      },
    })
    dispose()
  }

  // ── Scenario: keystroke-change (validate every keystroke) ────────────────
  {
    const { dispose } = mountForm(container, 'change')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-change', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) setInput(input, TYPED.slice(0, i))
    }, {
      reset: () => setInput(input, ''),
      verify: () => {
        if (input.value !== TYPED) throw new Error('keystroke-change: value not committed')
      },
    })
    dispose()
  }

  // ── Scenario: reset-dirty-form ───────────────────────────────────────────
  {
    const { form, dispose } = mountForm(container, 'blur')
    await bench('reset-dirty-form', suite, () => {
      form.reset()
    }, {
      reset: () => {
        for (const name of FIELD_NAMES) form.setFieldValue(name, 'dirty')
      },
      verify: () => {
        if (form.values().first !== '') throw new Error('reset: form not reset')
        if (visibleErrorCount(container) !== 0) throw new Error('reset: errors not cleared')
      },
    })
    dispose()
  }

  return suite
}
