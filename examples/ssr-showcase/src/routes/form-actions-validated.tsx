/**
 * Typed server-action input — `defineAction(schema, handler)` validates the
 * form fields with a Standard Schema before the handler runs; an invalid
 * input answers 422 with per-field messages and never reaches the handler.
 * Driven by `e2e/ssr-node.spec.ts`. The schema is hand-written against the
 * Standard Schema contract so the example needs no validation library; zod,
 * valibot, arktype and `@pyreon/validate` plug in the same way.
 */
import type { StandardSchemaV1 } from '@pyreon/zero/actions'
import { defineAction, Form, useSubmission } from '@pyreon/zero/actions'

const signupSchema: StandardSchemaV1<{ email: string; age: string }, { email: string; age: number }> = {
  '~standard': {
    version: 1,
    vendor: 'ssr-showcase',
    validate(value) {
      const v = (value ?? {}) as Record<string, unknown>
      const issues: StandardSchemaV1.Issue[] = []
      const email = typeof v.email === 'string' ? v.email.trim() : ''
      if (!email.includes('@')) issues.push({ message: 'Enter an email address', path: ['email'] })
      const age = Number(v.age)
      if (!Number.isInteger(age) || age < 13) issues.push({ message: 'Must be 13 or older', path: ['age'] })
      return issues.length ? { issues } : { value: { email, age } }
    },
  },
}

export const action = defineAction(signupSchema, async (input) => ({
  welcome: `${input.email} (${input.age + 1} next year)`,
}))

export default function ValidatedActionPage() {
  const sub = useSubmission(action)
  const field = (name: string) => () =>
    (sub.result() as { fields?: Record<string, string[]> } | undefined)?.fields?.[name]?.join(', ') ?? ''
  return (
    <div data-testid="validated-page">
      <h1>Validated action</h1>
      <Form action={action} data-testid="signup-form">
        <input name="email" data-testid="email-input" />
        <p data-testid="email-error">{field('email')}</p>
        <input name="age" data-testid="age-input" />
        <p data-testid="age-error">{field('age')}</p>
        <button type="submit" data-testid="signup">Sign up</button>
      </Form>
      <p data-testid="welcome">
        {() => (sub.result() as { welcome?: string } | undefined)?.welcome ?? 'none'}
      </p>
    </div>
  )
}
