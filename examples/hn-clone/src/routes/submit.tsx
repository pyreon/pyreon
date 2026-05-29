import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { useHead } from '@pyreon/head'
import { useI18n } from '@pyreon/i18n'
import { useRouter } from '@pyreon/router'
import { toast } from '@pyreon/toast'
import { effect } from '@pyreon/reactivity'
import { createSubmitMachine } from '../lib/submit-machine'

/**
 * Submit page — exercises:
 *   - `@pyreon/form`     (useForm + per-field state + handleSubmit)
 *   - `@pyreon/validation` (zodSchema adapter)
 *   - `@pyreon/machine`  (idle → submitting → success | error → idle)
 *   - `@pyreon/toast`    (success / error notifications)
 *
 * The submit flow is modelled as a state machine instead of juggling 4
 * boolean signals (`isSubmitting`, `isSuccess`, `isError`, `lastError`).
 * The machine guarantees the UI never gets into impossible states like
 * `isSubmitting && isSuccess`.
 */
const submitSchema = z.object({
  title: z.string().min(8, 'Title must be at least 8 characters').max(200),
  // Use empty-string-or-URL instead of `.optional()` so the inferred type
  // is `string` (not `string | undefined`). Pyreon's `useForm` typing
  // narrows `fields.<name>` to `undefined` when the value can be
  // `undefined`, which makes every `fields.url.value()` chain fail TS
  // with "Object is possibly 'undefined'". Empty string is the canonical
  // unset state for HTML form inputs anyway.
  url: z.string().url('Must be a valid URL').or(z.literal('')),
  text: z.string(),
})

type SubmitValues = z.infer<typeof submitSchema>

export default function SubmitPage() {
  const { t } = useI18n()
  const router = useRouter()
  useHead(() => ({ title: `${t('nav.submit')} — Hacker News (Pyreon)` }))

  const machine = createSubmitMachine()

  const form = useForm<SubmitValues>({
    initialValues: { title: '', url: '', text: '' },
    schema: zodSchema(submitSchema as never),
    validateOn: 'blur',
    onSubmit: async (values) => {
      // Validate XOR: must have URL OR text, not both empty.
      if (!values.url && !values.text) {
        form.setFieldError('text', t('submit.urlOrText'))
        toast.error(t('submit.urlOrText'))
        return
      }

      machine.send('SUBMIT')
      try {
        // Mock submission — real HN API requires auth + CSRF.
        await new Promise((resolve) => setTimeout(resolve, 800))
        machine.send('DONE')
      } catch {
        machine.send('FAIL')
      }
    },
  })

  // React to machine transitions via effect() — single source of truth.
  effect(() => {
    const state = machine()
    if (state === 'success') {
      toast.success(t('submit.success'))
      // Auto-reset + navigate after a beat.
      setTimeout(() => {
        machine.send('RESET')
        router.push('/')
      }, 1200)
    } else if (state === 'error') {
      toast.error(t('submit.error'))
      setTimeout(() => machine.send('RESET'), 2000)
    }
  })

  const fields = form.fields

  return (
    <section class="submit-page">
      <header class="submit-header">
        <h1>{() => t('nav.submit')}</h1>
        <p class="submit-hint">{() => t('submit.hint')}</p>
      </header>

      <form onSubmit={(e: Event) => form.handleSubmit(e)} class="submit-form">
        <div class="form-row">
          <label for="title">{() => t('submit.title')}</label>
          <input
            id="title"
            type="text"
            value={() => fields.title.value()}
            onInput={(e) => fields.title.setValue((e.currentTarget as HTMLInputElement).value)}
            onBlur={() => fields.title.setTouched()}
            class={() => (fields.title.touched() && fields.title.error() ? 'field-invalid' : '')}
          />
          <div class="field-error">
            {() => {
              // Read both signals unconditionally so the effect subscribes to
              // BOTH on first render. A ternary `touched ? error() : ''`
              // would short-circuit on touched=false and never subscribe to
              // `error`, so the field-error would not re-render when the
              // validator finally writes an error after a submit click.
              const touched = fields.title.touched()
              const err = fields.title.error()
              return touched ? (err ?? '') : ''
            }}
          </div>
        </div>

        <div class="form-row">
          <label for="url">{() => t('submit.url')}</label>
          <input
            id="url"
            type="url"
            placeholder="https://"
            value={() => fields.url.value() ?? ''}
            onInput={(e) => fields.url.setValue((e.currentTarget as HTMLInputElement).value)}
            onBlur={() => fields.url.setTouched()}
            class={() => (fields.url.touched() && fields.url.error() ? 'field-invalid' : '')}
          />
          <div class="field-error">
            {() => {
              const touched = fields.url.touched()
              const err = fields.url.error()
              return touched ? (err ?? '') : ''
            }}
          </div>
        </div>

        <div class="form-row">
          <label for="text">{() => t('submit.text')}</label>
          <textarea
            id="text"
            rows={6}
            value={() => fields.text.value() ?? ''}
            onInput={(e) => fields.text.setValue((e.currentTarget as HTMLTextAreaElement).value)}
            onBlur={() => fields.text.setTouched()}
            class={() => (fields.text.touched() && fields.text.error() ? 'field-invalid' : '')}
          />
          <div class="field-error">
            {() => {
              const touched = fields.text.touched()
              const err = fields.text.error()
              return touched ? (err ?? '') : ''
            }}
          </div>
        </div>

        <div class="submit-actions">
          <button
            type="submit"
            class="btn-primary"
            disabled={() => machine() === 'submitting' || machine() === 'success'}
          >
            {() => {
              const s = machine()
              if (s === 'submitting') return t('submit.submitting')
              if (s === 'success') return t('submit.success')
              if (s === 'error') return t('submit.error')
              return t('submit.button')
            }}
          </button>
          <span class="submit-state-badge" data-state={() => machine()}>
            state: {() => machine()}
          </span>
        </div>
      </form>
    </section>
  )
}
