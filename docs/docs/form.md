---
title: Form
description: Signal-based form state management with validation, field arrays, and input binding.
---

`@pyreon/form` provides reactive form handling built on `@pyreon/reactivity` signals. Each field's value, error, touched, and dirty state is a fine-grained signal, so only the parts of your UI that depend on a specific field re-render when it changes. Supports per-field and schema-level validation, async validators, debouncing, cross-field validation, dynamic field arrays, and input binding.

<PackageBadge name="@pyreon/form" href="/docs/form" />

## Installation

::: code-group
```bash [npm]
npm install @pyreon/form
```
```bash [bun]
bun add @pyreon/form
```
```bash [pnpm]
pnpm add @pyreon/form
```
```bash [yarn]
yarn add @pyreon/form
```
:::

## Basic Usage

Use `useForm` to create a form with initial values, validators, and a submit handler.

```ts
import { useForm } from '@pyreon/form'

const form = useForm({
  initialValues: { email: '', password: '', remember: false },
  validators: {
    email: (value) => (!value ? 'Email is required' : undefined),
    password: (value) =>
      value.length < 8 ? 'Password must be at least 8 characters' : undefined,
  },
  onSubmit: async (values) => {
    await loginApi(values)
  },
})
```

`useForm` must be called inside a Pyreon component (it uses `onUnmount` for debounce timer cleanup).

### The Accessor Type

Throughout the form API, you will see `Accessor<T>` used for read-only reactive values. This is a union type that covers both `Signal<T>` and `Computed<T>`:

```ts
type Accessor<T> = Signal<T> | Computed<T>
```

For example, `isValid` and `isDirty` on the form state are `Accessor<boolean>` -- they are computed values that you read by calling them (`form.isValid()`), but you cannot write to them directly.

## useForm Options

The `useForm` function accepts a `UseFormOptions<TValues>` object:

### `initialValues` (required)

A plain object defining each field and its initial value. The keys become the field names, and the value types define the TypeScript types for each field.

```ts
const form = useForm({
  initialValues: {
    email: '',
    password: '',
    age: 0,
    remember: false,
    tags: ['default'] as string[],
    address: { city: '', zip: '' },
  },
  onSubmit: async (values) => { /* ... */ },
})
```

### `onSubmit` (required)

Called with the validated form values when `handleSubmit` runs and all validation passes. Can be synchronous or async. If it throws, the error is captured in `submitError`.

```ts
const form = useForm({
  initialValues: { email: '', password: '' },
  onSubmit: async (values) => {
    const response = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify(values),
    })
    if (!response.ok) {
      throw new Error('Login failed')
    }
  },
})
```

### `validators`

Per-field validator functions. Each validator receives the field's current value and all current form values (for cross-field validation). It can return a `string` error message or `undefined` for valid. Validators can be synchronous or async.

```ts
const form = useForm({
  initialValues: { password: '', confirmPassword: '' },
  validators: {
    password: (value) => {
      if (!value) return 'Required'
      if (value.length < 8) return 'Must be at least 8 characters'
      if (!/[A-Z]/.test(value)) return 'Must contain an uppercase letter'
      return undefined
    },
    confirmPassword: (value, allValues) =>
      value !== allValues.password ? 'Passwords must match' : undefined,
  },
  onSubmit: async (values) => { /* ... */ },
})
```

### `schema`

A schema-level validator that runs after all field-level validators. It receives all form values and returns a partial record of field names to error messages. Useful for cross-field validation logic that does not belong to any single field.

```ts
const form = useForm({
  initialValues: { startDate: '', endDate: '' },
  schema: (values) => {
    const errors: Partial<Record<string, string>> = {}
    if (values.startDate && values.endDate) {
      if (new Date(values.startDate) > new Date(values.endDate)) {
        errors.endDate = 'End date must be after start date'
      }
    }
    return errors
  },
  onSubmit: async (values) => { /* ... */ },
})
```

The schema validator can also be async:

```ts
schema: async (values) => {
  const serverErrors = await validateOnServer(values)
  return serverErrors
},
```

### `validateOn`

Controls when field-level validation runs. Defaults to `'blur'`.

| Value | Behavior |
| --- | --- |
| `'blur'` | Validate when a field is blurred (via `setTouched()` or `register()` onBlur) |
| `'change'` | Validate on every value change (via an `effect` on the value signal) |
| `'submit'` | Only validate when `handleSubmit` or `validate()` is called |

```ts
// Validate on every keystroke
const form = useForm({
  initialValues: { search: '' },
  validators: {
    search: (v) => (v.length > 100 ? 'Too long' : undefined),
  },
  validateOn: 'change',
  onSubmit: async (values) => { /* ... */ },
})

// Only validate on submit -- no intermediate validation
const form = useForm({
  initialValues: { email: '' },
  validators: {
    email: (v) => (!v ? 'Required' : undefined),
  },
  validateOn: 'submit',
  onSubmit: async (values) => { /* ... */ },
})
```

