---
title: "Form fields"
summary: "Use field() + useForm({ fields: [...] }) + useField('name') inside <Form>."
seeAlso: [controllable-state]
---

# Form fields

## The pattern

Define fields with `field()` (pure data — name + default + validator), compose them with `useForm({ fields: [...] })`, and read them from context with `useField('name')`:

```tsx
import { field, useForm, useField, Form, Submit } from '@pyreon/form'

// 1. Field definitions — pure data, no rendering opinion.
const email = field('email', '', (v) =>
  !v.includes('@') ? 'Invalid email' : undefined,
)
const password = field('password', '', (v) =>
  v.length < 8 ? 'Too short' : undefined,
)
const confirm = field('confirmPassword', '', (v, all) =>
  v !== all.password ? 'Must match password' : undefined,
)

// 2. Compose — types inferred from the fields array.
const form = useForm({
  fields: [email, password, confirm],
  onSubmit: async (values) => {
    // values is typed as { email: string; password: string; confirmPassword: string }
    await api.register(values)
  },
})

// 3. Components read the form from context — no prop drilling.
function EmailInput() {
  const f = useField('email')
  return (
    <div>
      <input {...f.register()} />
      {() => f.showError() && <span class="error">{f.error()}</span>}
    </div>
  )
}

// 4. Render. <Form> provides context + binds onSubmit. <Submit> auto-disables.
<Form of={form}>
  <EmailInput />
  <PasswordInput />
  <ConfirmInput />
  <Submit>Register</Submit>
</Form>
```

Key rules:

- `field(name, default, validator?)` carries the field name as a string-literal type — the `useForm` generics infer the full `FormState<TValues>` shape from the fields array. No manual type annotation needed.
- `useField('name')` reads the form from the nearest `<Form>` / `<FormProvider>`. Accepts `useField<ValueType>('name')` for generic narrowing.
- Validators are plain `(value, allValues) => string | undefined`. Cross-field access is free — see `confirm` above.
- `f.showError()` is `touched() && hasError()` — gated on blur so users aren't scolded mid-keystroke.

## Why

Separating field data (`field(...)`) from rendering (`useField('name')`) unlocks reuse: one set of field definitions can back multiple layouts (a mobile single-column, a desktop two-column) without duplicating the validators or the state keys. Context-based reads kill prop-drilling through deep nested forms.

The old API (everything in `useForm({ initialValues, validators })`) is still supported for quick inline forms but doesn't compose.

## Anti-pattern

```tsx
// BROKEN — destructures the field state and loses signal identity
function EmailInput() {
  const { value, error } = useField('email')   // value is now the signal itself, not reactive
  return <input value={value()} />              // never updates
}

// FIX — keep the field object, call signals inside reactive scopes
function EmailInput() {
  const f = useField('email')
  return <input value={() => f.value()} onInput={(e) => f.value.set(e.currentTarget.value)} />
}
```

```tsx
// BROKEN — validator reads props.X at setup, captures the initial value
const passwordField = field('password', '', (v) =>
  v.length < props.minLength ? 'Too short' : undefined,    // props.minLength is undefined
)
```

Validators are pure functions called on every validation run. Read configuration through closure bindings that are final at field-definition time, or restructure to pull validators inside a component that has props in scope.

## Related

- Reference API: `useForm`, `useField`, `Form`, `Submit` — see `get_api({ package: "form", symbol: "..." })`
- Anti-pattern: "Destructuring props" in `reactivity` category (same failure mode applies to `useField` destructuring)
