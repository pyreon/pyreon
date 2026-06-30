/**
 * Vue 3 impl — idiomatic vee-validate (the most-used Vue form lib).
 *
 * Built with Vue's `h()` render functions (the same no-JSX approach
 * examples/benchmark's Vue entry uses) so there's no JSX-transform conflict
 * with Pyreon's compiler in the shared Vite config. vee-validate's composition
 * API (`useForm` + `defineField`) drives the fields; `@vee-validate/zod`
 * `toTypedSchema` runs the SAME shared zod schema.
 *
 * Commit boundary: `await nextTick()` — Vue's real flush boundary (no rAF).
 */
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { setInput, fieldInputCount, visibleErrorCount } from '../dom'
import { bench, type BenchSuite } from '../runner'
import { FIELD_NAMES, emptyValues, formSchema, type FieldName } from '../../shared/schema'

interface VueApi {
  resetForm: () => void
  setFieldValue: (name: FieldName, value: string) => void
}
interface Mounted {
  api: VueApi
  dispose: () => void
}

function mountForm(container: HTMLElement, mode: 'change' | 'blur'): Mounted {
  let api: VueApi | undefined
  const Comp = defineComponent({
    setup() {
      const form = useForm({
        validationSchema: toTypedSchema(formSchema),
        initialValues: emptyValues(),
      })
      api = {
        resetForm: () => form.resetForm(),
        setFieldValue: (name, value) => form.setFieldValue(name, value),
      }
      const fields = FIELD_NAMES.map((name) => {
        // validateOnModelUpdate = validate on each keystroke (change) vs only
        // on blur (blur). The closest idiomatic vee-validate per-mode control.
        const [model, props] = form.defineField(name, { validateOnModelUpdate: mode === 'change' })
        return { name, model, props }
      })
      return () =>
        h(
          'form',
          null,
          fields.map(({ name, model, props }) =>
            h('div', { key: name }, [
              h('input', {
                'data-field': name,
                value: model.value,
                onInput: (e: Event) => {
                  model.value = (e.target as HTMLInputElement).value
                },
                onBlur: (props.value as { onBlur?: (e: Event) => void }).onBlur,
              }),
              h('span', { 'data-error': name }, form.errors.value[name] ?? ''),
            ]),
          ),
        )
    },
  })
  const app: App = createApp(Comp)
  app.mount(container)
  return {
    api: api as VueApi,
    dispose: () => {
      app.unmount()
      container.innerHTML = ''
    },
  }
}

const TYPED = 'abcdefghijkl'
const commit = () => nextTick()

export async function runVue(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: 'Vue (vee-validate)', container, results: [] }

  // ── mount-12-fields ──────────────────────────────────────────────────────
  {
    const live: Mounted[] = []
    await bench('mount-12-fields', suite, async () => {
      live.push(mountForm(container, 'blur'))
    }, {
      reset: () => {
        live.pop()?.dispose()
      },
      commit,
      verify: (c) => {
        if (fieldInputCount(c) !== 12) throw new Error(`mount: expected 12 inputs, got ${fieldInputCount(c)}`)
      },
    })
    live.pop()?.dispose()
  }

  // ── keystroke-blur ───────────────────────────────────────────────────────
  {
    const { dispose } = mountForm(container, 'blur')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) setInput(input, TYPED.slice(0, i))
    }, {
      reset: () => setInput(input, ''),
      commit,
      verify: () => {
        if (input.value !== TYPED) throw new Error('keystroke-blur: value not committed')
      },
    })
    dispose()
  }

  // ── keystroke-change ─────────────────────────────────────────────────────
  {
    const { dispose } = mountForm(container, 'change')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-change', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) setInput(input, TYPED.slice(0, i))
    }, {
      reset: () => setInput(input, ''),
      commit,
      verify: () => {
        if (input.value !== TYPED) throw new Error('keystroke-change: value not committed')
      },
    })
    dispose()
  }

  // ── reset-dirty-form ─────────────────────────────────────────────────────
  {
    const { api, dispose } = mountForm(container, 'blur')
    await bench('reset-dirty-form', suite, async () => {
      api.resetForm()
      await nextTick()
    }, {
      reset: async () => {
        for (const name of FIELD_NAMES) api.setFieldValue(name, 'dirty')
        await nextTick()
      },
      verify: () => {
        const first = container.querySelector('input[data-field="first"]') as HTMLInputElement
        if (first.value !== '') throw new Error('reset: form not reset')
        if (visibleErrorCount(container) !== 0) throw new Error('reset: errors not cleared')
      },
    })
    dispose()
  }

  return suite
}
