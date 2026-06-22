---
title: "Form Management — API Reference"
description: "Signal-based form management with fields, validation, arrays, and cross-field watchers"
---

# @pyreon/form — API Reference

> **Generated** from `form`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [form](/docs/form).

Signal-based form management for Pyreon. Each field (`value`, `error`, `touched`, `dirty`) is its own `Signal<T>` so templates only re-run for the slice they read. First-class schema validation (plug in `zodSchema` / `valibotSchema` / `arktypeSchema` from `@pyreon/validation`), per-field `validateOn: blur | change | submit`, async validators with optional `debounceMs` and version-based stale-result discarding, cross-field validation via `(value, allValues) => …`, dynamic `useFieldArray` with stable keys for keyed rendering, and typed `useWatch` overloads for single / multi / all-field reactive watchers.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`useForm`](#useform) | hook | Create a signal-based form. |
| [`useField`](#usefield) | hook | Extract a single field's state and helpers from a form instance — avoids passing the entire `FormState` to leaf componen |
| [`useFieldArray`](#usefieldarray) | hook | Manage a dynamic array of form fields with stable keys. |
| [`useWatch`](#usewatch) | hook | Typed overloads for reactively watching form field values. |
| [`useFormState`](#useformstate) | hook | Computed summary of form-level state (`isValid`, `isDirty`, `isSubmitting`, `isValidating`, `submitCount`, `errors`). |
| [`FormProvider`](#formprovider) | component | Provide a form via context so nested components can read it with `useFormContext<TValues>()` without prop-drilling. |
| [`useFormContext`](#useformcontext) | hook | Read the nearest `FormProvider` form from context. |

## API

### useForm `hook`

```ts
<TValues extends Record<string, unknown>>(options: UseFormOptions<TValues>) => FormState<TValues>
```

Create a signal-based form. `initialValues` drives field keys and types end-to-end — TValues is inferred from it, so all downstream typings (`useField` field name, `useWatch` keys, validator signatures) are fully typed without annotation. Returns `FormState<TValues>` with per-field signals, form-level signals (`isSubmitting`, `isValidating`, `isValid`, `isDirty`, `submitCount`, `submitError`), and handlers (`handleSubmit`, `reset`, `validate`). `validateOn` defaults to `"blur"` (not `"change"`) so users aren't scolded mid-keystroke; optional `schema` integrates with `@pyreon/validation` adapters (`zodSchema`, `valibotSchema`, `arktypeSchema`) for whole-form validation after per-field validators run.

**Example**

```tsx
const form = useForm({
  initialValues: { email: '', password: '' },
  validators: {
    email: (v) => (!v ? 'Required' : undefined),
    password: (v, all) => (v.length < 8 ? 'Too short' : undefined),
  },
  onSubmit: async (values) => { await login(values) },
})

// Bind inputs with register():
// h('input', form.register('email'))
// h('input', { type: 'checkbox', ...form.register('remember', { type: 'checkbox' }) })
```

**Common mistakes**

- Mutating `initialValues` after creation — it is read once at setup; use `setFieldValue` for programmatic updates
- Reading `form.fields[name].value` as a plain value — it is `Signal<T>`, call it: `form.fields.email.value()`
- Passing `validateOn: "change"` without `debounceMs` on async validators — fires a network request on every keystroke
- Calling `form.handleSubmit()` without attaching it as a form `onSubmit` handler — it calls `preventDefault()` so it must receive the form event, or be called with no argument for programmatic submit
- Forgetting that `schema` runs AFTER per-field `validators` — errors from both sources merge; if a field validator already set an error, the schema can override it

**See also:** `useField` · `FormProvider` · `useFormState`

---

### useField `hook`

```ts
<TValues, K extends keyof TValues & string>(form: FormState<TValues>, name: K) => UseFieldResult<TValues[K]>
```

Extract a single field's state and helpers from a form instance — avoids passing the entire `FormState` to leaf components. Returns all `FieldState` signals (`value`, `error`, `touched`, `dirty`) plus two convenience computeds: `hasError` (true when an error string exists) and `showError` (true when touched AND errored — the typical UI condition for gating error display). Also exposes `register(opts?)` to bind an `<input>` element with a single spread.

**Example**

```tsx
function EmailField({ form }: { form: FormState<{ email: string }> }) {
  const field = useField(form, 'email')
  return (
    <>
      <input {...field.register()} />
      {() => field.showError() && <span>{field.error()}</span>}
    </>
  )
}
```

**Common mistakes**

- Destructuring `const { value } = useField(form, "email")` and calling `value()` — works, but the getter evaluates to the Signal itself; storing `value()` at setup captures the initial value and defeats reactivity
- Forgetting `showError` and reimplementing `touched() && hasError()` in every template — `showError` is a `Computed<boolean>`, use it directly

**See also:** `useForm` · `useWatch`

---

### useFieldArray `hook`

```ts
<T>(initial?: T[]) => UseFieldArrayResult<T>
```

Manage a dynamic array of form fields with stable keys. Each item is `{ key: number, value: Signal<T> }` — use `item.key` inside `<For by={i => i.key}>` so reordering / inserts do not remount child components. Full mutation surface: `append`, `prepend`, `insert`, `remove`, `update`, `move`, `swap`, `replace`.

**Example**

```tsx
const tags = useFieldArray<string>([])
tags.append('typescript')
tags.prepend('signals')
tags.insert(1, 'reactive')
tags.move(0, 2)
tags.remove(0)

// Keyed rendering — never drop the `by={i => i.key}`
<For each={tags.items()} by={(i) => i.key}>
  {(item) => <input value={item.value()} onInput={(e) => item.value.set(e.currentTarget.value)} />}
</For>
```

**Common mistakes**

- Rendering with &lt;For by=&#123;(_, i) =&gt; i&#125;&gt; — index-based keys lose identity on reorder, defeating the stable-key design
- Calling tags.items() inside setup and storing the array — it is a Signal, read inside reactive scopes

**See also:** `useForm`

---

### useWatch `hook`

```ts
(form, name) => Signal<TValues[K]> | (form, names[]) => Signal<T>[] | (form) => Computed<TValues>
```

Typed overloads for reactively watching form field values. Single-field form returns `Signal<T>` (fast path — same signal, no wrapper), multi-field returns a tuple of signals, no-args returns a `Computed<TValues>` over the whole values object. Prefer the narrowest form — watching everything re-runs your effect when ANY field changes.

**Example**

```tsx
const email = useWatch(form, 'email')            // Signal<string>
const [first, last] = useWatch(form, ['firstName', 'lastName'])
const everything = useWatch(form)                 // Computed<TValues>

// Derive and sync: preview displays the email as the user types.
effect(() => { preview.set(`Hello ${email()}`) })
```

**Common mistakes**

- Using the all-fields overload (`useWatch(form)`) to derive a single computed — re-runs when any field changes, not just the one you care about. Use `useWatch(form, "email")` for single-field precision

**See also:** `useFormState` · `useField`

---

### useFormState `hook`

```ts
<TValues, T>(form: FormState<TValues>, selector?: (s: FormStateSummary) => T) => Computed<T>
```

Computed summary of form-level state (`isValid`, `isDirty`, `isSubmitting`, `isValidating`, `submitCount`, `errors`). Passing a selector restricts the tracked subset — a button driven by `canSubmit` should not re-render just because `submitCount` changed. Without a selector, the computed re-derives on ANY form-level state change.

**Example**

```tsx
const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting && s.isDirty)
<button disabled={!canSubmit()}>Save</button>
```

**Common mistakes**

- Omitting the selector and reading `useFormState(form)` as a whole — triggers on every field change, every validation, every submit count bump. Always pass a selector for UI-bound computeds

**See also:** `useForm` · `useWatch`

---

### FormProvider `component`

```ts
<TValues>(props: { form: FormState<TValues>; children: VNodeChild }) => VNode
```

Provide a form via context so nested components can read it with `useFormContext<TValues>()` without prop-drilling. Every call to `useFormContext` inside the provider tree returns the same `FormState` instance. Nest inside `PyreonUI` or any other provider — the form context is independent.

**Example**

```tsx
<FormProvider form={form}>
  <PersonalInfoSection />
  <AddressSection />
  <SubmitButton />
</FormProvider>

// Inside any descendant:
const form = useFormContext<typeof values>()
```

**Common mistakes**

- Nesting `FormProvider` within itself expecting scoped forms — the inner provider shadows the outer; for multi-form pages, use separate providers at sibling level, not nested

**See also:** `useFormContext` · `useForm`

---

### useFormContext `hook`

```ts
<TValues>() => FormState<TValues>
```

Read the nearest `FormProvider` form from context. Throws at dev time if no provider is mounted above the call site. Pass the expected `TValues` generic so downstream typings (`useField` field names, `useWatch` keys) stay end-to-end typed. Returns the same `FormState<TValues>` instance that was passed to `FormProvider`.

**Example**

```tsx
const form = useFormContext<{ email: string; password: string }>()
const field = useField(form, 'email')
```

**Common mistakes**

- Calling at module scope — hooks require an active component setup context; call inside a component body
- Omitting the `<TValues>` generic — TypeScript infers `FormState<Record<string, unknown>>` and `useField` field names lose type narrowing

**See also:** `FormProvider` · `useForm`

---

## Package-level notes

> **validateOn default is `blur`, not `change`:** Fields validate on blur by default so users aren't scolded mid-keystroke. Use `validateOn: "change"` for instant feedback (often paired with `debounceMs: 300` to avoid thrashing async validators), or `validateOn: "submit"` for zero-feedback-until-submit forms. `showError` (from `useField`) gates on `touched`, so even with `validateOn: "change"` errors won't appear until the user has blurred at least once — this is intentional.

> **Field signals are independent:** Every `FieldState<T>` field (`value`, `error`, `touched`, `dirty`) is its own `Signal<T>` — reading `field.value()` does not subscribe to `field.error()`. Pair with `useField` so `hasError` / `showError` are computed once per field instead of recomputed at every call site.

> **Stable keys in `useFieldArray`:** `FieldArrayItem<T>.key` is a monotonically increasing number assigned at insert time — NOT the array index. Use `<For each={items()} by={(item) => item.key}>` so move / insert / remove preserve component identity and input focus. Index-based keys defeat the stable-key design and cause children to remount on every reorder.

> **Async validators + stale results:** Async validators are version-tracked: if the user types faster than the validator resolves, the stale result is discarded when it finally returns. Combine with `debounceMs` to also cut down the number of in-flight requests. The `isValidating` signal is true while any field has a pending async validation — use it to gate the submit button.

> **Server errors via `setFieldError` / `setErrors`:** After a failed submit, attach server-side errors with `form.setFieldError(name, msg)` or `form.setErrors({ email: "Taken" })`. These do NOT touch `touched` state, so errors display immediately regardless of blur status. `clearErrors()` wipes them on the next keystroke if `validateOn: "change"` is set, or on next submit otherwise.
