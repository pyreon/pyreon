/**
 * Vue 3 impl — idiomatic vee-validate (the most-used Vue form lib).
 *
 * The template is compiled at BUILD time by `vite.config.ts`
 * (`virtual:form-vue-render`) with `@vue/compiler-sfc`'s SFC option set —
 * exactly what an SFC ships (patch flags, hoisted static props, `v-model`'s
 * `vModelText` directive). It was a hand-written `h()` render function before,
 * which carries no patch flags and full-diffs every field on every render — a
 * handicap no Vue app built with its toolchain pays (the same fix
 * `examples/benchmark` made). vee-validate's composition API (`useForm` +
 * `defineField`) drives the fields; `@vee-validate/zod` `toTypedSchema` runs
 * the SAME shared zod schema.
 *
 * Commit boundary: `await nextTick()` — Vue's real flush boundary (no rAF).
 */
import { createApp, defineComponent, nextTick, type App } from 'vue'
import { render as formRender } from 'virtual:form-vue-render'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import {
  expectDirtyDom,
  expectEmailError,
  expectLibraryValue,
  expectResetDom,
  fieldInputCount,
  setInput,
} from '../dom'
import { bench, settle, untimed, type BenchSuite } from '../runner'
import { FIELD_NAMES, emptyValues, formSchema, validValues, type FieldName } from '../../shared/schema'

interface VueApi {
  getValue: (name: FieldName) => unknown
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
        getValue: (name) => form.values[name],
        resetForm: () => form.resetForm(),
        setFieldValue: (name, value) => form.setFieldValue(name, value),
      }
      const fields = FIELD_NAMES.map((name) => {
        // validateOnModelUpdate = validate on each keystroke (change) vs only
        // on blur (blur). The closest idiomatic vee-validate per-mode control.
        const [model, props] = form.defineField(name, { validateOnModelUpdate: mode === 'change' })
        return { name, model, props }
      })
      // Bindings for the precompiled template (`FORM_VUE_TEMPLATE`).
      return { fields, errors: form.errors }
    },
    render: formRender,
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

/** Past vee-validate's 5ms validation debounce, then its async chain + flush. */
async function veeValidateIdle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 8))
  await settle()
  await nextTick()
}
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
    const { api, dispose } = mountForm(container, 'blur')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, async () => {
      // Commit PER keystroke, like every other column (a real user's keystrokes are
      // separate tasks). Committing once after all 12 let the scheduler coalesce
      // 12 renders into 1 — work no other column was allowed to skip.
      for (let i = 1; i <= TYPED.length; i++) {
        setInput(input, TYPED.slice(0, i))
        await nextTick()
      }
    }, {
      reset: async () => {
        setInput(input, '')
        await settle()
      },
      commit,
      verify: () => expectLibraryValue('keystroke-blur', api.getValue('email'), TYPED),
    })
    dispose()
  }

  // ── keystroke-change ─────────────────────────────────────────────────────
  {
    const { api, dispose } = mountForm(container, 'change')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-change', suite, async () => {
      // One keystroke = dispatch, commit, then let its async validation settle
      // (see runner.ts `settle`) — identical in every column.
      for (let i = 1; i <= TYPED.length; i++) {
        setInput(input, TYPED.slice(0, i))
        await nextTick()
        await settle()
        // vee-validate debounces schema validation by a hard-coded 5ms, so the
        // keystroke's validation has not run yet. Let it run (as it would
        // between a real user's keystrokes) instead of letting 12 keystrokes
        // coalesce into ONE validation — but EXCLUDE that wait from the sample,
        // since most of it is idle timer. Consequence, disclosed in
        // METHODOLOGY.md: this column UNDER-counts (the debounced validation +
        // its error render run inside the excluded span).
        await untimed(veeValidateIdle)
      }
    }, {
      reset: async () => {
        setInput(input, '')
        await settle()
        await veeValidateIdle()
      },
      commit,
      verify: (c) => {
        expectLibraryValue('keystroke-change', api.getValue('email'), TYPED)
        expectEmailError(c)
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
        const dirty = validValues()
        for (const name of FIELD_NAMES) api.setFieldValue(name, dirty[name])
        await nextTick()
        await settle()
        expectDirtyDom(container, dirty)
      },
      verify: expectResetDom,
    })
    dispose()
  }

  return suite
}