With `validateOn: 'submit'`, neither blur nor value changes trigger validation. The user sees errors only after attempting to submit:

```ts
form.fields.email.setTouched()  // no validation
form.fields.email.setValue('x')  // no validation
await form.handleSubmit()        // now validates and shows errors
```

### `debounceMs`

Debounce delay in milliseconds for field validators. When set, validation calls are debounced -- rapid changes only trigger one validation after the delay. Useful for async validators like username availability checks.

```ts
const form = useForm({
  initialValues: { username: '' },
  validators: {
    username: async (value) => {
      if (!value) return 'Required'
      const taken = await checkUsernameAvailability(value)
      return taken ? 'Username is already taken' : undefined
    },
  },
  validateOn: 'change',
  debounceMs: 300,
  onSubmit: async (values) => { /* ... */ },
})
```

Important behaviors with `debounceMs`:

- **`validate()` and `handleSubmit()` bypass debounce** and run validators immediately
- **`reset()` clears pending debounce timers**
- Debounce timers are cleaned up on component unmount

## Binding Inputs with `register()`

The `register()` method returns props for binding an input element to a field. It provides a reactive `value` signal, an `onInput` handler that updates the field value and dirty state, and an `onBlur` handler that marks the field as touched (which triggers blur validation if configured).

### Text Inputs

```tsx
const LoginForm = defineComponent(() => {
  const form = useForm({
    initialValues: { email: '', password: '' },
    onSubmit: async (values) => { /* ... */ },
  })

  return () => (
    <form onSubmit={form.handleSubmit}>
      <input type="email" placeholder="Email" {...form.register('email')} />
      <input type="password" placeholder="Password" {...form.register('password')} />
      <button type="submit">Log In</button>
    </form>
  )
})
```

### Checkboxes

Pass `&#123; type: 'checkbox' &#125;` to `register()` to get a `checked` signal that tracks the boolean value. The `onInput` handler reads `e.target.checked` instead of `e.target.value`.

```tsx
<input type="checkbox" {...form.register('remember', { type: 'checkbox' })} />
```

### Number Inputs

Pass `&#123; type: 'number' &#125;` to `register()` to use `valueAsNumber` on the input event, so the field value stays a `number` rather than a string:

```tsx
<input type="number" {...form.register('age', { type: 'number' })} />
```

### How register() Works Internally

`register()` returns a `FieldRegisterProps<T>` object:

```ts
interface FieldRegisterProps<T> {
  value: Signal<T>             // the field's value signal (bind to input value)
  onInput: (e: Event) => void  // updates field value and dirty state
  onBlur: () => void           // marks field as touched, triggers blur validation
  checked?: Accessor<boolean>  // only present for checkbox type
}
```

The returned props are memoized per field+type combination, so calling `register('email')` multiple times returns the same object:

```ts
const first = form.register('email')
const second = form.register('email')
first === second  // true
```

## Field State

Each field in `form.fields` has its own reactive state with fine-grained signals.

### Reading Field State

```ts
const { fields } = form

// Reactive reads -- trigger re-render in components
fields.email.value()    // current value (e.g., "alice@example.com")
fields.email.error()    // validation error or undefined
fields.email.touched()  // true after first blur
fields.email.dirty()    // true if value differs from initial
```

### Updating Field State

```ts
// Set the field value (marks dirty if different from initial)
fields.email.setValue('new@example.com')

// Mark as touched (triggers blur validation if validateOn is 'blur')
fields.email.setTouched()

// Reset to initial value, clear error/touched/dirty
fields.email.reset()
```

### FieldState Interface

| Property | Type | Description |
| --- | --- | --- |
| `value` | `Signal<T>` | Current field value |
| `error` | `Signal<string \| undefined>` | Validation error message |
| `touched` | `Signal<boolean>` | Whether the field has been blurred at least once |
| `dirty` | `Signal<boolean>` | Whether the value differs from its initial value |
| `setValue(value)` | `(value: T) => void` | Set the field value and update dirty state |
| `setTouched()` | `() => void` | Mark as touched, trigger blur validation |
| `reset()` | `() => void` | Reset to initial value, clear all state |

### Dirty Detection

The `dirty` signal uses structural equality for objects and arrays, so setting a value back to its initial value clears the dirty flag:

```ts
const form = useForm({
  initialValues: { email: 'original', tags: ['a', 'b'] },
  onSubmit: async () => {},
})

form.fields.email.setValue('changed')
form.fields.email.dirty()  // true

form.fields.email.setValue('original')
form.fields.email.dirty()  // false

form.fields.tags.setValue(['a', 'b', 'c'])
form.fields.tags.dirty()  // true

form.fields.tags.setValue(['a', 'b'])
form.fields.tags.dirty()  // false
```

Object fields compare keys and values shallowly:

```ts
const form = useForm({
  initialValues: { address: { city: 'NYC', zip: '10001' } },
  onSubmit: async () => {},
})

form.fields.address.setValue({ city: 'NYC', zip: '10001' })
form.fields.address.dirty()  // false (same structure)

form.fields.address.setValue({ city: 'LA', zip: '90001' })
form.fields.address.dirty()  // true
```

