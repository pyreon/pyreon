import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Field validation — error gating on blur.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function FieldValidationErrorGatingOnBlur() {
  // The real @pyreon/form supplies useForm() + field-level state.
  // Distilled here to signals: value, touched, derived error.
  const email = signal('')
  const touched = signal(false)
  const submitted = signal('')

  const error = computed(() => {
    const v = email().trim()
    if (!v) return 'Email is required.'
    if (!v.includes('@')) return 'Email must contain an @.'
    return ''
  })
  const showError = computed(() => touched() && error())

  const submit = (e: any) => {
    e?.preventDefault?.()
    touched.set(true)
    if (error()) return
    submitted.set('✔ Submitted: ' + email())
  }

  return h('form', { onSubmit: submit, class: 'col' },
    h('div', { class: 'row' },
      h('input', {
        type: 'email',
        placeholder: 'you@example.com',
        style: { flex: 1, minWidth: '0' },
        onInput: (e: any) => email.set(e.target.value),
        onBlur: () => touched.set(true),
      }),
      h('button', { type: 'submit' }, 'Submit'),
    ),
    h('div', {
      class: 'muted',
      style: () => ({ color: showError() ? '#FF1F8C' : null, minHeight: '18px' }),
    }, () => showError() || ' '),
    h('div', { class: 'badge', style: () => ({ display: submitted() ? 'inline-flex' : 'none' }) },
      () => submitted(),
    ),
  )
}
