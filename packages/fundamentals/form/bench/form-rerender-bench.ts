#!/usr/bin/env bun
/**
 * Re-render benchmark — @pyreon/form vs Formik vs react-hook-form.
 *
 * react-hook-form and Formik are React-render-coupled: their real cost is
 * COMPONENT RE-RENDERS per keystroke, not headless wall-clock (that's the
 * separate `form-bench.ts`). This harness counts component renders while
 * typing into ONE field of a 20-field form, using each library's IDIOMATIC
 * pattern:
 *   - Formik: controlled inputs via `useFormik` (its default model).
 *   - react-hook-form: uncontrolled inputs via `register` (its default model).
 *   - Pyreon: `register` + per-field signals.
 *
 * Render count is DETERMINISTIC (not wall-clock) so the result is stable and
 * reproducible. It is the architectural signal:
 *   - Formik re-renders the form component on every keystroke (form state
 *     lives in the component) → O(keystrokes) full-form re-renders.
 *   - react-hook-form is uncontrolled → ~0 re-renders, but you GIVE UP
 *     reactive value binding (read via getValues/watch on demand).
 *   - Pyreon's signals patch the bound text node directly → 0 component
 *     re-renders, WHILE keeping values reactively bound (the best of both).
 *
 * Run: bun bench/form-rerender-bench.ts
 */
process.env.NODE_ENV = 'production'

import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()
// Suppress React 19's "update not wrapped in act(...)" warning — we drive
// commits synchronously via flushSync, which is the correct bench primitive.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

const FIELD_COUNT = 20
const KEYSTROKES = 10
const fieldNames = Array.from({ length: FIELD_COUNT }, (_, i) => `field${i}`)
const emptyValues = (): Record<string, string> => Object.fromEntries(fieldNames.map((n) => [n, '']))

// ── React harness (Formik + react-hook-form) ────────────────────────────
async function reactRenderCount(which: 'formik' | 'rhf'): Promise<number> {
  const React = (await import('react')).default
  const { createElement: h } = React
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')

  let renders = 0

  let Form: () => unknown
  if (which === 'formik') {
    const { useFormik } = await import('formik')
    Form = function FormikForm() {
      renders++
      const formik = useFormik({ initialValues: emptyValues(), onSubmit: () => {} })
      return h(
        'form',
        null,
        fieldNames.map((name) =>
          h('input', {
            key: name,
            name,
            'data-testid': name,
            value: (formik.values as Record<string, string>)[name],
            onChange: formik.handleChange,
          }),
        ),
      )
    }
  } else {
    const { useForm } = await import('react-hook-form')
    Form = function RHFForm() {
      renders++
      const { register } = useForm({ defaultValues: emptyValues() })
      return h(
        'form',
        null,
        fieldNames.map((name) => h('input', { key: name, 'data-testid': name, ...register(name) })),
      )
    }
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => {
    root.render(h(Form))
  })
  renders = 0 // reset — count only keystroke-driven renders

  const input = container.querySelector(`[data-testid="${fieldNames[0]}"]`) as HTMLInputElement
  for (let k = 0; k < KEYSTROKES; k++) {
    flushSync(() => {
      const proto = Object.getPrototypeOf(input)
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      setter?.call(input, 'x'.repeat(k + 1))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  root.unmount()
  container.remove()
  return renders
}

// ── Pyreon harness ──────────────────────────────────────────────────────
async function pyreonRenderCount(): Promise<number> {
  const { h } = await import('@pyreon/core')
  const { mount } = await import('@pyreon/runtime-dom')
  const { useForm } = await import('../src/index')

  let renders = 0
  function PyreonForm() {
    renders++
    const form = useForm({ initialValues: emptyValues(), onSubmit: () => {} })
    return h(
      'form',
      null,
      ...fieldNames.map((name) => {
        const props = form.register(name) as { value: () => string; onInput: (e: Event) => void; onBlur: () => void }
        return h('input', { 'data-testid': name, value: () => props.value(), onInput: props.onInput, onBlur: props.onBlur })
      }),
    )
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const dispose = mount(h(PyreonForm), container)
  renders = 0 // reset — count only keystroke-driven component re-runs

  const input = container.querySelector(`[data-testid="${fieldNames[0]}"]`) as HTMLInputElement
  for (let k = 0; k < KEYSTROKES; k++) {
    input.value = 'x'.repeat(k + 1)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  if (typeof dispose === 'function') dispose()
  container.remove()
  return renders
}

// ── run + report ────────────────────────────────────────────────────────
const formik = await reactRenderCount('formik')
const rhf = await reactRenderCount('rhf')
const pyreon = await pyreonRenderCount()

console.log(`\nForm re-render benchmark — component renders for ${KEYSTROKES} keystrokes into 1 field of a ${FIELD_COUNT}-field form`)
console.log(`(deterministic render COUNT; lower = fewer re-renders = less work per keystroke)\n`)
console.log(`  Pyreon          : ${pyreon}   (signals patch the bound node — 0 component re-renders, values still reactive)`)
console.log(`  react-hook-form : ${rhf}   (uncontrolled refs — ~0 re-renders, but values not reactively bound)`)
console.log(`  Formik          : ${formik}   (controlled — re-renders the form on every keystroke)\n`)
console.log(JSON.stringify({ keystrokes: KEYSTROKES, fieldCount: FIELD_COUNT, renders: { pyreon, rhf, formik } }, null, 0))
