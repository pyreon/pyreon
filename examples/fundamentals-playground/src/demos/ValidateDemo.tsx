import { computed, signal } from '@pyreon/reactivity'
import {
  formatErrors,
  parseReactive,
  s,
  withField,
} from '@pyreon/validate'

// Pyreon's chainable validator (Standard Schema-compliant).
// withField(...) attaches Pyreon-only metadata (label/hint/placeholder/
// i18n keys) on top of any Standard Schema. The wrapped schema retains
// all its native methods.
const usernameSchema = withField(
  s
    .string()
    .min(3, { message: 'Must be at least 3 characters' })
    .max(20, { message: 'Max 20' }),
  { label: 'Username', placeholder: 'pyreon_dev' },
)
const ageSchema = withField(
  s
    .number()
    .min(13, { message: 'Must be at least 13' })
    .max(120, { message: 'Max age 120' }),
  { label: 'Age', hint: 'In years' },
)
const emailSchema = withField(s.string().email({ message: 'Invalid email' }), {
  label: 'Email',
})

export function ValidateDemo() {
  const username = signal('')
  const age = signal<number | string>('')
  const email = signal('')

  // parseReactive returns a Computed<ParseResult> that re-validates on
  // every read of the source signal. issues = invalid; value = valid.
  const usernameResult = parseReactive(usernameSchema, username)
  const ageResult = parseReactive(ageSchema, () => Number(age()) || 0)
  const emailResult = parseReactive(emailSchema, email)

  // computed() — re-derives on any underlying signal change. Computed
  // exposes itself as a tracked dependency on its first read inside a
  // reactive scope; a plain arrow fn doesn't (the compiler can't see
  // through user functions). Mirrors `useFormState` selector usage.
  const allValid = computed(
    () =>
      !usernameResult().issues?.length &&
      !ageResult().issues?.length &&
      !emailResult().issues?.length,
  )

  return (
    <div>
      <h2>Validate</h2>
      <p class="desc">
        Pyreon's Standard Schema-compliant validator with Pyreon-flavoured
        DX: <code>withField()</code> attaches metadata (label/hint/i18n
        keys), <code>parseReactive()</code> returns a Computed that
        re-validates on every source-signal change, and{' '}
        <code>formatErrors()</code> resolves issues through i18n.
      </p>

      <div class="section">
        <h3>Live validation</h3>

        <div class="field">
          <label>Username — min 3, max 20</label>
          <input
            type="text"
            data-testid="validate-username"
            placeholder="pyreon_dev"
            value={() => username()}
            onInput={(e) => username.set(e.currentTarget.value)}
          />
          <div class="error" data-testid="validate-username-err">
            {() => (usernameResult().issues ? formatErrors(usernameResult().issues ?? []) : '')}
          </div>
        </div>

        <div class="field">
          <label>Age — 13-120</label>
          <input
            type="number"
            data-testid="validate-age"
            value={() => String(age())}
            onInput={(e) => age.set(e.currentTarget.value)}
          />
          <div class="error" data-testid="validate-age-err">
            {() => (ageResult().issues ? formatErrors(ageResult().issues ?? []) : '')}
          </div>
        </div>

        <div class="field">
          <label>Email</label>
          <input
            type="text"
            data-testid="validate-email"
            placeholder="you@example.com"
            value={() => email()}
            onInput={(e) => email.set(e.currentTarget.value)}
          />
          <div class="error" data-testid="validate-email-err">
            {() => (emailResult().issues ? formatErrors(emailResult().issues ?? []) : '')}
          </div>
        </div>

        <p>
          Form status:{' '}
          <span
            class={() => (allValid() ? 'badge green' : 'badge red')}
            data-testid="validate-status"
          >
            {() => (allValid() ? 'VALID' : 'INVALID')}
          </span>
        </p>
      </div>

      <div class="section">
        <h3>Snapshot</h3>
        <pre style="font-size: 13px" data-testid="validate-snapshot">
          {() =>
            JSON.stringify(
              {
                username: usernameResult().issues
                  ? { issues: usernameResult().issues }
                  : { value: usernameResult().value },
                age: ageResult().issues
                  ? { issues: ageResult().issues }
                  : { value: ageResult().value },
                email: emailResult().issues
                  ? { issues: emailResult().issues }
                  : { value: emailResult().value },
              },
              null,
              2,
            )
          }
        </pre>
      </div>
    </div>
  )
}
