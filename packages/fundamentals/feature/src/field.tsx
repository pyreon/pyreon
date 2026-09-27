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
  // `email` / `url` come from the schema's own string FORMAT
  // (`z.string().email()` / `z.email()`), never from the field NAME — guessing
  // from the name would silently mistype a field called `emailVerified`.
  if (info.format === 'email') return 'email'
  if (info.format === 'url') return 'url'
  return 'text'
}

/** A Date (or ISO string) → the `yyyy-mm-dd` an `<input type="date">` shows. */
function toDateInputValue(v: unknown): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'string') return v.slice(0, 10)
  return ''
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
      register: (n: string, o?: { type: 'checkbox' | 'number' }) => Record<string, unknown>
      labelProps: (n: string) => Record<string, unknown>
      errorProps: (n: string) => Record<string, unknown>
      fields: Record<
        string,
        {
          error: () => unknown
          touched: () => boolean
          value: () => unknown
          setValue: (v: unknown) => void
        }
      >
    }
    // Defined whenever we get past `form.register(name)` below, which throws
    // the actionable unknown-field error first.
    const state = form.fields[info.name]!
    const name = info.name
    const inputType = props.type ?? inputTypeFor(info)
    // Required is conveyed PROGRAMMATICALLY, not only by the visual " *" (which
    // a screen reader reads as "star", if at all). `aria-required` rather than
    // native `required`: the native attribute makes the BROWSER block the
    // submit event with its own bubble, so the form's validation and error
    // UI would never run.
    const a11y = info.optional ? {} : { 'aria-required': 'true' }

    // Bind the control so the VALUE TYPE matches the schema:
    //  - number → `register(name, { type: 'number' })` (valueAsNumber). A plain
    //    `register(name)` stored the input's string ("42"), and `z.number()`
    //    rejected every submit.
    //  - date → a Date. `z.date()` rejects the `yyyy-mm-dd` string the input
    //    produces, so the value is converted in and out here.
    const textBinding = (): Record<string, unknown> => {
      if (inputType === 'number') {
        return { ...form.register(name, { type: 'number' }), inputmode: 'decimal' }
      }
      if (inputType === 'date' && info.type === 'date') {
        const base = form.register(name)
        return {
          ...base,
          value: () => toDateInputValue(state.value()),
          onInput: (e: Event) => {
            const raw = (e.target as HTMLInputElement).value
            // `new Date('yyyy-mm-dd')` is UTC midnight, and `toDateInputValue`
            // reads it back in UTC — a stable round trip in every timezone.
            state.setValue(raw ? new Date(raw) : undefined)
          },
        }
      }
      return form.register(name)
    }

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
                ...a11y,
                ...(props.inputClass !== undefined ? { class: props.inputClass } : {}),
              },
              (props.options ?? info.enumValues ?? []).map((v) =>
                h('option', { value: String(v) }, String(v)),
              ),
            )
          : h('input', {
              type: inputType,
              ...textBinding(),
              ...a11y,
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
          const touched = state.touched()
          const err = state.error()
          return touched && err ? String(err) : ''
        },
      ),
    )
  }
}
