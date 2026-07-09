---
title: "Form Management — API Reference"
description: "Signal-based form management with fields, validation, arrays, and cross-field watchers"
---

# @pyreon/form — API Reference

> **Generated** from `form`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [form](/docs/form).

Signal-based form management for Pyreon. Each field (`value`, `error`, `touched`, `dirty`) is its own `Signal<T>` so templates only re-run for the slice they read. First-class schema validation — pass a RAW Standard Schema (zod / valibot / arktype / `@pyreon/validate`) straight to `schema` with no adapter and no cast, or a `zodSchema` / `valibotSchema` / `arktypeSchema` typed adapter from `@pyreon/validation`; nested schema errors route to their ancestor field, and a key matching no field invalidates rather than being silently dropped. Per-field `validateOn: blur | change | submit`, async validators with optional `debounceMs` and version-based stale-result discarding, cross-field validation via `(value, allValues) => …`, type-aware input bindings (`register({ type: "checkbox" | "number" | "file" })`), runtime field registration (`registerField` / `unregisterField`) for data-driven forms, focus-first-error on failed submit (`focusOnError`, default on), reset ergonomics (`reset(values, { keep* })` + `resetField(field, { keepError })`), dynamic `useFieldArray` with stable keys for keyed rendering, and typed `useWatch` overloads for single / multi / all-field reactive watchers.

## Features

- Per-field fine-grained signals (value, error, touched, dirty independent)
- useForm / useField / useFieldArray / useWatch / useFormState
- FormProvider + useFormContext — no prop drilling
- Per-field and schema-level validation (Zod / Valibot / ArkType via `@pyreon/validation`)
- validateOn: 'blur' | 'change' | 'submit' — default 'blur'
- Async validators with optional debounceMs + version-based stale-result discard
- Cross-field validation — validator receives `(value, allValues)`
- useFieldArray: append / prepend / insert / remove / update / move / swap / replace with stable keys
- Server-side errors: setFieldError / setErrors / clearErrors
- `register({ type: "checkbox" | "number" | "file" })` — type-aware input bindings (file writes the FileList)
- Raw Standard Schema in `schema` (zod / valibot / arktype / `@pyreon/validate`) — no adapter, no cast
- Dynamic runtime fields — `registerField` / `unregisterField` for data-driven forms
- Focus-first-error on failed submit (`focusOnError`, default on) + `focusFirstError()`
- Reset ergonomics — `reset(values, { keep* })` new baseline + `resetField(field, { keepError })`
- Schema-error routing — nested `address.city` → ancestor field; orphan key invalidates (no silent drop)

## Complete example

A full, end-to-end usage of the package:

```tsx
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
//    for type: 'checkbox', also a `checked` accessor.
<form onSubmit={form.handleSubmit}>
  <input {...form.register('email')} />
  <input type="password" {...form.register('password')} />
  <input type="checkbox" {...form.register('remember', { type: 'checkbox' })} />
</form>

// 3. useField — extract one field's state for isolated components.
//    `hasError` / `showError` are computeds so you don't recompute
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

// 9. Raw Standard Schema — pass zod/valibot/arktype straight to `schema`,
//    no zodSchema() adapter and no `as never` cast.
import { z } from 'zod'
const typed = useForm({
  initialValues: { email: '', age: 0 },
  schema: z.object({ email: z.string().email(), age: z.number().min(13) }),
  onSubmit: async (v) => { await api.save(v) },
})

// 10. File input — a value-less bag; onInput writes the FileList.
//     field.value() is `FileList | null`; read `files?.[0]` for one file.
<input type="file" {...form.register('avatar', { type: 'file' })} />

// 11. Dynamic fields — add/remove first-class fields at runtime.
form.registerField('phone', '', (v) => (v ? undefined : 'Required'))
form.setFieldValue('phone', '555-0100')   // reaches values()/onSubmit/validity
form.unregisterField('phone')             // cleanly drops its invalid/dirty contribution

// 12. Reset to freshly-saved server data + keep-options.
form.reset(await api.save(form.values()))          // named fields = new baseline; isDirty() → false
form.reset(undefined, { keepErrors: true })        // also keepTouched / keepDirty / keepSubmitCount

// 13. Focus-first-error — on by default on a failed submit; also manual.
if (!(await form.validate())) form.focusFirstError()
```

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

