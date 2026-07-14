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
| `schema`         | `SchemaValidateFn` \| Standard Schema \| typed adapter | Whole-form schema validator — a raw Standard Schema (zod / valibot / arktype / `@pyreon/validate`'s `s`) directly, a plain `SchemaValidateFn`, or a `@pyreon/validation` typed adapter |
| `validateOn`     | `'blur' \| 'change' \| 'submit'`             | When to validate. **Default: `'blur'`**                                   |
| `debounceMs`     | `number`                                     | Debounce delay for validators (especially async)                         |
| `focusOnError`   | `boolean`                                    | Focus the first errored + `register()`-bound field on a failed submit. **Default: `true`** |

Returns `FormState<TValues>` with per-field `Signal`s (`value`, `error`, `touched`, `dirty`), form-level signals (`isSubmitting`, `isValidating`, `submitCount`, `isSubmitted`, `isSubmitSuccessful`, `submitError`), computed accessors (`isValid()`, `isDirty()`, `values()`, `getValues(name?)`, `errors()`, `dirtyFields()`, `touchedFields()`), and handlers (`handleSubmit`, `register`, `validate`, `trigger`, `reset`, `setFieldValue`, `setFieldError`, `setErrors`, `clearErrors`, `resetField`, `getFieldState`, `focusFirstError`, `registerField`, `unregisterField`).

react-hook-form-parity accessors (all strictly typed against `TValues`):

- `trigger(name?)` — validate one field, a subset (array), or — no argument — the whole form, on demand. Runs validators immediately (bypassing `debounceMs`); returns whether the validated set is valid.
- `getValues(name?)` — one field's value (`getValues('email')`) or all (`getValues()`).
- `dirtyFields()` / `touchedFields()` — the changed / visited fields as a record (`{ email: true }`). Reactive.
- `getFieldState(name)` — a field's live `FieldState` (same object as `form.fields[name]`).
- `isSubmitted` — `Accessor<boolean>`, true once `submitCount > 0`.
- `isSubmitSuccessful` — `Signal<boolean>`, true only after the most recent submit's `onSubmit` ran without a validation failure or throw; cleared by `reset()`.

```tsx
// Bind text input:
<input {...form.register('email')} />

// Bind checkbox (boolean field):
<input type="checkbox" {...form.register('remember', { type: 'checkbox' })} />

// Bind number input (auto-parses to number):
<input type="number" {...form.register('age', { type: 'number' })} />

// Bind file input (value-less — writes the FileList to the field):
<input type="file" {...form.register('avatar', { type: 'file' })} />
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

`FormStateSummary` fields: `isSubmitting`, `isValidating`, `isValid`, `isDirty`, `submitCount`, `isSubmitted`, `isSubmitSuccessful`, `submitError`, `touchedFields`, `dirtyFields`, `errors`. Without a selector the computed re-derives on ANY summary field change — always pass a selector for UI-bound computeds.

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

## File inputs

`register(field, { type: 'file' })` returns a **value-less** props bag — a file input can't be value-controlled (`<input type="file" value=…>` is a no-op the browser rejects). Its `onInput` writes the input's `FileList` (`target.files`) to the field, so `field.value()` is `FileList | null` — read `files?.[0]` for a single file:

```tsx
const form = useForm({
  initialValues: { avatar: null as FileList | null },
  onSubmit: async (values) => {
    const file = values.avatar?.[0]
    if (file) await upload(file)
  },
})

;<input type="file" {...form.register('avatar', { type: 'file' })} />
```

The value flows into `values()` / `onSubmit` like any other field. This sits alongside the other `register` type variants: `{ type: 'checkbox' }` → `checked`, `{ type: 'number' }` → `valueAsNumber`.

## Dynamic fields — `registerField` / `unregisterField`

Add or remove fields at runtime for data-driven forms (a server-defined schema, an "add another section" button). A dynamically-registered field is fully first-class — it reaches `values()` / `onSubmit` and participates in validity — and unregistering cleanly removes its invalid / dirty contribution:

```ts
form.registerField('phone', '', (v) => (v ? undefined : 'Required'))
form.setFieldValue('phone', '555-0100')
form.getValues() // { …, phone: '555-0100' }

form.unregisterField('phone') // gone from values() + validity recovers
```

`registerField(name, initialValue?, validator?)` is idempotent — re-registering an existing field keeps its current value and just refreshes the validator. This is the **only** way to add a field after creation; `@pyreon/form` never lazily auto-registers (that would silently drop data). Dynamic fields are runtime-typed (not in the static `TValues`), so read them via `getValues()[name]` / `fields[name]`.

## Focus on error

On a failed `handleSubmit`, focus moves to the first errored **and** `register()`-bound field (in declaration order) — accessible error recovery (react-hook-form's `shouldFocusError`). On by default; opt out with `focusOnError: false`. `form.focusFirstError()` is also exposed for custom submit flows. SSR-safe; a field never bound via `register()` (no known id) is skipped.

```ts
const form = useForm({
  initialValues: { email: '', name: '' },
  validators: { email: (v) => (v ? undefined : 'Required') },
  focusOnError: true, // default — set false to opt out
  onSubmit: async () => {},
})

// Custom flow:
if (!(await form.validate())) form.focusFirstError()
```

## Reset ergonomics

`reset(values?, options?)` and `resetField(field, options?)` cover the common "reset to freshly-saved server data" and "keep some state across a reset" flows:

```ts
// Reset every field to its original initial value (unchanged behavior):
form.reset()

// Reset TO new baseline values — named fields become the NEW baseline,
// unnamed fields revert to their original initial. isDirty() → false.
form.reset(await fetchLatest()) // { name: 'server', email: 'a@b.com' }

// Preserve selected state across the reset:
form.reset(undefined, { keepErrors: true })      // also keepTouched / keepDirty / keepSubmitCount

// Single field:
form.resetField('email')                          // revert value + clear error/touched
form.resetField('email', { keepError: true })     // also keepTouched
```

## Schema validation

`schema` accepts a **raw Standard Schema** (zod ≥ 3.24 / valibot ≥ 1 / arktype ≥ 2 / `@pyreon/validate`'s `s`) **directly** — no `zodSchema()` adapter and no `as never` cast:

```ts
import { z } from 'zod'

const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: z.object({ email: z.string().email(), age: z.number().min(13) }),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

It also still accepts a plain `SchemaValidateFn` (`(values) => Partial<Record<key, string>>`) and a `@pyreon/validation` typed adapter (`zodSchema` / `valibotSchema` / `arktypeSchema` — the compile-time-typed form). Per-field validators run first; schema errors merge after.

The `~standard` contract + bridge live in `@pyreon/validation`; `@pyreon/form` depends on it and re-exports `ValidationError` / `ValidateFn` / `SchemaValidateFn`, so the historical `import { ValidationError } from '@pyreon/form'` keeps working.

### Dot-path leaf fields + nested schema errors

A field key containing a dot (`'address.city'`) declares a **first-class leaf field**, addressable exactly like a top-level one:

```ts
const form = useForm({
  initialValues: { name: '', 'address.city': '', 'address.zip': '' },
  validators: {
    'address.city': (v) => (v ? undefined : 'City is required'),
    'address.zip': (v) => (/^\d{5}$/.test(v) ? undefined : 'Bad zip'),
  },
  onSubmit: (values) => api.save(nestValues(values)), // { name, address: { city, zip } }
})

// h('input', form.register('address.city'))
// form.fields['address.city'].error()   → 'City is required'
// form.errors()                          → { 'address.city': 'City is required' }
```

**Error routing — most-specific field wins:**

- **Leaf routing** — per-field validators, a **flat-keyed schema** (`s.object({ 'address.city': s.string().min(1) })`), OR a **real nested schema** (`z.object({ address: z.object({ city: z.string().min(1) }) })`) all route their error to the exact **leaf** field. A declarative nested schema is fed the **nested** value shape (transiently rebuilt from the flat model), so it validates correctly and its per-leaf-path error auto-splits to the matching leaf field.
- **Ancestor routing** — a nested error with **no** registered leaf field routes to the nearest registered **ancestor** object field (e.g. `initialValues: { address: { city: '' } }` → field `address`, schema `z.object({ address: z.object({ city }) })` → error on `address`).
- **Both registered** (object `address` **and** leaf `address.city`) → the **leaf wins**; the object ancestor no longer double-claims it (dev-warns, since holding "city" in two places is confusing).

Only a **declarative** schema (raw Standard Schema / typed adapter) is fed the nested shape; a plain `SchemaValidateFn` function always receives the flat `TValues` (its type contract). The value model is **flat**: `values()` / `getValues()` / `onSubmit` return the flat dot-path keys (so field-name types stay honest — no type footgun), and `nestValues(form.values())` / `flattenValues(serverData)` convert to and from a nested API payload. A schema error whose key matches **no** field (a shape mismatch, or the path-less `""` whole-form key) marks the form invalid, sets `submitError`, and dev-warns — never silently dropped. Both the submit and blur paths honor this.

Not yet typed: `values()` / `onSubmit` / `schema` carry the flat dot-path keys, not a nested `NestValues<T>` inference — so a nested declarative schema over a dot-path-leaf form needs an `as never` cast today. That's a tracked follow-up (its type cascade breaks generic wrappers like `@pyreon/feature`).

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
- **`schema` runs AFTER per-field `validators`, but field-level errors win** — the schema only fills fields that have no field-level error. A raw Standard Schema needs no `zodSchema()` wrapper or `as never` cast. A dot-path field key (`'address.city'`) is a first-class leaf field — per-field validators + a flat-keyed schema route to the exact leaf; a nested schema over an object field routes to the ancestor; a key matching no field invalidates the form + sets `submitError` (never silently dropped). `values()`/`onSubmit` keep FLAT dot-path keys — use `nestValues` for a nested payload.
- **File inputs are value-less** — `register(field, { type: 'file' })` omits `value`; its `onInput` writes the `FileList`, so `field.value()` is `FileList | null` (read `files?.[0]`).
- **Dynamic fields need `registerField`** — `@pyreon/form` never auto-registers; add runtime fields with `form.registerField(name, initial?, validator?)` and read them via `getValues()[name]` (they're not in the static `TValues`).
- **`FormProvider` doesn't support nesting** — the inner shadows the outer. For multi-form pages use separate sibling providers.
- **`register()` results are memoized per field+type combo** — calling `register('email')` twice returns the same object.
- **`useFormState(form)` without a selector** re-derives on every state change. Always pass a selector.
- **Don't pass a signal-read into `initialValues`** — `initialValues: { name: user() }` snapshots once. Use `setFieldValue` reactively. Caught by the opt-in lint rule `pyreon/no-signal-in-form-initial-values`.

## Documentation

Full docs: [pyreon.dev/docs/form](https://pyreon.dev/docs/form) (or `docs/src/content/docs/form.md` in this repo).

## License

MIT