## Validation

### Per-Field Validators

Validators receive the field value and all current form values. They return an error string or `undefined`:

```ts
type ValidateFn<T, TValues> = (
  value: T,
  allValues: TValues,
) => string | undefined | Promise<string | undefined>
```

### Cross-Field Validation

The second argument to validators gives access to all form values, enabling cross-field validation:

```ts
const form = useForm({
  initialValues: { password: '', confirmPassword: '' },
  validators: {
    confirmPassword: (value, allValues) =>
      value !== allValues.password ? 'Passwords must match' : undefined,
  },
  onSubmit: async (values) => { /* ... */ },
})
```

### Schema Validation

The `schema` validator runs after all field-level validators:

```ts
type SchemaValidateFn<TValues> = (
  values: TValues,
) => Partial<Record<keyof TValues, string | undefined>>
   | Promise<Partial<Record<keyof TValues, string | undefined>>>
```

If both field validators and schema validator report errors for the same field, the schema validator's error takes precedence (it runs last).

### Async Validators

Both field-level and schema-level validators can be async:

```ts
const form = useForm({
  initialValues: { username: '' },
  validators: {
    username: async (value) => {
      if (!value) return 'Required'
      // Simulate API call
      await new Promise((r) => setTimeout(r, 500))
      const available = await checkUsername(value)
      return available ? undefined : 'Username is taken'
    },
  },
  onSubmit: async (values) => { /* ... */ },
})
```

Async validators use version tracking to discard stale results. If the value changes while an async validator is running, the result of the stale validation is ignored.

### Validation with Zod Integration

Use the `schema` option to integrate with Zod or similar validation libraries:

```ts
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Must be at least 8 characters'),
})

const form = useForm({
  initialValues: { email: '', password: '' },
  schema: (values) => {
    const result = loginSchema.safeParse(values)
    if (result.success) return {}

    const errors: Partial<Record<string, string>> = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0] as string
      if (field && !errors[field]) {
        errors[field] = issue.message
      }
    }
    return errors
  },
  onSubmit: async (values) => { /* ... */ },
})
```

### Validation with Valibot Integration

```ts
import * as v from 'valibot'

const schema = v.object({
  email: v.pipe(v.string(), v.email('Invalid email')),
  password: v.pipe(v.string(), v.minLength(8, 'Too short')),
})

const form = useForm({
  initialValues: { email: '', password: '' },
  schema: (values) => {
    const result = v.safeParse(schema, values)
    if (result.success) return {}

    const errors: Partial<Record<string, string>> = {}
    for (const issue of result.issues) {
      const field = issue.path?.[0]?.key as string
      if (field && !errors[field]) {
        errors[field] = issue.message
      }
    }
    return errors
  },
  onSubmit: async (values) => { /* ... */ },
})
```

### Validation Timing Examples

**Blur validation (default)** -- errors appear after the user leaves a field:

```ts
const form = useForm({
  initialValues: { email: '' },
  validators: {
    email: (v) => (!v.includes('@') ? 'Invalid email' : undefined),
  },
  validateOn: 'blur',  // default
  onSubmit: async () => {},
})

// User types in the email field...
// No validation runs yet

// User tabs away from the field (triggers blur):
form.fields.email.setTouched()
// Validator runs, error appears if invalid
```

**Change validation** -- errors appear immediately as the user types:

```ts
const form = useForm({
  initialValues: { search: '' },
  validators: {
    search: (v) => (v.length > 100 ? 'Query too long' : undefined),
  },
  validateOn: 'change',
  onSubmit: async () => {},
})

// Every setValue or typed character triggers validation
```

**Submit-only validation** -- cleanest UX for simple forms:

```ts
const form = useForm({
  initialValues: { email: '', password: '' },
  validators: {
    email: (v) => (!v ? 'Required' : undefined),
    password: (v) => (v.length < 8 ? 'Too short' : undefined),
  },
  validateOn: 'submit',
  onSubmit: async () => {},
})

// No validation on blur or change
// Errors only appear after form.handleSubmit()
```

## Form-Level State

| Property | Type | Description |
| --- | --- | --- |
| `isSubmitting` | `Signal<boolean>` | `true` while `onSubmit` is running |
| `isValidating` | `Signal<boolean>` | `true` while async validation is running |
| `isValid` | `Accessor<boolean>` | `true` when no field has an error (computed -- read-only) |
| `isDirty` | `Accessor<boolean>` | `true` when any field value differs from initial (computed -- read-only) |
| `submitCount` | `Signal<number>` | Number of times submit has been attempted |
| `submitError` | `Signal<unknown>` | Error thrown by `onSubmit`, if any |

### Tracking Submit State

```tsx
const SubmitButton = defineComponent(() => {
  return () => (
    <button
      type="submit"
      disabled={form.isSubmitting() || !form.isValid()}
    >
      {form.isSubmitting() ? 'Submitting...' : 'Submit'}
    </button>
  )
})
```

