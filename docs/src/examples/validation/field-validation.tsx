import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { ValidationError } from '@pyreon/validation'
import { standardSchemaToValidator } from '@pyreon/validation'
import { z } from 'zod'

interface Values {
  email: string
  password: string
  [key: string]: unknown
}

// Any Standard-Schema-compliant library works here with NO adapter — zod,
// valibot, arktype all expose `~standard`. `standardSchemaToValidator`
// bridges it to a plain `(values) => Record<field, message>` function; this
// is the same bridge `@pyreon/form`'s `useForm({ schema })` uses internally.
const schema = z.object({
  email: z.string().min(1, 'Required').email('Invalid email'),
  password: z.string().min(1, 'Required').min(8, 'Min 8 characters'),
})
const validate = standardSchemaToValidator<Values>(schema)

/**
 * The live counterpart to the `@pyreon/validation` docs — a REAL zod
 * schema run through the library-agnostic `standardSchemaToValidator`
 * bridge, not a hand-rolled if/else chain.
 */
export default function FieldValidation() {
  const email = signal('')
  const password = signal('')
  const errors = signal<Partial<Record<keyof Values, ValidationError>>>({})

  const runValidation = () => {
    const result = validate({ email: email(), password: password() })
    // Sync fast-path for zod: `result` is a plain record, not a Promise.
    if (result instanceof Promise) {
      void result.then((e) => errors.set(e))
      return false
    }
    errors.set(result)
    return Object.keys(result).length === 0
  }

  const field = (name: keyof Values, sig: typeof email, type?: string) =>
    h('div', { style: { marginBottom: '4px' } },
      h('input', {
        placeholder: name,
        type: type ?? 'text',
        value: sig,
        onInput: (e: Event) => sig.set((e.target as HTMLInputElement).value),
        style: { padding: '6px', width: '200px' },
      }),
      h('span', { style: { color: 'red', fontSize: '12px', marginLeft: '8px' } }, () => errors()[name] ?? ''),
    )

  return h('div', {},
    field('email', email),
    field('password', password, 'password'),
    h('button', {
      onClick: () => { if (runValidation()) alert('Valid!') },
      style: { marginTop: '4px' },
    }, 'Validate'),
  )
}
