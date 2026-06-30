/**
 * Formik impl — idiomatic Formik (controlled inputs via `useFormik`).
 *
 * Formik's model is CONTROLLED: form state lives in the component and every
 * keystroke re-renders the whole form. That's the architectural opposite of
 * RHF (uncontrolled) and Pyreon (signals) — exactly the contrast worth
 * measuring. We use Formik's default controlled pattern (no escape hatches).
 *
 * Shared-schema fairness: Formik doesn't take zod natively, so instead of
 * pulling a third-party adapter we run the SAME `formSchema` in a manual
 * `validate` fn (zod issues → Formik's flat errors object). Identical
 * validation work to every other column; no extra dependency.
 *
 * Built with `React.createElement` (no JSX) — same as the RHF impl. Commit
 * boundary: `flushSync` so the controlled re-render commits inside the timed
 * region (CPU-objective; see METHODOLOGY.md).
 */
import { useFormik } from 'formik'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { setInput, fieldInputCount, visibleErrorCount } from '../dom'
import { bench, type BenchSuite } from '../runner'
import { FIELD_NAMES, emptyValues, formSchema, type FieldName, type FormValues } from '../../shared/schema'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

const rc = React.createElement
type Formik = ReturnType<typeof useFormik<FormValues>>

/** A 12-keystroke word per timed run — matches every other impl. */
const TYPED = 'abcdefghijkl'

/** The SHARED zod schema mapped to Formik's flat `{ field: message }` errors. */
function zodValidate(values: FormValues): Partial<Record<FieldName, string>> {
  const res = formSchema.safeParse(values)
  if (res.success) return {}
  const errs: Partial<Record<FieldName, string>> = {}
  for (const issue of res.error.issues) {
    const k = issue.path[0] as FieldName | undefined
    if (k && !errs[k]) errs[k] = issue.message
  }
  return errs
}

function FormImpl({ validateOnChange, onReady }: { validateOnChange: boolean; onReady: (f: Formik) => void }) {
  const formik = useFormik<FormValues>({
    initialValues: emptyValues(),
    validate: zodValidate,
    validateOnChange,
    validateOnBlur: true,
    onSubmit: () => {},
  })
  onReady(formik)
  return rc(
    'form',
    null,
    FIELD_NAMES.map((name) =>
      rc(
        'div',
        { key: name },
        rc('input', {
          'data-field': name,
          name,
          value: formik.values[name],
          onChange: formik.handleChange,
          onBlur: formik.handleBlur,
        }),
        rc('span', { 'data-error': name }, (formik.touched[name] && formik.errors[name]) || ''),
      ),
    ),
  )
}

interface Mounted {
  formik: Formik
  root: Root
  dispose: () => void
}

function mountForm(container: HTMLElement, validateOnChange: boolean): Mounted {
  let captured: Formik | undefined
  const root = createRoot(container)
  flushSync(() => {
    root.render(rc(FormImpl, { validateOnChange, onReady: (f) => (captured = f) }))
  })
  return {
    formik: captured as Formik,
    root,
    dispose: () => {
      root.unmount()
      container.innerHTML = ''
    },
  }
}

export async function runFormik(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: 'Formik', container, results: [] }

  // ── mount-12-fields ──────────────────────────────────────────────────────
  {
    const live: Mounted[] = []
    await bench('mount-12-fields', suite, () => {
      live.push(mountForm(container, false))
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

  // ── keystroke-blur (validateOnChange:false — but controlled still re-renders) ─
  {
    const { dispose } = mountForm(container, false)
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) flushSync(() => setInput(input, TYPED.slice(0, i)))
    }, {
      reset: () => flushSync(() => setInput(input, '')),
      verify: () => {
        if (input.value !== TYPED) throw new Error('keystroke-blur: value not committed')
      },
    })
    dispose()
  }

  // ── keystroke-change (validate every keystroke) ──────────────────────────
  {
    const { dispose } = mountForm(container, true)
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-change', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) flushSync(() => setInput(input, TYPED.slice(0, i)))
    }, {
      reset: () => flushSync(() => setInput(input, '')),
      verify: () => {
        if (input.value !== TYPED) throw new Error('keystroke-change: value not committed')
      },
    })
    dispose()
  }

  // ── reset-dirty-form ─────────────────────────────────────────────────────
  {
    const { formik, dispose } = mountForm(container, false)
    await bench('reset-dirty-form', suite, () => {
      flushSync(() => formik.resetForm())
    }, {
      reset: () =>
        flushSync(() => {
          for (const name of FIELD_NAMES) formik.setFieldValue(name, 'dirty')
        }),
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
