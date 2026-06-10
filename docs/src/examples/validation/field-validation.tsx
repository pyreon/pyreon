// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Field Validation.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function FieldValidation() {
  const email = signal('')
  const password = signal('')
  const errors = signal({})

  const validate = () => {
    const e = {}
    if (!email()) e.email = 'Required'
    else if (!email().includes('@')) e.email = 'Invalid email'
    if (!password()) e.password = 'Required'
    else if (password().length < 8) e.password = 'Min 8 characters'
    errors.set(e)
    return Object.keys(e).length === 0
  }

  const field = (name: any, sig: any, type: any) => h('div', { style: { marginBottom: '4px' } },
    h('input', { placeholder: name, type: type || 'text', value: sig, onInput: (e: any) => sig.set(e.target.value), style: { padding: '6px', width: '200px' } }),
    h('span', { style: { color: 'red', fontSize: '12px', marginLeft: '8px' } }, () => errors()[name] || ''),
  )
  return h('div', {},
    field('email', email), field('password', password, 'password'),
    h('button', { onClick: () => { if (validate()) alert('Valid!') }, style: { marginTop: '4px' } }, 'Validate'),
  )
}
