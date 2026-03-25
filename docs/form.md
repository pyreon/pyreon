# @pyreon/form

Reactive form state management with field-level validation, debouncing, schema integration, and dynamic field arrays.

## Installation

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
      email: (value) => (!value.includes("@") ? "Invalid email" : undefined),
      password: (value) => (value.length < 8 ? "Too short" : undefined),
    },
    onSubmit: async (values) => {
      await api.login(values)
    },
  })

  return (
    <form onSubmit={form.handleSubmit}>
      <input {...form.register("email")} />
      <span>{form.fields.email.error()}</span>

      <input {...form.register("password")} type="password" />
      <span>{form.fields.password.error()}</span>

      <button type="submit">Submit</button>
    </form>
  )
}
```

## API

### `useForm(options)`

Create a reactive form instance.

**Options:**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `initialValues` | `TValues` | required | Initial field values |
| `onSubmit` | `(values: TValues) => void \| Promise<void>` | required | Submit handler |
| `validators` | `Partial<Record<keyof TValues, ValidateFn>>` | — | Per-field validators |
| `schema` | `SchemaValidateFn<TValues>` | — | Schema-level validator (e.g. from `@pyreon/validation`) |
| `validateOn` | `"blur" \| "change" \| "submit"` | `"blur"` | When to trigger validation |
| `debounceMs` | `number` | — | Debounce delay for async validators |

**Returns:** `FormState<TValues>`

### Form State

| Property | Type | Description |
| --- | --- | --- |
| `fields` | `Record<keyof TValues, FieldState>` | Per-field reactive state |
| `isSubmitting` | `Signal<boolean>` | Submission in progress |
| `isValidating` | `Signal<boolean>` | Async validation in progress |
| `isValid` | `Accessor<boolean>` | No field errors (computed — read-only) |
| `isDirty` | `Accessor<boolean>` | Any field changed from initial (computed — read-only) |
| `submitCount` | `Signal<number>` | Number of submit attempts |
| `submitError` | `Signal<unknown>` | Last error thrown by `onSubmit` |

### Form Methods

```ts
form.values()                        // Get all current values
form.errors()                        // Get all current errors
form.setFieldValue("email", "a@b.c") // Set a field value
form.setFieldError("email", "Taken") // Set a field error
form.setErrors({ email: "Taken" })   // Set multiple errors
form.clearErrors()                   // Clear all errors
form.resetField("email")             // Reset one field to initial
form.reset()                         // Reset entire form
form.validate()                      // Validate all fields, returns Promise<boolean>
form.handleSubmit(event?)            // Validate + submit
```

### `register(field, options?)`

Returns props for binding to an input element:

```ts
const props = form.register("email")
// { value: Signal<string>, onInput: (e) => void, onBlur: () => void }

// Checkbox:
const checkProps = form.register("agree", { type: "checkbox" })
// Also includes: checked: Accessor<boolean>

// Number (uses valueAsNumber on input):
const numProps = form.register("age", { type: "number" })
```

### Field State

Each field in `form.fields` provides:

| Property | Type | Description |
| --- | --- | --- |
| `value` | `Signal<T>` | Current value |
| `error` | `Signal<string \| undefined>` | Validation error |
| `touched` | `Signal<boolean>` | Has been blurred |
| `dirty` | `Signal<boolean>` | Changed from initial value |
| `setValue(value)` | `(T) => void` | Set value programmatically |
| `setTouched()` | `() => void` | Mark as touched |
| `reset()` | `() => void` | Reset to initial value |

### Validation

**Per-field validators** receive the field value and all form values:

```ts
type ValidateFn<T, TValues> = (
  value: T,
  values: TValues,
) => ValidationError | Promise<ValidationError>

// ValidationError = string | undefined
```

**Schema validators** validate the entire form at once (can be sync or async):

```ts
type SchemaValidateFn<TValues> = (
  values: TValues,
) => Partial<Record<keyof TValues, ValidationError>>
   | Promise<Partial<Record<keyof TValues, ValidationError>>>
```

Use `@pyreon/validation` for Zod, Valibot, or ArkType integration.

### Validation Modes

```ts
// Validate on blur (default)
useForm({ validateOn: "blur", ... })

// Validate on every keystroke
useForm({ validateOn: "change", ... })

// Validate only on submit
useForm({ validateOn: "submit", ... })
```

### Debouncing

```ts
useForm({
  debounceMs: 300, // Wait 300ms after last change before validating
  validators: {
    username: async (value) => {
      const taken = await api.checkUsername(value)
      return taken ? "Username taken" : undefined
    },
  },
  ...
})
```

## useField

Extract a single field's state and helpers from a form instance. Useful for building isolated field components.

```tsx
import { useField } from "@pyreon/form"

function EmailField({ form }: { form: FormState<{ email: string }> }) {
  const field = useField(form, "email")
  return (
    <>
      <input {...field.register()} />
      {field.showError() && <span>{field.error()}</span>}
    </>
  )
}
```

**Returns:** `UseFieldResult<T>` with all `FieldState` properties plus:

| Property | Type | Description |
| --- | --- | --- |
| `register(opts?)` | `(opts?) => FieldRegisterProps<T>` | Register props for input binding |
| `hasError` | `Computed<boolean>` | Whether the field has an error |
| `showError` | `Computed<boolean>` | Whether to show the error (touched + has error) |

## useWatch

Watch specific field values reactively. Returns a signal or computed that re-evaluates when watched fields change.

```ts
import { useWatch } from "@pyreon/form"

