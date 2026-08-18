/**
 * `<Field>` — render one form field from the schema.
 *
 * `defineFeature` already derives `fields: FieldInfo[]` from the schema: name,
 * type, optionality, enum values and a human label. Until now nothing consumed
 * it, so every app hand-wrote the markup the schema had already described.
 *
 * This is deliberately PER-FIELD rather than a whole-form renderer. Generated
 * forms are excellent right up until a designer wants one field different, at
 * which point an all-or-nothing component is worse than the markup it replaced.
 * A per-field component keeps the author's own layout around it, lets them
 * replace exactly one field with hand-written markup, and gives a future
 * whole-form renderer a real layer to sit on rather than a special case.
 */
import { h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import type { FormState } from '@pyreon/form'
import type { FieldInfo } from './schema'

/** Props accepted by a feature-bound `<Field>`. */
export interface FieldProps<TValues extends Record<string, unknown>> {
  /** The form returned by `feature.useForm()`. */
  form: FormState<TValues>
  /** Which schema field to render. */
  name: keyof TValues & string
  /** Override the label derived from the field name. */
  label?: string
  /** Override the input type derived from the field's schema type. */
  type?: string
  /** Override the `<option>` list for an enum field. */
  options?: readonly (string | number)[]
  /** Class for the wrapper element. */
  class?: string
  /** Class for the control itself. */
  inputClass?: string
  /** Placeholder for text-like controls. */
  placeholder?: string
}

/** Map a schema field type to an `<input type=…>`. */
function inputTypeFor(info: FieldInfo): string {
  if (info.type === 'number') return 'number'
  if (info.type === 'date') return 'date'
  // `email`/`url` are not distinguishable from `string` through duck-typed
  // introspection, so text is the honest default — an author overrides via
  // `type` rather than the component guessing from the field NAME, which would
  // silently mistype a field called `emailVerified`.
  return 'text'
}

/**
 * Build the `<Field>` component bound to a feature's schema fields.
 *
 * Bound rather than free-standing so the call site is `<Feature.Field
 * form={form} name="title" />` — the feature already knows its fields, so the
 * author never threads a `FieldInfo` through by hand.
 */
export function createFieldComponent<TValues extends Record<string, unknown>>(
  fields: FieldInfo[],
): (props: FieldProps<TValues>) => VNodeChild {
  const byName = new Map(fields.map((f) => [f.name, f]))

  return function Field(props: FieldProps<TValues>): VNodeChild {
    const info = byName.get(props.name)
    if (!info) {
      // Loud, not silent: a typo'd name would otherwise render an empty div
      // and read as a styling problem.
      throw new Error(
        // NOTE: deliberately not written as a JSX tag. The vite-plugin's
        // auto-import scanner masks comments and strings but NOT template
        // literals, so a `<Field name="…">` here is read as real JSX usage and
        // injects `import { Field } from '@pyreon/primitives'` — which this
        // package does not depend on, breaking every consumer build.
        `[Pyreon] Field: no such field "${String(props.name)}" in the schema. ` +
          `Known fields: ${fields.map((f) => f.name).join(', ') || '(none)'}`,
      )
    }

    const form = props.form as unknown as {
      register: (n: string, o?: { type: 'checkbox' }) => Record<string, unknown>
      labelProps: (n: string) => Record<string, unknown>
      errorProps: (n: string) => Record<string, unknown>
      fields: Record<string, { error: () => unknown; touched: () => boolean }>
    }
    const state = form.fields[info.name]
    const name = info.name

    const control =
      info.type === 'boolean'
        ? h('input', {
            type: 'checkbox',
            ...form.register(name, { type: 'checkbox' }),
            ...(props.inputClass !== undefined ? { class: props.inputClass } : {}),
          })
        : info.type === 'enum'
          ? h(
              'select',
              {
                ...form.register(name),
                ...(props.inputClass !== undefined ? { class: props.inputClass } : {}),
              },
              (props.options ?? info.enumValues ?? []).map((v) =>
                h('option', { value: String(v) }, String(v)),
              ),
            )
          : h('input', {
              type: props.type ?? inputTypeFor(info),
              ...form.register(name),
              ...(props.placeholder !== undefined ? { placeholder: props.placeholder } : {}),
              ...(props.inputClass !== undefined ? { class: props.inputClass } : {}),
            })

    return h(
      'div',
      { class: props.class ?? 'field', 'data-field': name },
      h(
        'label',
        { ...form.labelProps(name) },
        `${props.label ?? info.label}${info.optional ? '' : ' *'}`,
      ),
      control,
      h(
        'span',
        { ...form.errorProps(name) },
        // Read BOTH signals unconditionally. `touched() ? error() : ''` would
        // short-circuit while untouched and never subscribe to `error`, so a
        // validator writing after a submit click would not repaint.
        () => {
          const touched = state?.touched() ?? false
          const err = state?.error()
          return touched && err ? String(err) : ''
        },
      ),
    )
  }
}
