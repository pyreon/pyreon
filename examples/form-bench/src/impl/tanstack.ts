/**
 * TanStack React Form impl — idiomatic `@tanstack/react-form` v1.
 *
 * TanStack Form is a framework-agnostic store with a React adapter. Inputs are
 * CONTROLLED via `form.Field` render-props (`field.state.value` +
 * `field.handleChange`), but the store's selective subscriptions mean a
 * keystroke re-renders only that field's subtree — between Formik's whole-form
 * re-render and RHF's uncontrolled ~0. Worth measuring as its own point.
 *
 * Shared-schema fairness: v1 supports Standard Schema natively, so the SAME
 * `formSchema` is passed straight to the form-level validators (no adapter).
 *
 * Written as the automatic JSX runtime's output (`jsx`/`jsxs`, esbuild
 * `jsx: 'automatic'` emit, diffed); `flushSync` commit boundary.
 */
import { useForm } from '@tanstack/react-form'
import type * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { jsx, jsxs } from 'react/jsx-runtime'
import {
  expectDirtyDom,
  expectEmailError,
  expectLibraryValue,
  expectResetDom,
  fieldInputCount,
  setInput,
} from '../dom'
import { bench, settle, type BenchSuite } from '../runner'
import { FIELD_NAMES, emptyValues, formSchema, validValues } from '../../shared/schema'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

const TYPED = 'abcdefghijkl'

// `useForm` carries 20+ generic params; partial application
// (`useForm<FormValues>`) doesn't typecheck. Infer the fully-instantiated form
// type from a wrapper custom-hook's ReturnType instead — TS infers every
// generic from the args, giving the concrete API type with zero `any`.
function useTanstackForm(mode: 'change' | 'blur') {
  return useForm({
    defaultValues: emptyValues(),
    validators: mode === 'change' ? { onChange: formSchema } : { onBlur: formSchema },
  })
}
type TForm = ReturnType<typeof useTanstackForm>

/** Read the first error off a TanStack field's meta (issues may be strings or
 *  `{ message }` objects depending on the validator). */
function fieldError(meta: { errors?: ReadonlyArray<unknown> }): string {
  const e = meta.errors?.[0]
  if (!e) return ''
  if (typeof e === 'string') return e
  if (typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message
  return ''
}

/** The render-prop surface this form reads. `jsx()` types its props as
 *  `unknown` (no contextual typing through it), so it is spelled out. */
interface FieldRender {
  state: { value: string; meta: { errors?: ReadonlyArray<unknown> } }
  handleChange: (value: string) => void
  handleBlur: () => void
}

function FormImpl({ mode, onReady }: { mode: 'change' | 'blur'; onReady: (f: TForm) => void }) {
  const form = useTanstackForm(mode)
  onReady(form)
  const Field = form.Field
  return jsx('form', {
    children: FIELD_NAMES.map((name) =>
      jsx(
        Field,
        {
          name,
          children: (field: FieldRender) =>
            jsxs('div', {
              children: [
                jsx('input', {
                  'data-field': name,
                  value: field.state.value,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value),
                  onBlur: field.handleBlur,
                }),
                jsx('span', { 'data-error': name, children: fieldError(field.state.meta) }),
              ],
            }),
        },
        name,
      ),
    ),
  })
}

interface Mounted {
  form: TForm
  root: Root
  dispose: () => void
}

function mountForm(container: HTMLElement, mode: 'change' | 'blur'): Mounted {
  let captured: TForm | undefined
  const root = createRoot(container)
  flushSync(() => {
    root.render(jsx(FormImpl, { mode, onReady: (f: TForm) => (captured = f) }))
  })
  return {
    form: captured as TForm,
    root,
    dispose: () => {
      root.unmount()
      container.innerHTML = ''
    },
  }
}

export async function runTanstack(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: 'TanStack Form', container, results: [] }

  // ── mount-12-fields ──────────────────────────────────────────────────────
  {
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

  // ── keystroke-blur ───────────────────────────────────────────────────────
  {
    const { form, dispose } = mountForm(container, 'blur')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) flushSync(() => setInput(input, TYPED.slice(0, i)))
    }, {
      reset: async () => {
        flushSync(() => setInput(input, ''))
        await settle()
      },
      verify: () => expectLibraryValue('keystroke-blur', form.getFieldValue('email'), TYPED),
    })
    dispose()
  }

  // ── keystroke-change ─────────────────────────────────────────────────────
  {
    const { form, dispose } = mountForm(container, 'change')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-change', suite, async () => {
      // One keystroke = dispatch, commit, then let its async validation settle
      // (see runner.ts `settle`) — identical in every column.
      for (let i = 1; i <= TYPED.length; i++) {
        flushSync(() => setInput(input, TYPED.slice(0, i)))
        await settle()
      }
    }, {
      reset: async () => {
        flushSync(() => setInput(input, ''))
        await settle()
      },
      verify: (c) => {
        expectLibraryValue('keystroke-change', form.getFieldValue('email'), TYPED)
        expectEmailError(c)
      },
    })
    dispose()
  }

  // ── reset-dirty-form ─────────────────────────────────────────────────────
  {
    const { form, dispose } = mountForm(container, 'blur')
    await bench('reset-dirty-form', suite, () => {
      flushSync(() => form.reset())
    }, {
      reset: async () => {
        const dirty = validValues()
        flushSync(() => {
          for (const name of FIELD_NAMES) form.setFieldValue(name, dirty[name])
        })
        await settle()
        expectDirtyDom(container, dirty)
      },
      verify: expectResetDom,
    })
    dispose()
  }

  return suite
}
