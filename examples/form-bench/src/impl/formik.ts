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
 * Written as the automatic JSX runtime's output (`jsx`/`jsxs`, esbuild
 * `jsx: 'automatic'` emit, diffed) — same as the RHF impl. Commit
 * boundary: `flushSync` so the controlled re-render commits inside the timed
 * region (CPU-objective; see METHODOLOGY.md).
 */
import { useFormik } from 'formik'
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
import { FIELD_NAMES, emptyValues, formSchema, validValues, type FieldName, type FormValues } from '../../shared/schema'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

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
  return jsx('form', {
    children: FIELD_NAMES.map((name) =>
      jsxs(
        'div',
        {
          children: [
            jsx('input', {
              'data-field': name,
              name,
              value: formik.values[name],
              onChange: formik.handleChange,
              onBlur: formik.handleBlur,
            }),
            jsx('span', { 'data-error': name, children: (formik.touched[name] && formik.errors[name]) || '' }),
          ],
        },
        name,
      ),
    ),
  })
}

interface Mounted {
  formik: Formik
  /** The LATEST render's `useFormik` return. `formik` above is the first
   *  render's object, whose `values`/`errors` are a stale snapshot (its
   *  callbacks are stable, so calling them is fine). */
  latest: () => Formik
  root: Root
  dispose: () => void
}

function mountForm(container: HTMLElement, validateOnChange: boolean): Mounted {
  let captured: Formik | undefined
  let latest: Formik | undefined
  const root = createRoot(container)
  flushSync(() => {
    root.render(
      jsx(FormImpl, {
        validateOnChange,
        onReady: (f: Formik) => {
          captured ??= f
          latest = f
        },
      }),
    )
  })
  return {
    formik: captured as Formik,
    latest: () => latest as Formik,
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
    const { latest, dispose } = mountForm(container, false)
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) flushSync(() => setInput(input, TYPED.slice(0, i)))
    }, {
      reset: async () => {
        flushSync(() => setInput(input, ''))
        await settle()
      },
      verify: () => expectLibraryValue('keystroke-blur', latest().values.email, TYPED),
    })
    dispose()
  }

  // ── keystroke-change (validate every keystroke) ──────────────────────────
  {
    const { formik, latest, dispose } = mountForm(container, true)
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    // Idiomatic Formik renders an error only once the field is TOUCHED (set on
    // blur), so an untouched field in change mode validates but renders no
    // error — one fewer DOM write per run than every other column. Mark the
    // field touched (untimed, no validation) so all columns render the error.
    flushSync(() => void formik.setFieldTouched('email', true, false))
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
        expectLibraryValue('keystroke-change', latest().values.email, TYPED)
        expectEmailError(c)
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
      reset: async () => {
        const dirty = validValues()
        flushSync(() => {
          for (const name of FIELD_NAMES) void formik.setFieldValue(name, dirty[name])
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