Create a signal-based form. `initialValues` drives field keys and types end-to-end — TValues is inferred from it, so all downstream typings (`useField` field name, `useWatch` keys, validator signatures) are fully typed without annotation. Returns `FormState<TValues>` with per-field signals, form-level signals (`isSubmitting`, `isValidating`, `isValid`, `isDirty`, `submitCount`, `isSubmitted`, `isSubmitSuccessful`, `submitError`), and handlers (`handleSubmit`, `reset`, `validate`, `trigger`, `focusFirstError`, `registerField`, `unregisterField`). react-hook-form-parity accessors: `trigger(name?)` validates a field/subset/whole-form on demand; `getValues(name?)` reads one value or all; `dirtyFields()` / `touchedFields()` return the changed/visited fields as records; `getFieldState(name)` returns a field's live signals (`undefined` for a name matching no field — an existence probe for dynamic fields); `isSubmitted` / `isSubmitSuccessful` track submit lifecycle. `validateOn` defaults to `"blur"` (not `"change"`) so users aren't scolded mid-keystroke. `schema` accepts a RAW Standard Schema (zod / valibot / arktype / `@pyreon/validate`'s `s`) directly — no adapter, no `as never` cast — as well as a plain `SchemaValidateFn` or a `@pyreon/validation` typed adapter (`zodSchema` / `valibotSchema` / `arktypeSchema`); it runs after per-field validators, field-level errors win on the same field, a nested `address.city` error routes to its ancestor `address` field, and a key matching no field invalidates the form (never silently dropped). `register(field, { type })` binds an input per type — `"checkbox"` → `checked`, `"number"` → `valueAsNumber`, `"file"` → a value-less bag whose `onInput` writes the `FileList`. `registerField(name, initial?, validator?)` / `unregisterField(name)` add or remove first-class fields at runtime for data-driven forms (idempotent; no silent auto-registration; dynamic fields are runtime-typed). On a failed submit, focus moves to the first errored + `register()`-bound field unless `focusOnError: false` (also exposed as `focusFirstError()`). `reset(values?, { keepErrors?, keepTouched?, keepDirty?, keepSubmitCount? })` resets to a new baseline (named fields become the new baseline; the rest revert to initial); `resetField(field, { keepError?, keepTouched? })` resets one field.

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
- Assuming `schema` errors override field validators — it is the reverse: `schema` runs AFTER per-field `validators` but a field that already has a field-level error KEEPS it; the schema only fills fields with no field-level error. Also: a raw Standard Schema needs NO `zodSchema()` wrapper or `as never` cast — pass zod/valibot/arktype directly

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

> **Raw Standard Schema — no adapter, no cast:** `schema` accepts a raw Standard Schema (zod ≥ 3.24 / valibot ≥ 1 / arktype ≥ 2 / `@pyreon/validate`'s `s`) DIRECTLY — pass `z.object({...})` with no `zodSchema()` wrapper and no `as never` cast. It also still accepts a plain `SchemaValidateFn` and a `@pyreon/validation` typed adapter (reach for the adapter when you want the schema's field names checked against `TValues` at compile time). The `~standard` contract + bridge live in `@pyreon/validation`; form re-exports `ValidationError` / `ValidateFn` / `SchemaValidateFn` so the historical `import { ValidationError } from "@pyreon/form"` keeps working.

> **Nested schema errors route to the ancestor field:** Standard Schema adapters key nested errors by dot-path (`{ "address.city": "Required" }`). The error routes to its TOP-LEVEL ancestor field (`address`), which surfaces the message — the field model is flat in v1, so there is no per-leaf `address.city` field. A schema-error key matching NO field (a shape mismatch, or the path-less `""` whole-form key) marks the form invalid, sets `submitError`, and dev-warns — it is NOT silently dropped (which previously let `onSubmit` fire with schema-rejected data). Field-level errors win over schema errors on the same field.

> **File inputs are value-less:** `register(field, { type: "file" })` returns a bag WITHOUT `value` or `checked` — a file input can't be value-controlled (`<input type="file" value=…>` is rejected). Its `onInput` writes the input's `FileList` (`target.files`) to the field, so `field.value()` is `FileList | null` — read `files?.[0]` for a single file, or iterate for a `multiple` input. The value flows into `values()` / `onSubmit` like any field.

> **Dynamic fields need explicit `registerField` — no auto-registration:** `@pyreon/form` never lazily registers a field on first `setFieldValue` / `register` — that would silently drop data. Add a runtime field with `form.registerField(name, initial?, validator?)` (idempotent: re-registering keeps the current value, refreshes the validator) and remove it with `form.unregisterField(name)` (cleanly zeroes its `isValid()` / `isDirty()` contribution). Dynamic fields are runtime-typed — not part of the static `TValues` — so read them via `getValues()[name]` / `fields[name]`.

> **Focus-first-error is on by default:** On a failed `handleSubmit`, focus moves to the first errored field (declaration order) that was bound via `register()` — accessible error recovery. Opt out with `focusOnError: false`. A field never passed through `register()` has no known id and is skipped. `form.focusFirstError()` is exposed for custom submit flows; both are SSR-safe no-ops on the server.
