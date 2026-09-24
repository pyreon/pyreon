/**
 * Pyreon form impl — idiomatic `@pyreon/form`.
 *
 * Uses `useForm` + per-field `register()` (the documented binding API) and the
 * `@pyreon/validation` zod adapter with the SHARED schema. Written as JSX and
 * compiled by `@pyreon/vite-plugin` — the path a Pyreon app ships (compiled
 * `_tpl` templates), the same "each arm on its own toolchain's output" rule the
 * other columns follow (Vue compiled template, Solid babel-preset-solid emit,
 * React automatic-runtime `jsx()`, Svelte compiler).
 *
 * The input binds `value` / `onInput` / `onBlur` from `register()` rather than
 * spreading the whole object: the spread would also render `id` +
 * `aria-invalid` + `aria-describedby`, attributes no other column renders.
 * Same attribute set in every column = same DOM work.
 *
 * The field list is `<For>`, not `.map()`: a `.map()` child lowers to ONE
 * reactive slot, and the per-field JSX inside its callback reads `r.value()` /
 * `error()` eagerly — so every keystroke re-ran the whole slot and REMOUNTED
 * all 12 fields (caught by the library-state gate: the input the bench held
 * was detached after the first keystroke). `<For>` is the documented list
 * primitive and gives each row its own fine-grained bindings.
 *
 * Commit boundary: NONE. Signal writes patch the bound text node synchronously,
 * so the DOM is committed when `fn()` returns (the runner omits `commit`).
 */
import { For } from '@pyreon/core'
import { useForm, type FormState } from '@pyreon/form'
import { mount } from '@pyreon/runtime-dom'
import { zodSchema } from '@pyreon/validation/zod'
import {
  expectDirtyDom,
  expectEmailError,
  expectLibraryValue,
  expectResetDom,
  fieldInputCount,
  setInput,
} from '../dom'
import { bench, settle, type BenchSuite } from '../runner'
import { FIELD_NAMES, emptyValues, formSchema, validValues, type FieldName, type FormValues } from '../../shared/schema'

type PyForm = FormState<FormValues>

/** `<For each>` takes a mutable array. */
const FIELD_LIST: FieldName[] = [...FIELD_NAMES]

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
    return (
      <form>
        <For each={FIELD_LIST} by={(name: FieldName) => name}>
          {(name: FieldName) => {
            const r = form.register(name)
            return (
              <div>
                <input data-field={name} value={r.value()} onInput={r.onInput} onBlur={r.onBlur} />
                <span data-error={name}>{form.fields[name].error() ?? ''}</span>
              </div>
            )
          }}
        </For>
      </form>
    )
  }

  const dispose = mount(<PyreonForm />, container)
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
    const { form, dispose } = mountForm(container, 'blur')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) setInput(input, TYPED.slice(0, i))
    }, {
      reset: async () => {
        setInput(input, '')
        await settle()
      },
      verify: () => expectLibraryValue('keystroke-blur', form.values().email, TYPED),
    })
    dispose()
  }

  // ── Scenario: keystroke-change (validate every keystroke) ────────────────
  {
    const { form, dispose } = mountForm(container, 'change')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-change', suite, async () => {
      // One keystroke = dispatch, commit, then let its async validation settle
      // (see runner.ts `settle`) — identical in every column.
      for (let i = 1; i <= TYPED.length; i++) {
        setInput(input, TYPED.slice(0, i))
        await settle()
      }
    }, {
      reset: async () => {
        setInput(input, '')
        await settle()
      },
      verify: (c) => {
        expectLibraryValue('keystroke-change', form.values().email, TYPED)
        expectEmailError(c)
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
      reset: async () => {
        const dirty = validValues()
        for (const name of FIELD_NAMES) form.setFieldValue(name, dirty[name])
        await settle()
        expectDirtyDom(container, dirty)
      },
      verify: expectResetDom,
    })
    dispose()
  }

  return suite
}
