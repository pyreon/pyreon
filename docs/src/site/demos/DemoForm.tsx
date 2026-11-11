import { useForm } from '@pyreon/form'
import { effect, signal } from '@pyreon/reactivity'
import { onMount } from '@pyreon/core'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, DemoPanel, Meters, PaperButton, PaperError, PaperField, PaperHint, PaperLabel } from '../kit/demo'

const TAKEN = 'ada@example.com'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Forms demo (`form.json` → demo): a real `@pyreon/form` sign-up form. The
 * email check is async (0.4–1.1 s, "ada@example.com" is taken) and debounced
 * 300 ms by the form; the form drops answers that arrive after a newer
 * keystroke. The counters are effects on each field's own signals, so they
 * show what actually re-ran: typing an email never touches the password.
 *
 * Uses `<form onSubmit={form.handleSubmit}>`, not `<Form of={form}>`, until
 * #4309 (typed forms rejected under strict TS) lands.
 */
export default function DemoForm() {
  const requests = signal(0)
  const stale = signal(0)
  const emailUpdates = signal(0)
  const passwordUpdates = signal(0)
  const result = signal('')

  let latestEmail = ''
  const form = useForm({
    initialValues: { email: '', password: '' },
    validateOn: 'change',
    debounceMs: 300,
    validators: {
      email: async (v: string): Promise<string | undefined> => {
        if (!v) return undefined
        if (!EMAIL_RE.test(v)) return 'Enter a valid email address'
        requests.update((n) => n + 1)
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 700))
        // The form keeps only the newest run; count the ones it will drop.
        if (latestEmail !== v) stale.update((n) => n + 1)
        return v.toLowerCase() === TAKEN ? 'This email is already registered' : undefined
      },
      password: (v: string) => (v && v.length < 8 ? 'At least 8 characters' : undefined),
    },
    onSubmit: () => {
      result.set('Submitted. In a real app, server errors come back through setErrors().')
    },
  })

  // One effect per field, reading only that field's signals.
  onMount(() => {
    let firstE = true
    let firstP = true
    const e = effect(() => {
      latestEmail = form.fields.email.value()
      form.fields.email.error()
      if (firstE) firstE = false
      else emailUpdates.update((n) => n + 1)
    })
    const p = effect(() => {
      form.fields.password.value()
      form.fields.password.error()
      if (firstP) firstP = false
      else passwordUpdates.update((n) => n + 1)
    })
    return () => {
      e.dispose()
      p.dispose()
    }
  })

  const submit = async (ev: Event) => {
    result.set('')
    await form.handleSubmit(ev)
    if (!form.isValid()) result.set('Fix the highlighted fields first. Focus moved to the first error.')
  }

  return (
    <DemoGrid>
      <DemoSurface>
        <form onSubmit={submit} aria-label="Sign-up demo" noValidate>
          <PaperLabel {...form.labelProps('email')}>Email</PaperLabel>
          <PaperField>
            <input {...form.register('email')} type="email" placeholder="you@example.com" autoComplete="off" />
          </PaperField>
          <PaperError {...form.errorProps('email')}>{() => form.fields.email.error() ?? ''}</PaperError>
          <PaperLabel {...form.labelProps('password')}>Password</PaperLabel>
          <PaperField>
            <input {...form.register('password')} type="password" placeholder="At least 8 characters" autoComplete="new-password" />
          </PaperField>
          <PaperError {...form.errorProps('password')}>{() => form.fields.password.error() ?? ''}</PaperError>
          <PaperButton type="submit" variant="primary">
            Create account
          </PaperButton>
          <PaperHint aria-live="polite">{() => (form.isValidating() ? 'Checking the email…' : result())}</PaperHint>
        </form>
      </DemoSurface>
      <DemoPanel note="Validation runs on blur by default. This demo validates as you type so you can see the debounce and the stale-result handling at work.">
        <Meters
          label="What re-ran"
          items={[
            { label: 'email field updates', value: () => emailUpdates() },
            { label: 'password field updates', value: () => passwordUpdates() },
            { label: 'stale async results discarded', value: () => stale() },
            { label: 'requests sent (debounced 300 ms)', value: () => requests() },
          ]}
        />
      </DemoPanel>
    </DemoGrid>
  )
}