### Tracking Validation State

```tsx
const ValidatingIndicator = defineComponent(() => {
  return () => (
    form.isValidating()
      ? <span class="spinner">Validating...</span>
      : null
  )
})
```

### Submit Error Handling

```tsx
const SubmitError = defineComponent(() => {
  return () => {
    const err = form.submitError()
    if (!err) return null
    return (
      <div class="error-banner">
        {err instanceof Error ? err.message : 'An error occurred'}
      </div>
    )
  }
})
```

## Form Methods

### `handleSubmit(event?)`

The primary submit handler. When called:

1. Calls `preventDefault()` on the event (if provided)
2. Clears `submitError`
3. Increments `submitCount`
4. Marks all fields as touched
5. Runs validation on all fields (field-level then schema-level)
6. If all valid, sets `isSubmitting` to `true` and calls `onSubmit`
7. If `onSubmit` throws, captures the error in `submitError` and re-throws

```tsx
// Use directly as form onSubmit handler
<form onSubmit={form.handleSubmit}>

// Or call programmatically
<button onClick={() => form.handleSubmit()}>Submit</button>
```

### `validate()`

Manually validate all fields. Returns `Promise<boolean>` indicating validity. Bypasses debounce and runs validators immediately. Does not call `onSubmit` or mark fields as touched.

```ts
const isValid = await form.validate()
if (isValid) {
  // Proceed with something
}
```

### `reset()`

Reset the entire form:

- Restores all fields to their initial values
- Clears all errors, touched, and dirty states
- Resets `submitCount` to 0
- Clears `submitError`
- Cancels any pending debounce timers

```ts
form.reset()
```

### `values()`

Get all current form values as a plain object:

```ts
const currentValues = form.values()
// { email: "alice@example.com", password: "secret123" }
```

### `errors()`

Get all current errors as a partial record. Only fields with errors are included:

```ts
const currentErrors = form.errors()
// { email: "Required" }
// (password has no error, so it's not in the object)
```

### `setFieldValue(field, value)`

Programmatically set a single field's value. Marks the field as dirty if the new value differs from the initial value:

```ts
form.setFieldValue('email', 'user@example.com')
```

If the field does not exist, this is a no-op.

### `setFieldError(field, error)`

Programmatically set a single field's error. Useful for server-side validation errors:

```ts
// Set an error
form.setFieldError('email', 'This email is already registered')

// Clear an error
form.setFieldError('email', undefined)
```

### `setErrors(errors)`

Set multiple field errors at once:

```ts
// From a server response
const response = await fetch('/api/register', { /* ... */ })
if (!response.ok) {
  const { errors } = await response.json()
  form.setErrors(errors)
  // e.g., { email: "Already registered", username: "Taken" }
}
```

### `clearErrors()`

Clear all field errors at once:

```ts
form.clearErrors()
// All fields now have error = undefined
// form.isValid() returns true
```

### `resetField(field)`

Reset a single field to its initial value without affecting other fields:

```ts
form.fields.email.setValue('changed')
form.fields.password.setValue('changed')

form.resetField('email')
// email is reset: value='', dirty=false, touched=false, error=undefined
// password is unchanged: value='changed', dirty=true
```

## Field Arrays

Use `useFieldArray` to manage dynamic lists of form fields with stable keys for efficient keyed rendering.

### Basic Usage

```ts
import { useFieldArray } from '@pyreon/form'

const tags = useFieldArray<string>(['typescript', 'pyreon'])

tags.append('signals')     // add to end
tags.prepend('reactive')   // add to start
tags.insert(1, 'fast')     // insert at index
tags.remove(0)             // remove at index
tags.update(0, 'updated')  // update value at index
tags.move(0, 2)            // move item from index 0 to index 2
tags.swap(0, 1)            // swap items at indices 0 and 1
tags.replace(['new', 'list'])  // replace all items

tags.values()   // ['new', 'list']
tags.length()   // 2
```

### Stable Keys

Each item in the field array has a stable numeric `key` for efficient keyed rendering. Keys persist through operations like append, remove, and reorder -- they are never reused.

```ts
const arr = useFieldArray(['a', 'b'])
const keys1 = arr.items().map(i => i.key)  // [0, 1]

arr.append('c')
const keys2 = arr.items().map(i => i.key)  // [0, 1, 2]
// First two keys are preserved

arr.remove(1)
const keys3 = arr.items().map(i => i.key)  // [0, 2]
// Original keys are maintained
```

### Reactive Item Values

Each item's `value` is a reactive signal. You can read it reactively or update it directly:

```ts
const item = arr.items()[0]
item.value()          // read the value reactively
item.value.set('new') // update the value directly
```

### Field Array in a Component

```tsx
const TagEditor = defineComponent(() => {
  const tags = useFieldArray<string>([''])

  return () => (
    <div>
      {tags.items().map((item, index) => (
        <div key={item.key} class="tag-row">
          <input
            value={item.value()}
            onInput={(e) => tags.update(index, e.target.value)}
          />
          <button onClick={() => tags.remove(index)}>Remove</button>
        </div>
      ))}
      <button onClick={() => tags.append('')}>Add Tag</button>
      <p>Tags: {tags.values().join(', ')}</p>
    </div>
  )
})
```

