---
title: "Forms & Validation"
description: "How to build reactive forms in Pyreon with @pyreon/form — composable fields, per-field signals, blur-gated validation, arrays, and schema validation."
---

# Forms & Validation

`@pyreon/form` is signal-based form management: every field's `value`, `error`, `touched`, and `dirty` are independent signals, so a keystroke patches only that field's bound DOM. Validation runs on blur by default (so users aren't scolded mid-keystroke), with sync, async, and schema adapters.

## When to use it

- Any form beyond a single uncontrolled input — login, signup, settings, multi-step wizards, dynamic arrays.
- You want schema validation (Zod / Valibot / ArkType / Pyreon's `s`) wired to fields.

## When **not** to use it

- A single input whose value you read on submit — a plain `signal()` + `onInput` is fine.

## Composable fields

Define fields once, infer the form shape from them:

```tsx
import { field, useForm, Form, useField, Submit } from '@pyreon/form'

const email = field('email', '', (v) => (v.includes('@') ? undefined : 'Invalid email'))
const password = field('password', '', (v) => (v.length >= 8 ? undefined : 'Too short'))

function LoginForm() {
  const form = useForm({
    fields: [email, password],
    onSubmit: (values) => console.warn('submit', values),
  })

  return (
    <Form of={form}>
      <EmailField />
      <Submit>Log in</Submit>
    </Form>
  )
}

function EmailField() {
  const f = useField('email')      // reads the form from <Form> context
  return (
    <div>
      <input
        value={f.value}
        onInput={(e) => f.setValue(e.currentTarget.value)}
        onBlur={f.blur}
      />
      {() => (f.showError() ? f.error() : '')}
    </div>
  )
}
```

`<Submit>` auto-disables during submission. `useField('name')` reads the nearest `<Form>` / `<FormProvider>` — no prop drilling.

Validation that gates the error on blur, live:

<Example file="./examples/form/field-validation-error-gating-on-blur" />

Disabled and read-only fields:

<Example file="./examples/form/disabled-read-only-fields" />

## Schema validation

```tsx
import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: zodSchema(z.object({ email: z.string().email(), age: z.number().min(18) })),
  onSubmit: (v) => {},
})
```

Standard-Schema validators (Zod 3.24+, Valibot 1.0+, ArkType 2.0+) work through the same adapter. For metadata-driven fields and reactive parsing, see `@pyreon/validate` (`withField`, `parseReactive`, `formatErrors`).

## Arrays, watching, server errors

- **Arrays** — `useFieldArray()` gives `append` / `prepend` / `insert` / `remove` / `update` / `move` / `swap` / `replace`. Always render with `<For each={items()} by={(i) => i.key}>` — `.key` is a stable monotonic number, not the index.
- **Watching** — `useWatch(form, 'name')` for one field; `useFormState(form, selector?)` for `isValid` / `isDirty` / `isSubmitting` / `errors`, narrowed by a selector so a submit button doesn't re-render on unrelated changes.
- **Server errors** — `form.setFieldError(name, msg)` / `form.setErrors({...})` display immediately (they don't touch `touched`).

## Common pitfalls

- **A signal read in `initialValues`.** `initialValues: { name: user() }` snapshots the signal once and never updates. Pass the plain value, or set it later with `form.setFieldValue`. (`@pyreon/lint`'s `no-signal-in-form-initial-values` flags this.)
- **Ternary short-circuit hiding error tracking.** `{() => touched() ? error() ?? '' : ''}` only subscribes to `error` once `touched` is true — a later `error.set()` in the same batch is missed. Read both into consts first: `{() => { const t = touched(); const e = error(); return t ? e ?? '' : '' }}`.
- **`onChange` instead of `onInput`.** Use `onInput` for keystroke-by-keystroke updates (native DOM event).

## Related

- [Form reference](/docs/reference/form) · [Validate reference](/docs/reference/validate)
- [Form fields pattern](/docs/patterns/form-fields) · [Dynamic arrays](/docs/patterns/dynamic-fields)
- [Data Fetching](/docs/guides/data-fetching)
