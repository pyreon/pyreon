import { defineManifest } from '@pyreon/manifest'

/**
 * Third migration to the T2.1 pipeline (after flow + query).
 * Collapses the existing hand-written `llms-full.txt` block into
 * a single manifest-driven section covering the full public API
 * surface: useForm, useField, useFieldArray, useWatch, useFormState,
 * FormProvider / useFormContext.
 */
export default defineManifest({
  name: '@pyreon/form',
  title: 'Form Management',
  tagline:
    'Signal-based form management with fields, validation, arrays, and cross-field watchers',
  description:
    'Signal-based form management for Pyreon. Each field (`value`, `error`, `touched`, `dirty`) is its own `Signal<T>` so templates only re-run for the slice they read. First-class schema validation (plug in `zodSchema` / `valibotSchema` / `arktypeSchema` from `@pyreon/validation`), per-field `validateOn: blur | change | submit`, async validators with optional `debounceMs` and version-based stale-result discarding, cross-field validation via `(value, allValues) => …`, dynamic `useFieldArray` with stable keys for keyed rendering, and typed `useWatch` overloads for single / multi / all-field reactive watchers.',
  category: 'universal',
  longExample: `import { useForm, useField, useFieldArray, useWatch, useFormState, FormProvider } from '@pyreon/form'
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
form.setErrors({ email: 'Already registered' })`,
  features: [
    'Per-field fine-grained signals (value, error, touched, dirty independent)',
    'useForm / useField / useFieldArray / useWatch / useFormState',
    'FormProvider + useFormContext — no prop drilling',
    'Per-field and schema-level validation (Zod / Valibot / ArkType via `@pyreon/validation`)',
    "validateOn: 'blur' | 'change' | 'submit' — default 'blur'",
    'Async validators with optional debounceMs + version-based stale-result discard',
    'Cross-field validation — validator receives `(value, allValues)`',
    'useFieldArray: append / prepend / insert / remove / update / move / swap / replace with stable keys',
    'Server-side errors: setFieldError / setErrors / clearErrors',
    '`register({ type: "checkbox" | "number" })` — type-aware input bindings',
  ],
  api: [
    {
      name: 'useForm',
      kind: 'hook',
      signature:
        '<TValues extends Record<string, unknown>>(options: UseFormOptions<TValues>) => FormState<TValues>',
      summary:
        'Create a signal-based form. `initialValues` drives field keys and types end-to-end — TValues is inferred from it, so all downstream typings (`useField` field name, `useWatch` keys, validator signatures) are fully typed without annotation. Returns `FormState<TValues>` with per-field signals, form-level signals (`isSubmitting`, `isValidating`, `isValid`, `isDirty`, `submitCount`, `submitError`), and handlers (`handleSubmit`, `reset`, `validate`). `validateOn` defaults to `"blur"` (not `"change"`) so users aren\'t scolded mid-keystroke; optional `schema` integrates with `@pyreon/validation` adapters (`zodSchema`, `valibotSchema`, `arktypeSchema`) for whole-form validation after per-field validators run.',
      example: `const form = useForm({
  initialValues: { email: '', password: '' },
  validators: {
    email: (v) => (!v ? 'Required' : undefined),
    password: (v, all) => (v.length < 8 ? 'Too short' : undefined),
  },
  onSubmit: async (values) => { await login(values) },
})

// Bind inputs with register():
// h('input', form.register('email'))
// h('input', { type: 'checkbox', ...form.register('remember', { type: 'checkbox' }) })`,
      mistakes: [
        'Mutating `initialValues` after creation — it is read once at setup; use `setFieldValue` for programmatic updates',
        'Reading `form.fields[name].value` as a plain value — it is `Signal<T>`, call it: `form.fields.email.value()`',
        'Passing `validateOn: "change"` without `debounceMs` on async validators — fires a network request on every keystroke',
        'Calling `form.handleSubmit()` without attaching it as a form `onSubmit` handler — it calls `preventDefault()` so it must receive the form event, or be called with no argument for programmatic submit',
        'Forgetting that `schema` runs AFTER per-field `validators` — errors from both sources merge; if a field validator already set an error, the schema can override it',
      ],
      seeAlso: ['useField', 'FormProvider', 'useFormState'],
    },
    {
      name: 'useField',
      kind: 'hook',
      signature:
        '<TValues, K extends keyof TValues & string>(form: FormState<TValues>, name: K) => UseFieldResult<TValues[K]>',
      summary:
        'Extract a single field\'s state and helpers from a form instance — avoids passing the entire `FormState` to leaf components. Returns all `FieldState` signals (`value`, `error`, `touched`, `dirty`) plus two convenience computeds: `hasError` (true when an error string exists) and `showError` (true when touched AND errored — the typical UI condition for gating error display). Also exposes `register(opts?)` to bind an `<input>` element with a single spread.',
      mistakes: [
        'Destructuring `const { value } = useField(form, "email")` and calling `value()` — works, but the getter evaluates to the Signal itself; storing `value()` at setup captures the initial value and defeats reactivity',
        'Forgetting `showError` and reimplementing `touched() && hasError()` in every template — `showError` is a `Computed<boolean>`, use it directly',
      ],
      example: `function EmailField({ form }: { form: FormState<{ email: string }> }) {
  const field = useField(form, 'email')
  return (
    <>
      <input {...field.register()} />
      {() => field.showError() && <span>{field.error()}</span>}
    </>
  )
}`,
      seeAlso: ['useForm', 'useWatch'],
    },
    {
      name: 'useFieldArray',
      kind: 'hook',
      signature: '<T>(initial?: T[]) => UseFieldArrayResult<T>',
      summary:
        'Manage a dynamic array of form fields with stable keys. Each item is `{ key: number, value: Signal<T> }` — use `item.key` inside `<For by={i => i.key}>` so reordering / inserts do not remount child components. Full mutation surface: `append`, `prepend`, `insert`, `remove`, `update`, `move`, `swap`, `replace`.',
      example: `const tags = useFieldArray<string>([])
tags.append('typescript')
tags.prepend('signals')
tags.insert(1, 'reactive')
tags.move(0, 2)
tags.remove(0)

// Keyed rendering — never drop the \`by={i => i.key}\`
<For each={tags.items()} by={(i) => i.key}>
  {(item) => <input value={item.value()} onInput={(e) => item.value.set(e.currentTarget.value)} />}
</For>`,
      mistakes: [
        'Rendering with <For by={(_, i) => i}> — index-based keys lose identity on reorder, defeating the stable-key design',
        'Calling tags.items() inside setup and storing the array — it is a Signal, read inside reactive scopes',
      ],
      seeAlso: ['useForm'],
    },
    {
      name: 'useWatch',
      kind: 'hook',
      signature:
        '(form, name) => Signal<TValues[K]> | (form, names[]) => Signal<T>[] | (form) => Computed<TValues>',
      summary:
        'Typed overloads for reactively watching form field values. Single-field form returns `Signal<T>` (fast path — same signal, no wrapper), multi-field returns a tuple of signals, no-args returns a `Computed<TValues>` over the whole values object. Prefer the narrowest form — watching everything re-runs your effect when ANY field changes.',
      mistakes: [
        'Using the all-fields overload (`useWatch(form)`) to derive a single computed — re-runs when any field changes, not just the one you care about. Use `useWatch(form, "email")` for single-field precision',
      ],
      example: `const email = useWatch(form, 'email')            // Signal<string>
const [first, last] = useWatch(form, ['firstName', 'lastName'])
const everything = useWatch(form)                 // Computed<TValues>

// Derive and sync: preview displays the email as the user types.
effect(() => { preview.set(\`Hello \${email()}\`) })`,
      seeAlso: ['useFormState', 'useField'],
    },
    {
      name: 'useFormState',
      kind: 'hook',
      signature:
        '<TValues, T>(form: FormState<TValues>, selector?: (s: FormStateSummary) => T) => Computed<T>',
      summary:
        'Computed summary of form-level state (`isValid`, `isDirty`, `isSubmitting`, `isValidating`, `submitCount`, `errors`). Passing a selector restricts the tracked subset — a button driven by `canSubmit` should not re-render just because `submitCount` changed. Without a selector, the computed re-derives on ANY form-level state change.',
      mistakes: [
        'Omitting the selector and reading `useFormState(form)` as a whole — triggers on every field change, every validation, every submit count bump. Always pass a selector for UI-bound computeds',
      ],
      example: `const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting && s.isDirty)
<button disabled={() => !canSubmit()}>Save</button>`,
      seeAlso: ['useForm', 'useWatch'],
    },
    {
      name: 'FormProvider',
      kind: 'component',
      signature: '<TValues>(props: { form: FormState<TValues>; children: VNodeChild }) => VNode',
      summary:
        'Provide a form via context so nested components can read it with `useFormContext<TValues>()` without prop-drilling. Every call to `useFormContext` inside the provider tree returns the same `FormState` instance. Nest inside `PyreonUI` or any other provider — the form context is independent.',
      mistakes: [
        'Nesting `FormProvider` within itself expecting scoped forms — the inner provider shadows the outer; for multi-form pages, use separate providers at sibling level, not nested',
      ],
      example: `<FormProvider form={form}>
  <PersonalInfoSection />
  <AddressSection />
  <SubmitButton />
</FormProvider>

// Inside any descendant:
const form = useFormContext<typeof values>()`,
      seeAlso: ['useFormContext', 'useForm'],
    },
    {
      name: 'useFormContext',
      kind: 'hook',
      signature: '<TValues>() => FormState<TValues>',
      summary:
        'Read the nearest `FormProvider` form from context. Throws at dev time if no provider is mounted above the call site. Pass the expected `TValues` generic so downstream typings (`useField` field names, `useWatch` keys) stay end-to-end typed. Returns the same `FormState<TValues>` instance that was passed to `FormProvider`.',
      mistakes: [
        'Calling at module scope — hooks require an active component setup context; call inside a component body',
        'Omitting the `<TValues>` generic — TypeScript infers `FormState<Record<string, unknown>>` and `useField` field names lose type narrowing',
      ],
      example: `const form = useFormContext<{ email: string; password: string }>()
const field = useField(form, 'email')`,
      seeAlso: ['FormProvider', 'useForm'],
    },
  ],
  gotchas: [
    // First gotcha feeds the llms.txt teaser. Keep it the most
    // distinctive foot-gun. The validateOn default is non-obvious —
    // 'blur' not 'change' — and causes the "error flashes on every
    // keystroke" confusion when users switch to 'change' expecting
    // better UX.
    {
      label: 'validateOn default is `blur`, not `change`',
      note: 'Fields validate on blur by default so users aren\'t scolded mid-keystroke. Use `validateOn: "change"` for instant feedback (often paired with `debounceMs: 300` to avoid thrashing async validators), or `validateOn: "submit"` for zero-feedback-until-submit forms. `showError` (from `useField`) gates on `touched`, so even with `validateOn: "change"` errors won\'t appear until the user has blurred at least once — this is intentional.',
    },
    {
      label: 'Field signals are independent',
      note: 'Every `FieldState<T>` field (`value`, `error`, `touched`, `dirty`) is its own `Signal<T>` — reading `field.value()` does not subscribe to `field.error()`. Pair with `useField` so `hasError` / `showError` are computed once per field instead of recomputed at every call site.',
    },
    {
      label: 'Stable keys in `useFieldArray`',
      note: '`FieldArrayItem<T>.key` is a monotonically increasing number assigned at insert time — NOT the array index. Use `<For each={items()} by={(item) => item.key}>` so move / insert / remove preserve component identity and input focus. Index-based keys defeat the stable-key design and cause children to remount on every reorder.',
    },
    {
      label: 'Async validators + stale results',
      note: 'Async validators are version-tracked: if the user types faster than the validator resolves, the stale result is discarded when it finally returns. Combine with `debounceMs` to also cut down the number of in-flight requests. The `isValidating` signal is true while any field has a pending async validation — use it to gate the submit button.',
    },
    {
      label: 'Server errors via `setFieldError` / `setErrors`',
      note: 'After a failed submit, attach server-side errors with `form.setFieldError(name, msg)` or `form.setErrors({ email: "Taken" })`. These do NOT touch `touched` state, so errors display immediately regardless of blur status. `clearErrors()` wipes them on the next keystroke if `validateOn: "change"` is set, or on next submit otherwise.',
    },
  ],
})