### Complex Field Array Items

Field arrays work with any type, including objects:

```tsx
interface Experience {
  company: string
  title: string
  startYear: number
}

const experiences = useFieldArray<Experience>([
  { company: '', title: '', startYear: 2020 },
])

// Add a new experience entry
experiences.append({ company: '', title: '', startYear: 2024 })

// Update a specific field within an item
const current = experiences.items()[0].value()
experiences.update(0, { ...current, company: 'Acme Inc' })
```

### Reordering

```ts
const items = useFieldArray(['first', 'second', 'third'])

// Move "first" to the end
items.move(0, 2)
items.values()  // ['second', 'third', 'first']

// Swap first and last
items.swap(0, 2)
items.values()  // ['first', 'third', 'second']
```

Operations on invalid indices are no-ops -- they do not throw.

### UseFieldArrayResult

| Property / Method | Type | Description |
| --- | --- | --- |
| `items` | `Signal<FieldArrayItem<T>[]>` | Reactive list of items with stable keys |
| `length` | `Computed<number>` | Number of items |
| `append(value)` | `(value: T) => void` | Add item to the end |
| `prepend(value)` | `(value: T) => void` | Add item to the start |
| `insert(index, value)` | `(index: number, value: T) => void` | Insert at index |
| `remove(index)` | `(index: number) => void` | Remove at index |
| `update(index, value)` | `(index: number, value: T) => void` | Update item value at index |
| `move(from, to)` | `(from: number, to: number) => void` | Move item between indices |
| `swap(a, b)` | `(a: number, b: number) => void` | Swap two items |
| `replace(values)` | `(values: T[]) => void` | Replace all items |
| `values()` | `() => T[]` | Get all values as a plain array |

### FieldArrayItem

```ts
interface FieldArrayItem<T> {
  key: number         // Stable key for keyed rendering
  value: Signal<T>    // Reactive value signal
}
```

## useField

`useField` extracts a single field's state from a form, providing a focused API for building isolated field components.

```tsx
import { useField } from '@pyreon/form'

function EmailField({ form }) {
  const field = useField(form, 'email')
  return (
    <>
      <input {...field.register()} />
      {field.showError() && <span class="error">{field.error()}</span>}
    </>
  )
}
```

**Returns `UseFieldResult<T>`:**

| Property | Type | Description |
| --- | --- | --- |
| `value` | `Signal<T>` | Current field value |
| `error` | `Signal<ValidationError>` | Field error message |
| `touched` | `Signal<boolean>` | Whether the field has been touched |
| `dirty` | `Signal<boolean>` | Whether the value differs from initial |
| `setValue` | `(value: T) => void` | Set the field value |
| `setTouched` | `() => void` | Mark the field as touched |
| `reset` | `() => void` | Reset to initial value |
| `register` | `(opts?) => FieldRegisterProps` | Register props for input binding |
| `hasError` | `Computed<boolean>` | Whether the field has an error |
| `showError` | `Computed<boolean>` | Whether to display the error (touched + has error) |

## useWatch

`useWatch` lets you watch field values reactively without accessing the full form state.

```tsx
import { useWatch } from '@pyreon/form'

// Watch a single field
const email = useWatch(form, 'email')
email() // current email value

// Watch multiple fields
const [first, last] = useWatch(form, ['firstName', 'lastName'])

// Watch all fields
const all = useWatch(form)
all() // { email: '...', password: '...' }
```

## useFormState

`useFormState` subscribes to form-level state, optionally with a selector for fine-grained reactivity.

```tsx
import { useFormState } from '@pyreon/form'

// Full state
const state = useFormState(form)
state() // { isSubmitting, isValid, isDirty, errors, touchedFields, dirtyFields, submitCount, submitError }

// With selector for fine-grained reactivity
const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting)
```

**`FormStateSummary` shape:**

| Property | Type | Description |
| --- | --- | --- |
| `isSubmitting` | `boolean` | Whether the form is submitting |
| `isValidating` | `boolean` | Whether async validation is running |
| `isValid` | `boolean` | Whether all fields are valid |
| `isDirty` | `boolean` | Whether any field is dirty |
| `submitCount` | `number` | Number of submit attempts |
| `submitError` | `unknown` | Last submit error |
| `touchedFields` | `Partial<Record<K, boolean>>` | Map of touched fields |
| `dirtyFields` | `Partial<Record<K, boolean>>` | Map of dirty fields |
| `errors` | `Partial<Record<K, ValidationError>>` | Map of field errors |

## FormProvider + useFormContext

`FormProvider` and `useFormContext` enable context-based form access, eliminating the need to pass the form object through props.

