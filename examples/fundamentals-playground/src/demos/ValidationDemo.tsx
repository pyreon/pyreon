import { useField, useForm } from '@pyreon/form'
import { signal } from '@pyreon/reactivity'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

const schema = z.object({
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(20, 'At most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, underscores'),
  email: z.string().email('Invalid email address'),
  age: z.coerce.number().min(13, 'Must be at least 13').max(150, 'Invalid age'),
})

export function ValidationDemo() {
  const submitted = signal<string | null>(null)

  const form = useForm({
    initialValues: { username: '', email: '', age: '' as unknown as number },
    schema: zodSchema(schema as any),
    validateOn: 'blur',
    onSubmit: async (values) => {
      await new Promise((r) => setTimeout(r, 300))
      submitted.set(JSON.stringify(values, null, 2))
    },
  })

  const username = useField(form, 'username')
  const email = useField(form, 'email')
  const age = useField(form, 'age')

  return (
    <div>
      <h2>Validation</h2>
      <p class="desc">
        Schema-based form validation with Zod. Validates on blur, shows errors per field.
      </p>

      <div class="section">
        <h3>Zod Schema Form</h3>
        <form onSubmit={(e: Event) => form.handleSubmit(e)}>
          <div class="field">
            <label>Username</label>
            <input placeholder="Letters, numbers, _ only" {...username.register()} />
            {() => (username.showError() ? <div class="error">{username.error()}</div> : null)}
          </div>

          <div class="field">
            <label>Email</label>
            <input type="email" placeholder="you@example.com" {...email.register()} />
            {() => (email.showError() ? <div class="error">{email.error()}</div> : null)}
          </div>

          <div class="field">
            <label>Age</label>
            <input type="number" placeholder="13+" {...age.register()} />
            {() => (age.showError() ? <div class="error">{age.error()}</div> : null)}
          </div>

          <div class="row">
            <button class="primary" type="submit" disabled={form.isSubmitting()}>
              {() => (form.isSubmitting() ? 'Validating...' : 'Submit')}
            </button>
            <button type="button" onClick={() => form.reset()}>
              Reset
            </button>
          </div>
        </form>
      </div>

      {() =>
        submitted() ? (
          <div class="section">
            <h3>Validated Data</h3>
            <pre style="font-size: 13px; color: #2e7d32">{submitted()}</pre>
          </div>
        ) : null
      }
    </div>
  )
}
