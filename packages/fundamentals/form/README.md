# @pyreon/form

Signal-based form management — fields, validation, arrays, and context.

Every field on a Pyreon form is its own `Signal<T>` (one each for `value`, `error`, `touched`, `dirty`), so templates only re-run for the slice they read. Two complementary APIs: the classic `useForm({ initialValues, validators, onSubmit })`, and the composable `field('name', default, validator) → useForm({ fields }) + useField('name')` that infers `FormState` from a field array and skips prop drilling via `<Form of={form}>` / `FormProvider`. Pairs with `@pyreon/validation` for Zod/Valibot/ArkType schema integration.

## Install

```bash
bun add @pyreon/form @pyreon/core @pyreon/reactivity
```

## Quick start

```tsx
import { useForm } from '@pyreon/form'

function LoginForm() {
  const form = useForm({
    initialValues: { email: '', password: '' },
    validators: {
      email: (v) => (!v.includes('@') ? 'Invalid email' : undefined),
      password: (v) => (v.length < 8 ? 'Too short' : undefined),
    },
    validateOn: 'blur',
    onSubmit: async (values) => {
      await fetch('/api/login', { method: 'POST', body: JSON.stringify(values) })
    },
  })

  return (
    <form onSubmit={form.handleSubmit}>
      <input type="email" {...form.register('email')} />
      <input type="password" {...form.register('password')} />
      <button type="submit">Login</button>
    </form>
  )
}
```

## Composable fields + `<Form>` (recommended)

Define fields once, infer the form shape automatically, and read from context instead of prop drilling:

```tsx
import { field, useForm, useField, Form, Submit } from '@pyreon/form'

const email = field('email', '', (v) => (!v.includes('@') ? 'Invalid' : undefined))
const password = field('password', '', (v) => (v.length < 8 ? 'Too short' : undefined))
const confirm = field('confirmPassword', '', (v, all) =>
  v !== all.password ? 'Mismatch' : undefined,
)

const form = useForm({
  fields: [email, password, confirm],
  onSubmit: (values) => {
    /* { email: string; password: string; confirmPassword: string } */
  },
})

function EmailInput() {
  const f = useField<string>('email')
  return (
    <>
      <input {...f.register()} />
      {() => (f.showError() ? <span>{f.error()}</span> : null)}
    </>
  )
}

;<Form of={form}>
  <EmailInput />
  <PasswordInput />
  <Submit>Login</Submit>
</Form>
```

`<Form of={form}>` renders a `<form>` element, binds `onSubmit` to `form.handleSubmit`, and provides the form via context. `<Submit>` auto-disables during `form.isSubmitting()`.

## `useForm(options)`

| Option           | Type                                         | Description                                                             |
| ---------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| `initialValues`  | `TValues`                                    | Required when using the value-form. Drives field keys + types.          |
| `fields`         | `FieldDefinition[]`                          | Required when using the composable form. Drives `TValues` via inference. |
| `onSubmit`       | `(values: TValues) => void \| Promise<void>` | Submit handler — receives validated values                              |
| `validators`     | `Partial<Record<keyof TValues, ValidateFn>>` | Per-field validators; signature `(value, allValues) => string \| undefined` |
| `schema`         | `SchemaValidateFn<TValues>`                  | Whole-form schema validator (from `@pyreon/validation` adapters)         |
| `validateOn`     | `'blur' \| 'change' \| 'submit'`             | When to validate. **Default: `'blur'`**                                   |
| `debounceMs`     | `number`                                     | Debounce delay for validators (especially async)                         |

Returns `FormState<TValues>` with per-field `Signal`s (`value`, `error`, `touched`, `dirty`), form-level signals (`isSubmitting`, `isValidating`, `submitCount`, `submitError`), computed accessors (`isValid()`, `isDirty()`, `values()`, `errors()`), and handlers (`handleSubmit`, `register`, `validate`, `reset`, `setFieldValue`, `setFieldError`, `setErrors`, `clearErrors`, `resetField`).

```tsx
// Bind text input:
<input {...form.register('email')} />

// Bind checkbox (boolean field):
<input type="checkbox" {...form.register('remember', { type: 'checkbox' })} />

// Bind number input (auto-parses to number):
<input type="number" {...form.register('age', { type: 'number' })} />
```

## `useField(name)` / `useField(form, name)`

Extracts a single field's state with computed helpers (`hasError`, `showError`). Two overloads:

```tsx
// Context form — reads form from <Form>/<FormProvider>. Accepts generic.
const f = useField<string>('email')

// Explicit form — pass a known FormState.
const f = useField(form, 'email')
```

Returns `UseFieldResult<T>`:

| Property      | Type                                            | Description                                  |
| ------------- | ----------------------------------------------- | -------------------------------------------- |
| `value`       | `Signal<T>`                                     | Field value                                  |
| `error`       | `Signal<ValidationError>`                       | `string \| undefined`                        |
| `touched`     | `Signal<boolean>`                               | True after first blur                        |
| `dirty`       | `Signal<boolean>`                               | True when value differs from initial         |
| `hasError`    | `Computed<boolean>`                             | True when an error string exists             |
| `showError`   | `Computed<boolean>`                             | True when `touched()` AND `hasError()`       |
| `setValue`    | `(v: T) => void`                                | Programmatic set                             |
| `setTouched`  | `(b: boolean) => void`                          | Mark touched                                 |
| `reset`       | `() => void`                                    | Reset to field's initial value               |
| `register`    | `() => FieldRegisterProps<T>`                   | Spreadable input props                       |