```tsx
import { FormProvider, useFormContext, useForm } from '@pyreon/form'

// Parent component
function SignupPage() {
  const form = useForm({
    initialValues: { email: '', password: '' },
    onSubmit: async (values) => { /* ... */ },
  })
  return (
    <FormProvider form={form}>
      <EmailField />
      <PasswordField />
      <SubmitButton />
    </FormProvider>
  )
}

// Child components — no prop drilling
function EmailField() {
  const form = useFormContext<{ email: string; password: string }>()
  return <input {...form.register('email')} />
}

function SubmitButton() {
  const form = useFormContext()
  return (
    <button type="submit" disabled={form.isSubmitting() || !form.isValid()}>
      Submit
    </button>
  )
}
```

`FormProvider` accepts `&#123; form, children &#125;` props. `useFormContext()` throws if called outside a `FormProvider`.

## Real-World Examples

### Login Form

```tsx
const LoginForm = defineComponent(() => {
  const form = useForm({
    initialValues: { email: '', password: '', remember: false },
    validators: {
      email: (v) => {
        if (!v) return 'Email is required'
        if (!v.includes('@')) return 'Invalid email address'
        return undefined
      },
      password: (v) =>
        !v ? 'Password is required' : undefined,
    },
    onSubmit: async (values) => {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Login failed')
      }
    },
  })

  return () => (
    <form onSubmit={form.handleSubmit} class="login-form">
      <div class="field">
        <label for="email">Email</label>
        <input id="email" type="email" {...form.register('email')} />
        {form.fields.email.touched() && form.fields.email.error() && (
          <span class="error">{form.fields.email.error()}</span>
        )}
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" {...form.register('password')} />
        {form.fields.password.touched() && form.fields.password.error() && (
          <span class="error">{form.fields.password.error()}</span>
        )}
      </div>

      <label class="checkbox-label">
        <input type="checkbox" {...form.register('remember', { type: 'checkbox' })} />
        Remember me
      </label>

      {form.submitError() && (
        <div class="error-banner">
          {(form.submitError() as Error).message}
        </div>
      )}

      <button type="submit" disabled={form.isSubmitting()}>
        {form.isSubmitting() ? 'Logging in...' : 'Log In'}
      </button>
    </form>
  )
})
```

### Registration Form with Async Validation

```tsx
const RegistrationForm = defineComponent(() => {
  const form = useForm({
    initialValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    validators: {
      username: async (value) => {
        if (!value) return 'Required'
        if (value.length < 3) return 'Must be at least 3 characters'
        const res = await fetch(`/api/check-username?q=${value}`)
        const { available } = await res.json()
        return available ? undefined : 'Username is taken'
      },
      email: (value) => {
        if (!value) return 'Required'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email'
        return undefined
      },
      password: (value) => {
        if (!value) return 'Required'
        if (value.length < 8) return 'Must be at least 8 characters'
        return undefined
      },
      confirmPassword: (value, all) =>
        value !== all.password ? 'Passwords must match' : undefined,
    },
    validateOn: 'blur',
    debounceMs: 500,  // debounce the async username check
    onSubmit: async (values) => {
      await fetch('/api/register', {
        method: 'POST',
        body: JSON.stringify(values),
      })
    },
  })

  return () => (
    <form onSubmit={form.handleSubmit}>
      <div class="field">
        <input placeholder="Username" {...form.register('username')} />
        {form.fields.username.error() && (
          <span class="error">{form.fields.username.error()}</span>
        )}
      </div>

      <div class="field">
        <input type="email" placeholder="Email" {...form.register('email')} />
        {form.fields.email.error() && (
          <span class="error">{form.fields.email.error()}</span>
        )}
      </div>

      <div class="field">
        <input type="password" placeholder="Password" {...form.register('password')} />
        {form.fields.password.error() && (
          <span class="error">{form.fields.password.error()}</span>
        )}
      </div>

      <div class="field">
        <input
          type="password"
          placeholder="Confirm Password"
          {...form.register('confirmPassword')}
        />
        {form.fields.confirmPassword.error() && (
          <span class="error">{form.fields.confirmPassword.error()}</span>
        )}
      </div>

      <button type="submit" disabled={form.isSubmitting() || form.isValidating()}>
        {form.isSubmitting() ? 'Creating account...' : 'Register'}
      </button>
    </form>
  )
})
```

### Dynamic Survey Form