// Watch a single field
const email = useWatch(form, "email")
// email() => current email value

// Watch multiple fields
const [first, last] = useWatch(form, ["firstName", "lastName"])
// first() => firstName value, last() => lastName value

// Watch all fields
const all = useWatch(form)
// all() => { email: '...', password: '...' }
```

## useFormState

Subscribe to the full form state as a single computed signal. Useful for rendering form-level UI (submit button disabled state, error summaries, progress indicators).

```ts
import { useFormState } from "@pyreon/form"

const state = useFormState(form)
// state() => { isSubmitting, isValid, isDirty, errors, touchedFields, dirtyFields, ... }

// Use a selector for fine-grained reactivity
const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting)
```

**`FormStateSummary<TValues>`:**

| Property | Type | Description |
| --- | --- | --- |
| `isSubmitting` | `boolean` | Whether the form is being submitted |
| `isValidating` | `boolean` | Whether async validation is running |
| `isValid` | `boolean` | Whether the form has no errors |
| `isDirty` | `boolean` | Whether any field differs from initial |
| `submitCount` | `number` | Number of submit attempts |
| `submitError` | `unknown` | Last submit error |
| `touchedFields` | `Partial<Record<keyof TValues, boolean>>` | Which fields have been touched |
| `dirtyFields` | `Partial<Record<keyof TValues, boolean>>` | Which fields are dirty |
| `errors` | `Partial<Record<keyof TValues, ValidationError>>` | Current field errors |

## Context Pattern

### `FormProvider` + `useFormContext()`

Provide a form instance to the component tree, then consume it in any descendant:

```tsx
import { useForm, FormProvider, useFormContext } from "@pyreon/form"

const form = useForm({
  initialValues: { email: "" },
  onSubmit: async (values) => { ... },
})

function App() {
  return (
    <FormProvider form={form}>
      <EmailField />
      <SubmitButton />
    </FormProvider>
  )
}

function EmailField() {
  const form = useFormContext<{ email: string }>()
  return <input {...form.register("email")} />
}
```

`useFormContext()` throws if called outside a `FormProvider`.

## useFieldArray

Manage dynamic arrays of form fields with stable keys for efficient rendering.

```ts
import { useFieldArray } from "@pyreon/form"

const tags = useFieldArray<string>(["typescript"])

tags.append("pyreon")
tags.prepend("reactive")
tags.items() // [{ key: 0, value: Signal }, { key: 1, value: Signal }, ...]
```

**Methods:**

| Method | Description |
| --- | --- |
| `items` | `Signal<FieldArrayItem<T>[]>` — array with stable keys |
| `length` | `Signal<number>` — array length |
| `append(value)` | Add item to end |
| `prepend(value)` | Add item to start |
| `insert(index, value)` | Insert at index |
| `remove(index)` | Remove at index |
| `update(index, value)` | Update item value |
| `move(from, to)` | Move item between indices |
| `swap(a, b)` | Swap two items |
| `replace(values)` | Replace all items |
| `values()` | Get plain array of current values |

Each item has a stable `key` (number) for keyed rendering and a reactive `value` signal.

## Types

| Type | Description |
| --- | --- |
| `Accessor<T>` | `Signal<T> \| Computed<T>` — a reactive value that can be read by calling it |
| `UseFormOptions<TValues>` | Form configuration options |
| `FormState<TValues>` | Return type of `useForm` |
| `FieldState<T>` | Per-field reactive state |
| `FieldRegisterProps<T>` | Props returned by `register()` |
| `UseFieldResult<T>` | Return type of `useField` |
| `FormStateSummary<TValues>` | Shape returned by `useFormState` |
| `ValidateFn<T, TValues>` | Per-field validator function |
| `SchemaValidateFn<TValues>` | Schema-level validator function |
| `ValidationError` | `string \| undefined` |
| `FieldArrayItem<T>` | `{ key: number, value: Signal<T> }` |
| `UseFieldArrayResult<T>` | Return type of `useFieldArray` |

## Devtools

Import from `@pyreon/form/devtools` for runtime inspection:

```ts
import {
  registerForm,
  getActiveForms,
  getFormInstance,
  getFormSnapshot,
  onFormChange,
} from "@pyreon/form/devtools"

registerForm("login", form)            // Register a form instance for inspection
getActiveForms()                        // Map of all registered form instances
getFormInstance("login")                // Get a specific form instance
getFormSnapshot("login")               // { values, errors, isDirty, isValid, ... }
onFormChange("login", (snapshot) => {
  console.log("Form changed:", snapshot)
}) // Returns unsubscribe function
```

## Gotchas

**All state properties are signals.** Read them with `()`: `form.isValid()`, `field.value()`.

**Dirty detection uses shallow structural equality.** Objects and arrays are compared by value, not reference.

**Debounce timers are cleaned up on unmount.** No stale validation after component removal.
