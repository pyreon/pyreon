# @pyreon/form

Signal-based form management for Pyreon. Fields, validation, submission, arrays, and context.

## Install

```bash
bun add @pyreon/form
```

## Quick Start

```tsx
import { useForm } from "@pyreon/form"

function LoginForm() {
  const form = useForm({
    initialValues: { email: "", password: "" },
    validators: {
      email: (v) => (!v.includes("@") ? "Invalid email" : undefined),
      password: (v) => (v.length < 8 ? "Too short" : undefined),
    },
    validateOn: "blur",
    onSubmit: async (values) => {
      await fetch("/api/login", { method: "POST", body: JSON.stringify(values) })
    },
  })

  return () => (
    <form onSubmit={form.handleSubmit}>
      <input type="email" {...form.register("email")} />
      <input type="password" {...form.register("password")} />
      <button type="submit">Login</button>
    </form>
  )
}
```

## API

### `useForm(options)`

Create a reactive form instance with field states, validation, and submission handling.

| Parameter | Type | Description |
| --- | --- | --- |
| `options.initialValues` | `TValues` | Initial values for each field |
| `options.onSubmit` | `(values: TValues) => void \| Promise<void>` | Called with validated values on submit |
| `options.validators` | `Partial<Record<keyof TValues, ValidateFn>>` | Per-field validators (receives value + all values) |
| `options.schema` | `SchemaValidateFn<TValues>` | Schema-level validator (runs after field validators) |
| `options.validateOn` | `"blur" \| "change" \| "submit"` | When to trigger validation (default: `"blur"`) |
| `options.debounceMs` | `number` | Debounce delay for validators in ms |

**Returns:** `FormState<TValues>` with these properties:

| Property | Type | Description |
| --- | --- | --- |
| `fields` | `Record<keyof TValues, FieldState>` | Individual field states |
| `isSubmitting` | `Signal<boolean>` | Whether the form is being submitted |
| `isValidating` | `Signal<boolean>` | Whether async validation is running |
| `isValid` | `Accessor<boolean>` | Whether all fields pass validation |
| `isDirty` | `Accessor<boolean>` | Whether any field differs from initial |
| `submitCount` | `Signal<number>` | Number of submission attempts |
| `submitError` | `Signal<unknown>` | Error thrown by `onSubmit` |
| `values()` | `() => TValues` | Get all current values |
| `errors()` | `() => Record<keyof TValues, string>` | Get all current errors |
| `register(field, opts?)` | `Function` | Bind an input to a field |
| `handleSubmit(e?)` | `(e?: Event) => Promise<void>` | Submit handler |
| `validate()` | `() => Promise<boolean>` | Validate all fields |
| `reset()` | `() => void` | Reset all fields to initial values |
| `setFieldValue(field, value)` | `Function` | Set a single field's value |
| `setFieldError(field, error)` | `Function` | Set a single field's error |
| `setErrors(errors)` | `Function` | Set multiple field errors |
| `clearErrors()` | `() => void` | Clear all errors |
| `resetField(field)` | `Function` | Reset a single field |

```tsx
const form = useForm({
  initialValues: { email: "", remember: false },
  onSubmit: async (values) => console.log(values),
})

// Bind text input:
<input {...form.register("email")} />

// Bind checkbox:
<input type="checkbox" {...form.register("remember", { type: "checkbox" })} />

// Bind number input:
<input type="number" {...form.register("age", { type: "number" })} />
```

### `useField(form, name)`

Extract a single field's state with computed helpers. Useful for building isolated field components.

| Parameter | Type | Description |
| --- | --- | --- |
| `form` | `FormState<TValues>` | Form instance from `useForm` |
| `name` | `keyof TValues & string` | Field name |

**Returns:** `UseFieldResult<T>` with `value`, `error`, `touched`, `dirty`, `setValue`, `setTouched`, `reset`, `register`, `hasError` (Computed), `showError` (Computed: touched AND has error).

```tsx
function EmailField({ form }) {
  const field = useField(form, "email")
  return () => (
    <div>
      <input {...field.register()} />
      {() => field.showError() ? <span>{field.error()}</span> : null}
    </div>
  )
}
```

### `useFieldArray(initial?)`

Manage a dynamic array of form fields with stable keys for keyed rendering.

| Parameter | Type | Description |
| --- | --- | --- |
| `initial` | `T[]` | Initial array values (default: `[]`) |

**Returns:** `UseFieldArrayResult<T>` with:

| Property | Type | Description |
| --- | --- | --- |
| `items` | `Signal<FieldArrayItem<T>[]>` | Reactive list with `{ key, value }` items |
| `length` | `Computed<number>` | Number of items |
| `append(value)` | `(value: T) => void` | Add to end |
| `prepend(value)` | `(value: T) => void` | Add to start |
| `insert(index, value)` | `Function` | Insert at index |
| `remove(index)` | `(index: number) => void` | Remove at index |
| `update(index, value)` | `Function` | Update item at index |
| `move(from, to)` | `Function` | Move item between indices |
| `swap(a, b)` | `Function` | Swap two items |
| `replace(values)` | `(values: T[]) => void` | Replace all items |
| `values()` | `() => T[]` | Get current values as plain array |

```ts
const tags = useFieldArray<string>(["typescript"])
tags.append("pyreon")
tags.items()  // [{ key: 0, value: Signal("typescript") }, { key: 1, value: Signal("pyreon") }]
```

### `useWatch(form, name?)`

Watch specific field values reactively.

| Signature | Returns |
| --- | --- |
| `useWatch(form, "email")` | `Signal<string>` — single field value |
| `useWatch(form, ["first", "last"])` | `[Signal, Signal]` — tuple of field signals |
| `useWatch(form)` | `Computed<TValues>` — all fields as object |

```ts
const email = useWatch(form, "email")
// email() re-evaluates reactively when the email field changes

const all = useWatch(form)
// all() => { email: "...", password: "..." }
```

### `useFormState(form, selector?)`

Subscribe to the full form state as a computed signal. Optionally pass a selector for fine-grained reactivity.

| Parameter | Type | Description |
| --- | --- | --- |
| `form` | `FormState<TValues>` | Form instance |
| `selector` | `(state: FormStateSummary) => R` | Optional projection function |

**Returns:** `Computed<FormStateSummary>` or `Computed<R>` when using a selector.

`FormStateSummary` contains: `isSubmitting`, `isValidating`, `isValid`, `isDirty`, `submitCount`, `submitError`, `touchedFields`, `dirtyFields`, `errors`.

```ts
const state = useFormState(form)
state().isValid  // boolean

const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting)
canSubmit()  // boolean
```

### `FormProvider` / `useFormContext()`

Context pattern for sharing a form instance with nested components.

```tsx
// Parent:
<FormProvider form={form}>
  <EmailField />
</FormProvider>

// Child:
function EmailField() {
  const form = useFormContext<{ email: string }>()
  return () => <input {...form.register("email")} />
}
```

## Patterns

### Server-Side Validation

Use `setErrors()` to apply errors returned from your API.

```ts
const form = useForm({
  initialValues: { email: "" },
  onSubmit: async (values) => {
    const res = await fetch("/api/register", { method: "POST", body: JSON.stringify(values) })
    if (!res.ok) {
      const errors = await res.json()
      form.setErrors(errors)  // { email: "Already taken" }
    }
  },
})
```

### Schema Validation

Use `@pyreon/validation` adapters for schema-level validation.

```ts
import { zodSchema } from "@pyreon/validation"
import { z } from "zod"

const form = useForm({
  initialValues: { email: "", age: 0 },
  schema: zodSchema(z.object({ email: z.string().email(), age: z.number().min(13) })),
  onSubmit: async (values) => { ... },
})
```

## Types

| Type | Description |
| --- | --- |
| `Accessor<T>` | `Signal<T> \| Computed<T>` — a readable reactive value |
| `FormState<TValues>` | Full form instance returned by `useForm` |
| `FieldState<T>` | Per-field state: `value`, `error`, `touched`, `dirty`, `setValue`, `setTouched`, `reset` |
| `FieldRegisterProps<T>` | Props returned by `register()`: `value`, `onInput`, `onBlur`, `checked?` |
| `UseFormOptions<TValues>` | Options for `useForm` |
| `ValidateFn<T, TValues>` | `(value: T, allValues: TValues) => ValidationError \| Promise<ValidationError>` |
| `SchemaValidateFn<TValues>` | `(values: TValues) => Record<keyof TValues, string>` |
| `ValidationError` | `string \| undefined` |
| `FieldArrayItem<T>` | `{ key: number, value: Signal<T> }` |
| `UseFieldArrayResult<T>` | Return type of `useFieldArray` |
| `UseFieldResult<T>` | Return type of `useField` |
| `FormStateSummary<TValues>` | Snapshot object returned by `useFormState` |

## Gotchas

- `register()` results are memoized per field+type combo. Calling `register("email")` twice returns the same object.
- `validateOn: "change"` creates an `effect()` per field — for large forms, prefer `"blur"` or `"submit"`.
- Field validators receive all current form values as the second argument for cross-field validation.
- `handleSubmit` marks all fields as touched before validating, so error messages appear on submit.
- Debounce timers and in-flight validators are automatically cleaned up on component unmount.