`showError` is the right gate for displaying error messages — it stays silent until the user has blurred at least once, even when `validateOn: 'change'`.

## `useFieldArray(initial?)`

Dynamic arrays with stable monotonic keys for keyed rendering.

```ts
const tags = useFieldArray<string>(['typescript'])
tags.append('pyreon')
tags.prepend('signals')
tags.insert(1, 'reactive')
tags.move(0, 2)
tags.swap(0, 1)
tags.update(0, 'updated')
tags.remove(0)
tags.replace(['a', 'b', 'c'])
tags.values() // string[]
tags.length() // number
tags.items() // FieldArrayItem<string>[] — { key: number, value: Signal<T> }
```

Each item carries a `key: number` — monotonically increasing, assigned at insert time. Render with `<For each={tags.items()} by={(i) => i.key}>` so reordering / insertion preserves component identity (and input focus). **Index-based keys defeat the stable-key design.**

## `useWatch(form, name?)`

Typed overloads for reactive field watchers:

```ts
const email = useWatch(form, 'email') // Signal<string>
const [first, last] = useWatch(form, ['firstName', 'lastName']) // tuple of Signals
const all = useWatch(form) // Computed<TValues>
```

Single-field form returns the underlying `Signal<T>` directly (no wrapper). Prefer the narrowest form — watching the whole form re-runs your effect on every field change.

## `useFormState(form, selector?)`

Computed summary of form-level state. Pass a selector to narrow the tracked subset.

```ts
const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting && s.isDirty)
// canSubmit() updates only when those 3 booleans flip
```

`FormStateSummary` fields: `isSubmitting`, `isValidating`, `isValid`, `isDirty`, `submitCount`, `submitError`, `touchedFields`, `dirtyFields`, `errors`. Without a selector the computed re-derives on ANY summary field change — always pass a selector for UI-bound computeds.

## `FormProvider` / `useFormContext()` / `<Form>` / `<Submit>`

```tsx
<FormProvider form={form}>
  <DeepInputs />
</FormProvider>

// Inside any descendant:
function DeepInputs() {
  const form = useFormContext<{ email: string; password: string }>()
  return <input {...form.register('email')} />
}
```

`<Form of={form}>` is sugar: renders `<form onSubmit={form.handleSubmit}>` + `<FormProvider>`. `<Submit>` reads `form.isSubmitting()` from context and auto-disables.

Pass the `<TValues>` generic on `useFormContext` — otherwise TypeScript infers `Record<string, unknown>` and field names lose type narrowing.

## Server-side errors

```ts
const form = useForm({
  initialValues: { email: '' },
  onSubmit: async (values) => {
    const res = await fetch('/api/register', { method: 'POST', body: JSON.stringify(values) })
    if (!res.ok) {
      const errors = await res.json()
      form.setErrors(errors) // { email: 'Already registered' }
    }
  },
})
```

`setFieldError` / `setErrors` do NOT touch `touched` state — server errors display immediately regardless of blur status.

## Schema validation

Pair with `@pyreon/validation` adapters. Per-field validators run first; schema errors merge after.

```ts
import { zodSchema } from '@pyreon/validation/zod'
import { z } from 'zod'

const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: zodSchema(z.object({ email: z.string().email(), age: z.number().min(13) })),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

## Devtools

```ts
import { formRegistry } from '@pyreon/form/devtools'
// WeakRef registry of live form instances — tree-shakeable.
```

## Gotchas

- **`validateOn` defaults to `'blur'`, not `'change'`** — users aren't scolded mid-keystroke. Pair `'change'` with `debounceMs` for async validators.
- **Async validators are version-tracked** — stale results are discarded if the user types faster than the validator resolves. `form.isValidating` is `true` while any field has a pending async validation; gate the submit button on it.
- **Mutating `initialValues` after creation has no effect** — they're read once at setup. Use `setFieldValue` for programmatic updates.
- **`form.fields[name].value` is `Signal<T>`** — call it: `form.fields.email.value()`. Reading without calling captures the signal reference, not the value.
- **`handleSubmit` calls `preventDefault()`** — wire it as `<form onSubmit={form.handleSubmit}>` or call with no argument for programmatic submit.
- **`schema` runs AFTER per-field `validators`** — both error sources merge; a schema error can override a field-level error on the same key.
- **`FormProvider` doesn't support nesting** — the inner shadows the outer. For multi-form pages use separate sibling providers.
- **`register()` results are memoized per field+type combo** — calling `register('email')` twice returns the same object.
- **`useFormState(form)` without a selector** re-derives on every state change. Always pass a selector.
- **Don't pass a signal-read into `initialValues`** — `initialValues: { name: user() }` snapshots once. Use `setFieldValue` reactively. Caught by the opt-in lint rule `pyreon/no-signal-in-form-initial-values`.

## Documentation

Full docs: [pyreon.dev/docs/form](https://pyreon.dev/docs/form) (or `docs/src/content/docs/form.md` in this repo).

## License

MIT
