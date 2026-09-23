/**
 * SolidJS impl — idiomatic `@modular-forms/solid` (the Solid signal-form lib;
 * the true fine-grained-signal peer to Pyreon).
 *
 * modular-forms is JSX-component-based (`<Field>` render-props). The DOM is
 * written as babel-preset-solid 1.9.15's emit for the idiomatic TSX — compiled
 * through the preset in node_modules and copied, not assumed:
 *
 *   <form>{FIELD_NAMES.map((name) =>
 *     <Field name={name}>{(field, props) =>
 *       <div>
 *         <input {...props} data-field={name} value={field.value ?? ''} />
 *         <span data-error={name}>{field.error}</span>
 *       </div>}
 *     </Field>)}
 *   </form>
 *
 * i.e. a cloned `<template>`, `spread(mergeProps(props, {...}))` for the
 * input (Solid's real event delegation + property assignment) and `insert`
 * for the error text. It used to be hand-built with `document.createElement`
 * + per-node `addEventListener` + `createRenderEffect`, which is not what any
 * Solid app ships (no template cloning, no delegation) — a handicap on Solid.
 * Writing the emit out keeps a second JSX transform out of the shared Vite
 * config.
 *
 * Solid renders synchronously (signals patch on write), so there is no commit
 * boundary — the DOM is committed when `fn()` returns (no `commit` hook), same
 * as Pyreon.
 */
import { createComponent, insert, mergeProps, render, setAttribute, spread, template } from 'solid-js/web'
import { createForm, getValue, reset, setValue, zodForm } from '@modular-forms/solid'
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

interface SolidApi {
  getValue: (name: FieldName) => unknown
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

// Exactly as babel-preset-solid emits them.
const _tmpl$ = template(`<div><input><span>`)
const _tmpl$2 = template(`<form>`)
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
      getValue: (name) => getValue(form, name),
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
        children: (field, props) =>
          (() => {
            const _el$ = _tmpl$() as HTMLDivElement
            const _el$2 = _el$.firstChild as HTMLInputElement
            const _el$3 = _el$2.nextSibling as HTMLSpanElement
            spread(
              _el$2,
              mergeProps(props, {
                'data-field': name,
                get value() {
                  return field.value ?? ''
                },
              }),
              false,
              false,
            )
            setAttribute(_el$3, 'data-error', name)
            insert(_el$3, () => field.error)
            return _el$
          })(),
      })

    const _el$4 = _tmpl$2() as HTMLFormElement
    insert(_el$4, () => FIELD_NAMES.map(renderField))
    return _el$4
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
    const { api, dispose } = mountForm(container, 'blur')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) setInput(input, TYPED.slice(0, i))
    }, {
      reset: async () => {
        setInput(input, '')
        await settle()
      },
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
        await settle()
      }
    }, {
      reset: async () => {
        setInput(input, '')
        await settle()
      },
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
    await bench('reset-dirty-form', suite, () => {
      api.reset()
    }, {
      reset: async () => {
        const dirty = validValues()
        for (const name of FIELD_NAMES) api.setValue(name, dirty[name])
        await settle()
        expectDirtyDom(container, dirty)
      },
      verify: expectResetDom,
    })
    dispose()
  }

  return suite
}
