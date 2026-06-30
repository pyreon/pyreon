/**
 * SolidJS impl — idiomatic `@modular-forms/solid` (the Solid signal-form lib;
 * the true fine-grained-signal peer to Pyreon, which "may tie").
 *
 * modular-forms is JSX-component-based (`<Field>` render-props). To avoid a
 * Solid-JSX transform fighting Pyreon's in the shared Vite config, we drive its
 * `Field` component through Solid's low-level `createComponent` + build the DOM
 * with `document.createElement` + `createRenderEffect` (the same no-JSX strategy
 * examples/benchmark's Solid entry uses with `template`/`insert`). The form
 * model + validation are still 100% modular-forms — only the element creation is
 * lowered by hand instead of by the Solid JSX compiler.
 *
 * Solid renders synchronously (signals patch on write), so there is no commit
 * boundary — the DOM is committed when `fn()` returns (no `commit` hook), same
 * as Pyreon.
 */
import { createComponent, createRenderEffect } from 'solid-js'
import { insert, render } from 'solid-js/web'
import { createForm, reset, setValue, zodForm } from '@modular-forms/solid'
import { setInput, fieldInputCount, visibleErrorCount } from '../dom'
import { bench, type BenchSuite } from '../runner'
import { FIELD_NAMES, emptyValues, formSchema, type FieldName, type FormValues } from '../../shared/schema'

interface SolidApi {
  reset: () => void
  setValue: (name: FieldName, value: string) => void
}
interface Mounted {
  api: SolidApi
  dispose: () => void
}

// modular-forms field-element props we attach by hand (the subset its `Field`
// render-prop hands us — name + the validation event handlers + the registration
// ref). Structural, not `any`.
interface MfFieldProps {
  name: string
  ref: (el: HTMLInputElement) => void
  onInput: (e: Event) => void
  onChange: (e: Event) => void
  onBlur: (e: Event) => void
}
interface MfFieldStore {
  value?: string
  error: string
}

function mountForm(container: HTMLElement, mode: 'change' | 'blur'): Mounted {
  let api: SolidApi | undefined
  const dispose = render(() => {
    const [form, { Field }] = createForm<FormValues>({
      initialValues: emptyValues(),
      // modular-forms@0.25 ships zod-v3 types; the repo is on zod v4, whose
      // ZodObject shape doesn't structurally match its `ZodType` param. Runtime
      // is correct (the build bundles + runs fine) — cast at the version-skew
      // boundary to the param type zodForm declares.
      validate: zodForm(formSchema as unknown as Parameters<typeof zodForm>[0]),
      validateOn: mode === 'change' ? 'input' : 'blur',
    })
    api = {
      reset: () => reset(form),
      setValue: (name, value) => setValue(form, name, value),
    }
    // modular-forms' `Field` carries heavy generics that don't infer through
    // `createComponent` without the Solid JSX transform. ONE localized cast to
    // its documented runtime render-prop signature (store, element-props) — same
    // "framework-primitive shape cast" exception as `as unknown as VNodeChild`;
    // after the cast, the children body below is fully type-checked.
    const TypedField = Field as unknown as (props: {
      name: FieldName
      children: (field: MfFieldStore, props: MfFieldProps) => Node
    }) => Node

    const renderField = (name: FieldName) =>
      createComponent(TypedField, {
        name,
        children: (field, props) => {
          const div = document.createElement('div')
          const input = document.createElement('input')
          input.setAttribute('data-field', name)
          input.setAttribute('name', name)
          props.ref(input)
          input.addEventListener('input', props.onInput)
          input.addEventListener('change', props.onChange)
          input.addEventListener('blur', props.onBlur)
          createRenderEffect(() => {
            input.value = field.value ?? ''
          })
          const span = document.createElement('span')
          span.setAttribute('data-error', name)
          createRenderEffect(() => {
            span.textContent = field.error ?? ''
          })
          div.append(input, span)
          return div
        },
      })

    const formEl = document.createElement('form')
    // Mount the Field components via Solid's `insert` (NOT imperative append):
    // createComponent's output is a reactive Solid node that must be attached
    // through `insert` to actually render + track. One insert with the full
    // 12-field array mounts them all as children of <form>.
    insert(formEl, () => FIELD_NAMES.map(renderField))
    return formEl
  }, container)
  return {
    api: api as SolidApi,
    dispose: () => {
      dispose()
      container.innerHTML = ''
    },
  }
}

const TYPED = 'abcdefghijkl'

export async function runSolid(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: 'Solid (modular-forms)', container, results: [] }

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

  // ── keystroke-change ─────────────────────────────────────────────────────
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

  // ── reset-dirty-form ─────────────────────────────────────────────────────
  {
    const { api, dispose } = mountForm(container, 'blur')
    await bench('reset-dirty-form', suite, () => {
      api.reset()
    }, {
      reset: () => {
        for (const name of FIELD_NAMES) api.setValue(name, 'dirty')
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
