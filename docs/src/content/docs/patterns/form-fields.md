---
title: "Form fields"
summary: "Declare the form once with useForm({ initialValues, validators }), then read fields from context with useField('name') inside <Form>."
seeAlso: [controllable-state]
---

## The pattern

Declare the whole form once with `useForm({ initialValues, validators })`, render it through `<Form of={form}>`, and let each input component read its own field from context with `useField('name')`:

```tsx
// @check
import { useForm, useField, Form, Submit } from '@pyreon/form'

declare const api: { register(values: unknown): Promise<void> }
declare function PasswordInput(): JSX.Element
declare function ConfirmInput(): JSX.Element

// 1. One declaration: initial values (which type the form) + per-field validators.
const form = useForm({
  initialValues: { email: '', password: '', confirmPassword: '' },
  validators: {
    email: (v) => (!v.includes('@') ? 'Invalid email' : undefined),
    password: (v) => (v.length < 8 ? 'Too short' : undefined),
    confirmPassword: (v, all) => (v !== all.password ? 'Must match password' : undefined),
  },
  onSubmit: async (values) => {
    // values is typed as { email: string; password: string; confirmPassword: string }
    await api.register(values)
  },
})

// 3. Components read the form from context — no prop drilling.
function EmailInput() {
  const f = useField<string>('email')
  return (
    <div>
      <input {...f.register()} />
      {() => f.showError() && <span class="error">{f.error()}</span>}
    </div>
  )
}

// 4. Render. <Form> provides context + binds onSubmit. <Submit> auto-disables.
const RegisterForm = () => (
  <Form of={form}>
    <EmailInput />
    <PasswordInput />
    <ConfirmInput />
    <Submit>Register</Submit>
  </Form>
)
```

Key rules:

- `initialValues` types the whole form: `FormState<TValues>`, every validator's `value` / `allValues`, and the names `useField` and `useWatch` accept are inferred from it. No manual type annotation needed.
- `useField('name')` reads the form from the nearest `<Form>` / `<FormProvider>`. Accepts `useField<ValueType>('name')` for generic narrowing.
- Validators are plain `(value, allValues) => string | undefined`. Cross-field access is free — see `confirm` above.
- `f.showError()` is `touched() && hasError()` — gated on blur so users aren't scolded mid-keystroke.

## Why

Separating the form's data (one `useForm` declaration) from its rendering (`useField('name')` in each input) unlocks reuse: one form can back multiple layouts (a mobile single-column, a desktop two-column) without duplicating the validators or the state keys. Context-based reads kill prop-drilling through deep nested forms.

`useForm` has one option shape. The `field()` + `useForm({ fields: [...] })` shape that earlier versions also accepted was removed in 0.55; `pyreon upgrade` rewrites it (codemod `form-use-form-fields`).

## Anti-pattern

```tsx
// BROKEN — reads the field's value ONCE at setup
function EmailInput() {
  const email = useField('email').value()      // a plain string snapshot
  return <input value={email} />                // never updates
}

// FIX — keep the signal, call it inside the reactive scope.
// (Destructuring `const { value } = useField('email')` is fine too:
// `value` is the field's signal, so `value()` in JSX stays reactive.)
function EmailInput() {
  const f = useField('email')
  return <input value={f.value()} onInput={(e) => f.value.set(e.currentTarget.value)} />
}
```

```tsx
// BROKEN — a module-level validator reads props.X, which is not in scope there
const validators = {
  password: (v: string) => (v.length < props.minLength ? 'Too short' : undefined), // props is not defined
}
```

Validators are pure functions called on every validation run. Read configuration through closure bindings that are final when the form is created, or create the form inside a component that has props in scope (read `props.minLength` inside the validator, so it stays live).

## Related

- Reference API: `useForm`, `useField`, `Form`, `Submit` — see `get_api({ package: "form", symbol: "..." })`
- Anti-pattern: "Destructuring props" in `reactivity` category (same failure mode applies to `useField` destructuring)