```tsx
interface Question {
  text: string
  answer: string
}

const SurveyForm = defineComponent(() => {
  const questions = useFieldArray<Question>([
    { text: '', answer: '' },
  ])

  const form = useForm({
    initialValues: { title: '', description: '' },
    validators: {
      title: (v) => (!v ? 'Survey title is required' : undefined),
    },
    onSubmit: async (values) => {
      const surveyData = {
        ...values,
        questions: questions.values(),
      }
      await fetch('/api/surveys', {
        method: 'POST',
        body: JSON.stringify(surveyData),
      })
    },
  })

  return () => (
    <form onSubmit={form.handleSubmit}>
      <input placeholder="Survey Title" {...form.register('title')} />
      {form.fields.title.error() && (
        <span class="error">{form.fields.title.error()}</span>
      )}

      <textarea placeholder="Description" {...form.register('description')} />

      <h3>Questions ({questions.length()})</h3>

      {questions.items().map((item, index) => (
        <div key={item.key} class="question-card">
          <input
            placeholder={`Question ${index + 1}`}
            value={item.value().text}
            onInput={(e) =>
              questions.update(index, {
                ...item.value(),
                text: e.target.value,
              })
            }
          />
          <div class="question-actions">
            <button
              type="button"
              onClick={() => {
                if (index > 0) questions.move(index, index - 1)
              }}
            >
              Move Up
            </button>
            <button type="button" onClick={() => questions.remove(index)}>
              Remove
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => questions.append({ text: '', answer: '' })}
      >
        Add Question
      </button>

      <button type="submit" disabled={form.isSubmitting()}>
        {form.isSubmitting() ? 'Saving...' : 'Save Survey'}
      </button>
    </form>
  )
})
```

### Server-Side Error Handling

```ts
const form = useForm({
  initialValues: { email: '', password: '' },
  onSubmit: async (values) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify(values),
    })

    if (!res.ok) {
      const data = await res.json()

      // Apply server-side field errors
      if (data.fieldErrors) {
        form.setErrors(data.fieldErrors)
        // e.g., { email: "Not found", password: "Incorrect" }
      }

      throw new Error(data.message || 'Request failed')
    }
  },
})
```

## TypeScript Form Typing

`useForm` infers field types from `initialValues`:

```ts
const form = useForm({
  initialValues: {
    name: '',          // string
    age: 0,            // number
    active: false,     // boolean
    tags: [] as string[], // string[]
  },
  onSubmit: async (values) => {
    // values is typed as:
    // { name: string; age: number; active: boolean; tags: string[] }
  },
})

form.fields.name.value()    // string
form.fields.age.value()     // number
form.fields.active.value()  // boolean
form.fields.tags.value()    // string[]

// Type error: argument of type 'number' is not assignable to 'string'
form.fields.name.setValue(42)
```

You can also provide an explicit type parameter:

```ts
interface ProfileForm {
  name: string
  bio: string
  website: string
}

const form = useForm<ProfileForm>({
  initialValues: { name: '', bio: '', website: '' },
  validators: {
    name: (v) => (!v ? 'Required' : undefined),
    // TypeScript enforces that validator keys match ProfileForm keys
  },
  onSubmit: async (values: ProfileForm) => { /* ... */ },
})
```

## API Reference

### `useForm(options)`

Create a signal-based form.

**Options (`UseFormOptions<TValues>`):**

<APICard name="initialValues" type="property" signature="initialValues: TValues" description="Initial values for each field. Required." />
<APICard name="onSubmit" type="property" signature="onSubmit: (values: TValues) => void | Promise<void>" description="Submit handler called with validated values. Required." />
<APICard name="validators" type="property" signature="validators?: Partial<{ [K in keyof TValues]: ValidateFn }>" description="Per-field validator functions. Each receives the field value and all form values, returning an error string or undefined." />
<APICard name="schema" type="property" signature="schema?: SchemaValidateFn<TValues>" description="Schema-level validator that runs after all field-level validators. Returns a partial record of field names to error messages." />
<APICard name="validateOn" type="property" signature="validateOn?: 'blur' | 'change' | 'submit'" description="Controls when field-level validation runs. Defaults to 'blur'." />
<APICard name="debounceMs" type="property" signature="debounceMs?: number" description="Debounce delay in milliseconds for field validators. When set, rapid changes only trigger one validation after the delay." />

**Returns `FormState<TValues>`:**

