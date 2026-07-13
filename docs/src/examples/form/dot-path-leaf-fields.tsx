import { h } from '@pyreon/core'
import { nestValues, useForm } from '@pyreon/form'
import { signal } from '@pyreon/reactivity'

/**
 * Dot-path LEAF fields — a field key with a dot (`address.city`) is a
 * first-class field: `register` / per-field `validators` / `errors()` all
 * address it, and the error surfaces on the LEAF input. The value model stays
 * flat; `nestValues` converts to a nested API payload on submit.
 */
export default function DotPathLeafFields() {
  const savedPayload = signal('')

  const form = useForm({
    initialValues: { name: '', 'address.city': '', 'address.zip': '' },
    validators: {
      name: (v) => (v ? undefined : 'Name is required.'),
      'address.city': (v) => (v ? undefined : 'City is required.'),
      'address.zip': (v) => (/^\d{5}$/.test(v) ? undefined : 'ZIP must be 5 digits.'),
    },
    onSubmit: (values) => {
      // `values` is FLAT: { name, 'address.city', 'address.zip' }.
      // nestValues() → { name, address: { city, zip } } for the backend.
      savedPayload.set(JSON.stringify(nestValues(values)))
    },
  })

  const fieldRow = (label: string, name: 'name' | 'address.city' | 'address.zip') =>
    h(
      'div',
      { class: 'col', style: { gap: '2px' } },
      h('label', { ...form.labelProps(name) }, label),
      h('input', {
        ...form.register(name),
        placeholder: label,
        style: { padding: '4px 6px' },
      }),
      h(
        'div',
        {
          ...form.errorProps(name),
          class: 'muted',
          style: () => ({
            color: form.fields[name].error() ? '#FF1F8C' : null,
            minHeight: '16px',
            fontSize: '12px',
          }),
        },
        () => form.fields[name].error() ?? ' ',
      ),
    )

  return h(
    'form',
    { onSubmit: form.handleSubmit, class: 'col', style: { gap: '8px', maxWidth: '320px' } },
    fieldRow('Name', 'name'),
    fieldRow('City (address.city)', 'address.city'),
    fieldRow('ZIP (address.zip)', 'address.zip'),
    h('button', { type: 'submit' }, 'Submit'),
    h(
      'pre',
      {
        class: 'badge',
        style: () => ({
          display: savedPayload() ? 'block' : 'none',
          whiteSpace: 'pre-wrap',
          fontSize: '12px',
        }),
      },
      () => `nested payload → ${savedPayload()}`,
    ),
  )
}
