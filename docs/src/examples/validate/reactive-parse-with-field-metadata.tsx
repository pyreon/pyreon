import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { getMeta, parseReactive, withField } from '@pyreon/validate'
import { z } from 'zod'

// withField() attaches Pyreon metadata (label/placeholder/hint) to ANY
// Standard Schema — via a Symbol-keyed property, so the schema is STILL
// a real Zod schema afterwards (.parse() / .optional() / etc. all work,
// and JSON.stringify/for-in never see the metadata). Read it back with
// getMeta(), not a plain property access.
const emailSchema = withField(z.string().email('Enter a valid email'), {
  label: 'Email address',
  placeholder: 'you@example.com',
  hint: 'We never share your email',
})
const meta = getMeta(emailSchema)!

/**
 * The live counterpart to the "Quick start" snippet on the Validate docs
 * page — a REAL Zod schema, decorated with `withField`, reactively
 * re-validated via `parseReactive` on every keystroke. `parseReactive`
 * allocates ONE `Computed` for the (schema, source) pair, at setup — not
 * per render.
 */
export default function ReactiveParseWithFieldMetadata() {
  const email = signal('')
  const result = parseReactive(emailSchema, email)

  return h('div', { class: 'col' },
    h('label', { class: 'col', style: { gap: '4px' } },
      h('span', { class: 'muted', style: { fontSize: '13px' } }, meta.label),
      h('input', {
        type: 'text',
        placeholder: meta.placeholder,
        style: { width: '240px' },
        value: email,
        onInput: (e: Event) => email.set((e.target as HTMLInputElement).value),
      }),
      h('span', { class: 'muted', style: { fontSize: '11px' } }, meta.hint),
    ),
    h('div', { style: { marginTop: '8px' } }, () => {
      if (email() === '') return null
      const r = result()
      return r.issues
        ? h('span', { style: { color: '#FF1F8C', fontSize: '13px' } }, r.issues[0]?.message)
        : h('span', { style: { color: '#4ade80', fontSize: '13px' } }, '✓ valid — ' + r.value)
    }),
  )
}