<APICard name="fields" type="property" signature="fields: { [K in keyof TValues]: FieldState<TValues[K]> }" description="Individual field states with fine-grained reactive signals." />
<APICard name="isSubmitting" type="property" signature="isSubmitting: Signal<boolean>" description="Whether the onSubmit handler is currently running." />
<APICard name="isValidating" type="property" signature="isValidating: Signal<boolean>" description="Whether async validation is currently running." />
<APICard name="isValid" type="property" signature="isValid: Accessor<boolean>" description="Whether all fields are currently valid (no errors). Read-only computed." />
<APICard name="isDirty" type="property" signature="isDirty: Accessor<boolean>" description="Whether any field differs from its initial value. Read-only computed." />
<APICard name="submitCount" type="property" signature="submitCount: Signal<number>" description="Number of times submit has been attempted." />
<APICard name="submitError" type="property" signature="submitError: Signal<unknown>" description="Error thrown by onSubmit, if any." />
<APICard name="values" type="function" signature="values(): TValues" description="Get all current form values as a plain object." />
<APICard name="errors" type="function" signature="errors(): Partial<Record<keyof TValues, string | undefined>>" description="Get all current errors as a partial record. Only fields with errors are included." />
<APICard name="setFieldValue" type="function" signature="setFieldValue(field: keyof TValues, value: TValues[K]): void" description="Programmatically set a single field's value. Marks the field as dirty if the new value differs from the initial value." />
<APICard name="setFieldError" type="function" signature="setFieldError(field: keyof TValues, error: string | undefined): void" description="Programmatically set a single field's error. Pass undefined to clear." />
<APICard name="setErrors" type="function" signature="setErrors(errors: Partial<Record<keyof TValues, string | undefined>>): void" description="Set multiple field errors at once." />
<APICard name="clearErrors" type="function" signature="clearErrors(): void" description="Clear all field errors at once." />
<APICard name="resetField" type="function" signature="resetField(field: keyof TValues): void" description="Reset a single field to its initial value without affecting other fields." />
<APICard name="register" type="function" signature="register(field: keyof TValues, opts?: { type: 'checkbox' | 'number' }): FieldRegisterProps" description="Get input binding props for a field. Returns value, onInput, onBlur. Pass { type: 'checkbox' } for a checked accessor, or { type: 'number' } to use valueAsNumber." />
<APICard name="handleSubmit" type="function" signature="handleSubmit(event?: Event): Promise<void>" description="Submit the form. Prevents default, validates all fields, and calls onSubmit if valid." />
<APICard name="reset" type="function" signature="reset(): void" description="Reset the entire form to initial values, clearing all errors, touched, dirty states, submit count, and submit error." />
<APICard name="validate" type="function" signature="validate(): Promise<boolean>" description="Manually validate all fields. Returns whether the form is valid. Bypasses debounce." />

### `useFieldArray(initial?)`

Create a dynamic array of form fields with stable keys.

```ts
function useFieldArray<T>(initial?: T[]): UseFieldArrayResult<T>
```

### `useField(form, field)`

Extract a single field's state from a form, returning a `UseFieldResult<T>` with the field's signals, setters, and convenience computeds (`hasError`, `showError`).

```ts
function useField<TValues, K extends keyof TValues>(
  form: FormState<TValues>,
  field: K,
): UseFieldResult<TValues[K]>
```

### `useWatch(form, field?)`

Watch one or more field values reactively. Pass a single field name to get a signal for that value, an array of field names to get an array of signals, or omit the argument to watch all values.

```ts
function useWatch<TValues>(form: FormState<TValues>): Computed<TValues>
function useWatch<TValues, K extends keyof TValues>(form: FormState<TValues>, field: K): Computed<TValues[K]>
function useWatch<TValues, K extends keyof TValues>(form: FormState<TValues>, fields: K[]): Computed<TValues[K]>[]
```

### `useFormState(form, selector?)`

Subscribe to form-level state. Returns a computed signal of `FormStateSummary`, or a derived value if a selector is provided.

```ts
function useFormState<TValues>(form: FormState<TValues>): Computed<FormStateSummary<TValues>>
function useFormState<TValues, R>(form: FormState<TValues>, selector: (state: FormStateSummary<TValues>) => R): Computed<R>
```

### `FormProvider` + `useFormContext()`

Provide a form via context so descendant components can access it without prop drilling.

```ts
function FormProvider(props: { form: FormState<any>; children: any }): JSX.Element
function useFormContext<TValues>(): FormState<TValues>
```

`useFormContext()` throws if called outside a `FormProvider`.

## Type Exports

<APICard name="Accessor" type="type" signature="Accessor<T> = Signal<T> | Computed<T>" description="A reactive value that can be read by calling it. Both Signal and Computed satisfy this interface." />
<APICard name="FormState" type="type" signature="FormState<TValues>" description="Full form state object returned by useForm." />
<APICard name="UseFormOptions" type="type" signature="UseFormOptions<TValues>" description="Options for useForm." />
<APICard name="FieldState" type="type" signature="FieldState<T>" description="Per-field reactive state with value, error, touched, and dirty signals." />
<APICard name="FieldRegisterProps" type="type" signature="FieldRegisterProps<T>" description="Props returned by register() for input binding." />
<APICard name="ValidationError" type="type" signature="ValidationError = string | undefined" description="A validation error message, or undefined if valid." />
<APICard name="ValidateFn" type="type" signature="ValidateFn<T, TValues>" description="Per-field validator function that receives the field value and all form values." />
<APICard name="SchemaValidateFn" type="type" signature="SchemaValidateFn<TValues>" description="Schema-level validator function that receives all form values and returns a partial error record." />
<APICard name="FieldArrayItem" type="type" signature="FieldArrayItem<T> = { key: number; value: Signal<T> }" description="Item in a field array with a stable key for keyed rendering." />
<APICard name="UseFieldArrayResult" type="type" signature="UseFieldArrayResult<T>" description="Return type of useFieldArray with methods for array manipulation." />
<APICard name="UseFieldResult" type="type" signature="UseFieldResult<T>" description="Return type of useField with the field's signals, setters, and convenience computeds." />
<APICard name="FormStateSummary" type="type" signature="FormStateSummary<TValues>" description="Shape returned by useFormState containing isSubmitting, isValid, isDirty, errors, and more." />
