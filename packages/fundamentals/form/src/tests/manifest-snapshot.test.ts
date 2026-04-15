import { renderLlmsFullSection, renderLlmsTxtLine } from '@pyreon/manifest'
import formManifest from '../manifest'

// Snapshot of the exact rendered llms.txt line + llms-full.txt section
// for @pyreon/form. Mirrors the flow + query references so a manifest
// edit surfaces as a failing inline snapshot locally (fast) in addition
// to the CI `Docs Sync` gate.
//
// Update intentionally via `bun run test -- -u` after a deliberate
// manifest change.

describe('gen-docs — form snapshot', () => {
  it('renders @pyreon/form to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(formManifest)).toMatchInlineSnapshot(`"- @pyreon/form — Signal-based form management with fields, validation, arrays, and cross-field watchers. Fields validate on blur by default so users aren't scolded mid-keystroke. Use \`validateOn: "change"\` for instant feedback (often paired with \`debounceMs: 300\` to avoid thrashing async validators), or \`validateOn: "submit"\` for zero-feedback-until-submit forms. \`showError\` (from \`useField\`) gates on \`touched\`, so even with \`validateOn: "change"\` errors won't appear until the user has blurred at least once — this is intentional."`)
  })

  it('renders @pyreon/form to its expected llms-full.txt section — full body snapshot', () => {
    expect(renderLlmsFullSection(formManifest)).toMatchInlineSnapshot(`
      "## @pyreon/form — Form Management

      Signal-based form management for Pyreon. Each field (\`value\`, \`error\`, \`touched\`, \`dirty\`) is its own \`Signal<T>\` so templates only re-run for the slice they read. First-class schema validation (plug in \`zodSchema\` / \`valibotSchema\` / \`arktypeSchema\` from \`@pyreon/validation\`), per-field \`validateOn: blur | change | submit\`, async validators with optional \`debounceMs\` and version-based stale-result discarding, cross-field validation via \`(value, allValues) => …\`, dynamic \`useFieldArray\` with stable keys for keyed rendering, and typed \`useWatch\` overloads for single / multi / all-field reactive watchers.

      \`\`\`typescript
      import { useForm, useField, useFieldArray, useWatch, useFormState, FormProvider } from '@pyreon/form'
      import { zodSchema } from '@pyreon/validation/zod'
      import { z } from 'zod'

      // 1. useForm — entry point. initialValues is the single source of truth
      //    for field keys + types. onSubmit receives validated values.
      const form = useForm({
        initialValues: { email: '', password: '', remember: false, tags: [] as string[] },
        validators: {
          email: (v) => (!v ? 'Required' : undefined),
          // Cross-field: validator receives (value, allValues)
          password: (v, all) =>
            v.length < 8 ? 'Too short' : v === all.email ? 'Password must differ from email' : undefined,
        },
        schema: zodSchema(z.object({
          email: z.string().email(),
          password: z.string().min(8),
        })),
        validateOn: 'blur',    // 'blur' (default) | 'change' | 'submit'
        debounceMs: 300,       // optional — stale async results are discarded via version counter
        onSubmit: async (values) => { await api.login(values) },
      })

      // 2. register() — bind an input. Returns { value, onInput, onBlur } and,
      //    for type: 'checkbox', also a \`checked\` accessor.
      <form onSubmit={form.handleSubmit}>
        <input {...form.register('email')} />
        <input type="password" {...form.register('password')} />
        <input type="checkbox" {...form.register('remember', { type: 'checkbox' })} />
      </form>

      // 3. useField — extract one field's state for isolated components.
      //    \`hasError\` / \`showError\` are computeds so you don't recompute
      //    the touched-AND-error condition at every call site.
      function EmailField({ form }: { form: typeof form }) {
        const field = useField(form, 'email')
        return (
          <>
            <input {...field.register()} />
            {() => field.showError() && <span class="error">{field.error()}</span>}
          </>
        )
      }

      // 4. useFieldArray — dynamic arrays with stable keys for <For>.
      const tags = useFieldArray<string>(['typescript'])
      tags.append('pyreon')
      tags.prepend('signals')
      tags.insert(1, 'reactive')
      tags.move(0, 2)
      tags.swap(0, 1)
      tags.remove(0)
      // tags.items() → FieldArrayItem<string>[] — { key, value: Signal<T> }
      // Use the stable key in <For by={i => i.key}> so re-renders don't thrash.

      // 5. useWatch — typed overloads: single field → Signal<T>,
      //    multiple fields → [Signal<A>, Signal<B>], no args → Computed<TValues>.
      const email = useWatch(form, 'email')          // Signal<string>
      const [first, last] = useWatch(form, ['firstName', 'lastName'])
      const everything = useWatch(form)              // Computed<TValues>

      // 6. useFormState — derived form-level summary. Pass a selector to avoid
      //    re-rendering when unrelated fields move.
      const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting && s.isDirty)

      // 7. FormProvider / useFormContext — skip prop-drilling across deep trees.
      <FormProvider form={form}>
        <DeepInputs />
      </FormProvider>
      // Inside DeepInputs: const form = useFormContext<MyValues>()

      // 8. Server errors — setFieldError / setErrors / clearErrors after a
      //    failed submit. Does NOT touch touched state, so the error shows
      //    regardless of blur status.
      form.setErrors({ email: 'Already registered' })
      \`\`\`

      > **validateOn default is \`blur\`, not \`change\`**: Fields validate on blur by default so users aren't scolded mid-keystroke. Use \`validateOn: "change"\` for instant feedback (often paired with \`debounceMs: 300\` to avoid thrashing async validators), or \`validateOn: "submit"\` for zero-feedback-until-submit forms. \`showError\` (from \`useField\`) gates on \`touched\`, so even with \`validateOn: "change"\` errors won't appear until the user has blurred at least once — this is intentional.
      >
      > **Field signals are independent**: Every \`FieldState<T>\` field (\`value\`, \`error\`, \`touched\`, \`dirty\`) is its own \`Signal<T>\` — reading \`field.value()\` does not subscribe to \`field.error()\`. Pair with \`useField\` so \`hasError\` / \`showError\` are computed once per field instead of recomputed at every call site.
      >
      > **Stable keys in \`useFieldArray\`**: \`FieldArrayItem<T>.key\` is a monotonically increasing number assigned at insert time — NOT the array index. Use \`<For each={items()} by={(item) => item.key}>\` so move / insert / remove preserve component identity and input focus. Index-based keys defeat the stable-key design and cause children to remount on every reorder.
      >
      > **Async validators + stale results**: Async validators are version-tracked: if the user types faster than the validator resolves, the stale result is discarded when it finally returns. Combine with \`debounceMs\` to also cut down the number of in-flight requests. The \`isValidating\` signal is true while any field has a pending async validation — use it to gate the submit button.
      >
      > **Server errors via \`setFieldError\` / \`setErrors\`**: After a failed submit, attach server-side errors with \`form.setFieldError(name, msg)\` or \`form.setErrors({ email: "Taken" })\`. These do NOT touch \`touched\` state, so errors display immediately regardless of blur status. \`clearErrors()\` wipes them on the next keystroke if \`validateOn: "change"\` is set, or on next submit otherwise.
      "
    `)
  })
})
