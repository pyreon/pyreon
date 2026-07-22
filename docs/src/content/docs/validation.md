---
title: Validation
description: The universal, library-agnostic validation gate — Standard Schema bridge plus Zod, Valibot, and ArkType adapters.
---

`@pyreon/validation` is the **universal, library-agnostic validation gate** for the Pyreon stack. It owns the validation *contract* -- the `ValidationError` / `ValidateFn` / `SchemaValidateFn` types and the [Standard Schema](https://standardschema.dev/) bridge -- and it depends on **nothing** in Pyreon. Every data package that needs validation (`@pyreon/form`, `@pyreon/store`, `@pyreon/state-tree`, `@pyreon/feature`) depends on *it*, not the reverse. That inversion is what lets any of them accept a raw Zod / Valibot / ArkType schema with no adapter and no cast.

There are two ways to plug a validator in:

1. **Raw Standard Schema (no wrapper)** -- Zod 3.24+, Valibot 1+, ArkType 2+, Effect Schema, and `@pyreon/validate`'s `s` all expose the `~standard` property, so you can pass the schema *directly*: `useForm({ schema: z.object(...) })`. The gate bridges it via `standardSchemaToValidator`.
2. **Typed adapters** -- `zodSchema` / `valibotSchema` / `arktypeSchema` wrap a schema into a `TypedSchemaAdapter` that carries an `_infer` type brand (compile-time field-name checking) and a synchronous `parse` (the coerced value schema-driven `@pyreon/store` / `@pyreon/state-tree` need). Use these for the brand, the `parse` path, or a library that is *not* Standard-Schema-compliant.

Each adapter works at two levels: whole-form schema validation and per-field validation. All adapters normalize library-specific errors into a common `ValidationIssue` format, then convert them to a flat `Record<string, string>` of field-name-to-error-message that `@pyreon/form` consumes.

None of the validator libraries are hard dependencies -- they're optional peers, and both the adapters and the bridge duck-type at runtime, so a major version bump in any of them does not break the gate.

<PackageBadge name="@pyreon/validation" href="/docs/validation" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/validation
```

```bash [bun]
bun add @pyreon/validation
```

```bash [pnpm]
pnpm add @pyreon/validation
```

```bash [yarn]
yarn add @pyreon/validation
```

:::

You also need at least one schema library installed:

:::code-group

```bash [npm]
npm install zod
```

```bash [bun]
bun add zod
```

```bash [pnpm]
pnpm add zod
```

```bash [yarn]
yarn add zod
```

:::

:::code-group

```bash [npm]
npm install valibot
```

```bash [bun]
bun add valibot
```

```bash [pnpm]
pnpm add valibot
```

```bash [yarn]
yarn add valibot
```

:::

:::code-group

```bash [npm]
npm install arktype
```

```bash [bun]
bun add arktype
```

```bash [pnpm]
pnpm add arktype
```

```bash [yarn]
yarn add arktype
```

:::

And `@pyreon/form` for integration:

:::code-group

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

---

<Example file="./examples/validation/field-validation" title="Field Validation" />

## Core Concepts

### Schema-Level vs. Field-Level Validation

`@pyreon/form` supports two kinds of validators:

- **Schema-level (`schema`)** -- validates the entire form values object at once. Returns a `Partial<Record<keyof TValues, string>>` mapping field names to error messages. This is useful for cross-field validation and when your schema describes the full form shape.

- **Field-level (`validators`)** -- validates individual fields independently. Each validator receives the field value and all form values, and returns `string | undefined`. This is useful for simple per-field rules or when you need access to other field values for cross-field checks.

Both levels can be used together. When both are present, field-level validators run first, then the schema validator runs. If either produces errors for a given field, the form is invalid.

### The Validation Flow

```
Form Submit / form.validate()
  |
  v
Field-level validators run (per-field)
  |
  v
Schema-level validator runs (whole form)
  |
  v
Errors merged into form.fields[name].error()
```

### ValidationIssue Format

All adapters internally normalize errors into the `ValidationIssue` format:

```ts
interface ValidationIssue {
  /** Dot-separated field path (e.g. "address.city") */
  path: string
  /** Human-readable error message */
  message: string
}
```

This normalization allows `issuesToRecord` to convert any library's errors into the flat record that `@pyreon/form` expects.

---

## Choosing an Approach: Raw Schema vs. Adapter

Because `@pyreon/validation` is the library-agnostic gate, there are two ways to supply a validator to any consumer (`@pyreon/form`, `@pyreon/store`, `@pyreon/state-tree`):

| | Raw Standard Schema | Typed adapter (`zodSchema` etc.) |
| --- | --- | --- |
| How | `useForm({ schema: z.object(...) })` | `useForm({ schema: zodSchema(z.object(...)) })` |
| Wrapper / cast | None | `zodSchema()` / `valibotSchema()` / `arktypeSchema()` |
| `_infer` type brand | Inferred via `~standard.types.output` | Inferred via `_infer` |
| Sync `parse` (coerced value) | Bridged on demand | Built in (`adapter.parse`) |
| Works for | Standard-Schema libs (Zod 3.24+, Valibot 1+, ArkType 2+, Effect, `@pyreon/validate` `s`) | Any of those **plus** non-Standard-Schema libraries |

**Default to the raw schema** -- it's the least ceremony. Reach for the adapter when you want the `_infer`-branded typed adapter, the synchronous `parse` path that schema-driven `@pyreon/store` / `@pyreon/state-tree` rely on, or a library that is not Standard-Schema-compliant.

## Raw Standard Schema (No Adapter)

Any schema exposing the `~standard` property can be passed **directly** -- the gate bridges it via `standardSchemaToValidator` under the hood:

```ts
import { z } from 'zod'
import { useForm } from '@pyreon/form'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  age: z.number().min(18, 'Must be at least 18'),
})

const form = useForm({
  initialValues: { email: '', age: 0 },
  schema, // raw schema — no zodSchema() wrapper, no cast
  onSubmit: async (values) => {
    await createAccount(values)
  },
})
```

The same works for a raw `v.object(...)` (Valibot 1+), `type(...)` (ArkType 2+), an Effect `Schema`, or a `@pyreon/validate` `s` schema. `useForm`'s `schema` option accepts a plain `SchemaValidateFn`, a `TypedSchemaAdapter`, **or** a `StandardSchemaLike` -- it detects which via `isStandardSchema` and routes accordingly.

## The Standard Schema Bridge

`standardSchemaToValidator` is the core of the universal gate -- it converts any raw Standard Schema into the whole-object `SchemaValidateFn` (`(values) => per-key error record`) that `@pyreon/form` / `@pyreon/store` consume. This is exactly what `useForm` calls when you hand it a raw schema; call it yourself when you need the validator standalone:

```ts
import { z } from 'zod'
import { standardSchemaToValidator } from '@pyreon/validation'

const schema = z.object({ email: z.string().email(), age: z.number().min(18) })
const validate = standardSchemaToValidator(schema)

const errors = validate({ email: 'x', age: 5 }) // sync schema → plain record, no await
// => { email: "Invalid email", age: "Too small: ..." }
```

Issue paths flatten to dot-strings (`address.city`) and the first message per path wins. **Sync fast-path**: a synchronously-validating schema (zod/valibot/arktype sync trees, `s`) returns the error record **directly** -- no Promise allocation, no microtask hop per call, which is what `@pyreon/form`'s keystroke-path `validateOn` flows through. A genuinely async schema still returns a Promise you await. The wrapper tax over the raw library call is bench-proven ≈0 ns (`bun run bench:validation` -- process-isolated, correctness-gated; only arktype's failure-path issue normalization costs anything, ~0.75µs on rejection only).

### Companion helpers

The bridge ships a small set of duck-typed helpers, mostly used by schema-driven consumers:

- **`isStandardSchema(value)`** -- type guard detecting the `~standard` property. Used to decide whether a `schema` option is a raw Standard Schema.
- **`isPyreonAdapter(value)`** -- type guard detecting a Pyreon `TypedSchemaAdapter` (the `_infer` brand plus a callable `parse`).
- **`wrapStandardSchema(schema)`** -- convert a Standard Schema into a synchronous `SchemaParseResult` parser returning the *coerced value* (not form errors). Surfaces async validation as a `Promise` return. `@internal` -- most consumers go through `extractParseFn`.
- **`extractParseFn(schema)`** -- the primary schema-driven entry point for `@pyreon/store` + `@pyreon/state-tree`: accepts *either* a `TypedSchemaAdapter` (uses its sync `parse`) *or* a raw Standard Schema (wraps via `wrapStandardSchema`) and returns one uniform sync parser. Throws a `[Pyreon]`-prefixed error if the value is neither shape, or if a Pyreon adapter is missing its `parse`.
- **`formatIssues(issues, op)`** -- format normalized issues into a readable `[Pyreon] Schema validation failed (<op>): ...` message (truncates after 5 issues).

```ts
import { extractParseFn, formatIssues } from '@pyreon/validation'

const parse = extractParseFn(userSchema)
const result = parse(initialValue)
if (result instanceof Promise) {
  throw new Error('[Pyreon] async schemas are unsupported for schema-driven state')
}
if (!result.ok) throw new Error(formatIssues(result.issues, 'init'))
const value = result.value // parsed + coerced (defaults applied, transforms run)
```

## InferSchema

`InferSchema<S>` extracts the inferred output type from *either* a Pyreon `TypedSchemaAdapter` (reads `_infer`, Tier A.1) *or* a raw Standard Schema (reads `~standard.types.output`, Tier A.2). It falls back to `Record<string, unknown>` for unknown shapes -- it never collapses to `never`. This powers the strict typing in `@pyreon/store` + `@pyreon/state-tree` so a raw schema passed directly still infers its exact field types:

```ts
import type { InferSchema } from '@pyreon/validation'
import { z } from 'zod'

const schema = z.object({ id: z.string(), count: z.number() })
type Values = InferSchema<typeof schema> // { id: string; count: number }
```

The Tier A.2 path reads the *optional* `~standard.types.output` phantom that spec-compliant libraries emit. A hand-rolled `~standard` object that omits `types` falls back to `Record<string, unknown>`.

---

## Zod Adapter

The Zod adapter provides `zodSchema` for form-level validation and `zodField` for per-field validation. `zodField` and the `zodSchema` validator both use `safeParseAsync` internally, so sync and async Zod schemas (including refinements and transforms) are fully supported. (Since Zod 3.24 is Standard-Schema-compliant, you can also skip `zodSchema` entirely and pass the raw `z.object(...)` to `useForm({ schema })` -- see [Raw Standard Schema](#raw-standard-schema-no-adapter).)

### zodSchema -- Form-Level Validation

Create a form-level `TypedSchemaAdapter` from a Zod object schema. The returned adapter is `{ _infer, validator, parse }`: `_infer` carries the inferred field types for compile-time field-name checking, `validator` is the whole-form error function (calls `schema.safeParseAsync(values)`, converts each `ZodIssue` path array to a dot-separated string, and returns a field-error record), and `parse` is the synchronous coerced-value parser (uses `safeParse`) that schema-driven `@pyreon/store` / `@pyreon/state-tree` consume. `useForm` reads `.validator` for you.

```ts
import { z } from 'zod'
import { zodSchema } from '@pyreon/validation'
import { useForm } from '@pyreon/form'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  age: z.number().min(18, 'Must be at least 18'),
})

const form = useForm({
  initialValues: { email: '', password: '', age: 0 },
  schema: zodSchema(schema),
  onSubmit: async (values) => {
    // values is typed and validated
    await createAccount(values)
  },
})
```

When validation passes, `zodSchema` returns an empty object `&#123;&#125;`. When it fails, it returns a record like:

```ts
{
  email: "Invalid email address",
  password: "Password must be at least 8 characters",
  age: "Must be at least 18"
}
```

### zodField -- Per-Field Validation

Create a per-field `ValidateFn` from a Zod schema. Returns the first error message on failure, or `undefined` on success.

```ts
import { z } from 'zod'
import { zodField } from '@pyreon/validation'
import { useForm } from '@pyreon/form'

const form = useForm({
  initialValues: { email: '', username: '', age: 0 },
  validators: {
    email: zodField(z.string().email('Invalid email')),
    username: zodField(z.string().min(3, 'Too short').max(20, 'Too long')),
    age: zodField(z.number().min(0, 'Must be positive')),
  },
  onSubmit: async (values) => {
    /* ... */
  },
})
```

### Complex Zod Schemas

**Nested objects:**

```ts
const addressSchema = z.object({
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  zip: z.string().regex(/^\d{5}$/, 'Must be a 5-digit ZIP code'),
})

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: addressSchema,
})

// Error paths are dot-separated:
// { "address.city": "City is required", "address.zip": "Must be a 5-digit ZIP code" }
```

**Arrays:**

```ts
const schema = z.object({
  tags: z.array(z.string().min(1, 'Tag cannot be empty')).min(1, 'At least one tag'),
  scores: z.array(z.number().min(0).max(100)),
})

// Error paths for array items use numeric indices:
// { "tags.0": "Tag cannot be empty" }
```

**Refinements (sync and async):**

```ts
const schema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

const form = useForm({
  initialValues: { password: '', confirmPassword: '' },
  schema: zodSchema(schema),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

**Async refinements (e.g., server-side uniqueness check):**

```ts
const schema = z.object({
  username: z
    .string()
    .min(3)
    .refine(
      async (username) => {
        const exists = await checkUsernameExists(username)
        return !exists
      },
      { message: 'Username is already taken' },
    ),
  email: z.string().email(),
})
```

Since `zodSchema` uses `safeParseAsync`, async refinements work automatically.

**Transforms:**

```ts
const schema = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase()),
  age: z
    .string()
    .transform((s) => parseInt(s, 10))
    .pipe(z.number().min(18)),
})
```

**Discriminated unions:**

```ts
const schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    email: z.string().email('Invalid email'),
  }),
  z.object({
    type: z.literal('phone'),
    phone: z.string().regex(/^\+?[\d\s-]+$/, 'Invalid phone number'),
  }),
])
```

### How zodSchema Works Internally

1. Calls `schema.safeParseAsync(values)`
2. If `result.success` is `true`, returns `&#123;&#125;`
3. If `result.success` is `false`, maps each `ZodIssue` to a `ValidationIssue` by converting each `PropertyKey` in `issue.path` to a string and joining with `.` (e.g., `["address", "city"]` becomes `"address.city"`). Uses `PropertyKey[]` for path arrays to support both Zod v3 and v4.
4. Passes the `ValidationIssue[]` array to `issuesToRecord` to produce the flat field-error record
5. When multiple issues exist for the same path, the first error message wins

### How zodField Works Internally

1. Calls `schema.safeParseAsync(value)`
2. If `result.success` is `true`, returns `undefined`
3. If `result.success` is `false`, returns `result.error.issues[0].message` -- the first error message

---

## Valibot Adapter

Valibot uses standalone functions rather than methods on schema objects. Because of this, the Valibot adapters require you to pass the `safeParse` or `safeParseAsync` function explicitly. The `safeParseFn` parameter is typed as `Function` (a generic callable) to avoid hard-coupling to any specific Valibot version. `valibotSchema` returns a `TypedSchemaAdapter` (`{ _infer, validator, parse }`), like the Zod adapter. (Valibot 1+ is Standard-Schema-compliant, so a raw `v.object(...)` can also be passed straight to `useForm({ schema })`.)

### valibotSchema -- Form-Level Validation

```ts
import * as v from 'valibot'
import { valibotSchema } from '@pyreon/validation'
import { useForm } from '@pyreon/form'

const schema = v.object({
  email: v.pipe(v.string(), v.email('Invalid email')),
  password: v.pipe(v.string(), v.minLength(8, 'Too short')),
})

const form = useForm({
  initialValues: { email: '', password: '' },
  schema: valibotSchema(schema, v.safeParseAsync),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

You can also use the synchronous `v.safeParse` if your schema has no async validations:

```ts
const form = useForm({
  initialValues: { email: '', password: '' },
  schema: valibotSchema(schema, v.safeParse),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

### valibotField -- Per-Field Validation

```ts
import * as v from 'valibot'
import { valibotField } from '@pyreon/validation'
import { useForm } from '@pyreon/form'

const form = useForm({
  initialValues: { email: '', website: '' },
  validators: {
    email: valibotField(v.pipe(v.string(), v.email('Invalid email')), v.safeParseAsync),
    website: valibotField(v.pipe(v.string(), v.url('Invalid URL')), v.safeParseAsync),
  },
  onSubmit: async (values) => {
    /* ... */
  },
})
```

### Complex Valibot Schemas

**Nested objects:**

```ts
const schema = v.object({
  name: v.pipe(v.string(), v.minLength(1, 'Name is required')),
  address: v.object({
    street: v.pipe(v.string(), v.minLength(1, 'Street is required')),
    city: v.pipe(v.string(), v.minLength(1, 'City is required')),
    zip: v.pipe(v.string(), v.regex(/^\d{5}$/, 'Invalid ZIP')),
  }),
})
```

**Arrays:**

```ts
const schema = v.object({
  tags: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1, 'Tag cannot be empty'))),
    v.minLength(1, 'At least one tag required'),
  ),
})
```

**Custom validations with `check`:**

```ts
const schema = v.pipe(
  v.object({
    password: v.pipe(v.string(), v.minLength(8)),
    confirmPassword: v.string(),
  }),
  v.check((data) => data.password === data.confirmPassword, 'Passwords do not match'),
)
```

**Optional and nullable fields:**

```ts
const schema = v.object({
  nickname: v.optional(v.pipe(v.string(), v.minLength(2, 'Too short'))),
  bio: v.nullable(v.pipe(v.string(), v.maxLength(500, 'Too long'))),
  middleName: v.nullish(v.string()),
})
```

### How valibotSchema Works Internally

1. Calls `safeParseFn(schema, values)` (either `safeParse` or `safeParseAsync`)
2. If `result.success` is `true`, returns `&#123;&#125;`
3. If `result.success` is `false`, maps each Valibot issue to a `ValidationIssue`:
   - `issue.path` items are joined by `.` using each item's `key` property
   - If `issue.path` is undefined, the path defaults to `""`
4. Passes the issues to `issuesToRecord`

### How valibotField Works Internally

1. Calls `safeParseFn(schema, value)`
2. If `result.success` is `true`, returns `undefined`
3. If `result.success` is `false`, returns `result.issues?.[0]?.message` -- the first error message, or `undefined` if the issues array is empty or undefined

---

## ArkType Adapter

ArkType uses a function-call syntax for validation. The adapter accepts any callable (`ArkTypeCallable`) -- no ArkType import is required. When called, if validation fails, it returns an `ArkErrors` array (which has a `summary` property to distinguish it from regular arrays). Error paths use `PropertyKey[]` and are converted to dot-separated strings. `arktypeSchema` returns a `TypedSchemaAdapter` (`{ _infer, validator, parse }`); since ArkType is synchronous, the non-error result IS the coerced value, so `parse` is native. (ArkType 2+ is Standard-Schema-compliant, so a raw `type(...)` can also be passed straight to `useForm({ schema })`.)

### arktypeSchema -- Form-Level Validation

```ts
import { type } from 'arktype'
import { arktypeSchema } from '@pyreon/validation'
import { useForm } from '@pyreon/form'

const schema = type({
  email: 'string.email',
  password: 'string >= 8',
})

const form = useForm({
  initialValues: { email: '', password: '' },
  schema: arktypeSchema(schema),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

### arktypeField -- Per-Field Validation

```ts
import { type } from 'arktype'
import { arktypeField } from '@pyreon/validation'
import { useForm } from '@pyreon/form'

const form = useForm({
  initialValues: { email: '', count: 0 },
  validators: {
    email: arktypeField(type('string.email')),
    count: arktypeField(type('number >= 0')),
  },
  onSubmit: async (values) => {
    /* ... */
  },
})
```

### Complex ArkType Schemas

**Nested objects:**

```ts
const schema = type({
  name: 'string >= 1',
  address: {
    street: 'string >= 1',
    city: 'string >= 1',
    zip: '/^\\d{5}$/',
  },
})
```

**Array types:**

```ts
const schema = type({
  tags: 'string[] >= 1',
  scores: '(number >= 0 & number <= 100)[]',
})
```

**Union types:**

```ts
const schema = type({
  status: "'active' | 'inactive' | 'pending'",
  priority: '1 | 2 | 3 | 4 | 5',
})
```

**String patterns:**

```ts
const schema = type({
  email: 'string.email',
  url: 'string.url',
  uuid: 'string.uuid',
  date: 'string.date.iso',
})
```

### How arktypeSchema Works Internally

1. Calls `schema(values)` -- ArkType schemas are callable functions
2. Checks if the result is an `ArkErrors` array (detected by the presence of a `summary` property on the array)
3. If not an error, returns `&#123;&#125;`
4. If an error, maps each `ArkError` to a `ValidationIssue` by converting each `PropertyKey` in `error.path` to a string and joining with `.`
5. Passes the issues to `issuesToRecord`

### ArkType is Synchronous

Unlike Zod and Valibot, the ArkType adapter is synchronous. The `arktypeSchema` and `arktypeField` functions do not return promises. However, since `@pyreon/form` expects `SchemaValidateFn` and `ValidateFn` to potentially be async, they work seamlessly in the form's validation pipeline.

---

## issuesToRecord Utility

Convert an array of `ValidationIssue` objects into a flat record mapping field names to error messages. This is the bridge between library-specific error formats and `@pyreon/form`'s expected error shape.

### Basic Usage

```ts
import { issuesToRecord } from '@pyreon/validation'

const errors = issuesToRecord([
  { path: 'email', message: 'Invalid email' },
  { path: 'password', message: 'Too short' },
])
// => { email: "Invalid email", password: "Too short" }
```

### First Error Wins

When multiple issues exist for the same field path, the first message wins:

```ts
const errors = issuesToRecord([
  { path: 'email', message: 'Invalid email' },
  { path: 'email', message: 'Already taken' },
  { path: 'password', message: 'Too short' },
])
// => { email: "Invalid email", password: "Too short" }
// "Already taken" is ignored because "email" already has an error
```

### Nested Paths

Nested paths are stored as-is (dot-separated strings). The adapter is responsible for producing the correct dot-separated path from the library's native path format:

```ts
const errors = issuesToRecord([
  { path: 'address.city', message: 'City is required' },
  { path: 'address.zip', message: 'Invalid ZIP' },
  { path: 'tags.0', message: 'Tag cannot be empty' },
])
// => { "address.city": "City is required", "address.zip": "Invalid ZIP", "tags.0": "Tag cannot be empty" }
```

### Empty Input

An empty array returns an empty object:

```ts
issuesToRecord([])
// => {}
```

---

## Combining Schema and Field Validators

You can use both schema-level and per-field validators on the same form. Field validators run first, then the schema validator runs. If either produces errors, the form is invalid.

This is useful when you want a schema for structural validation and custom per-field logic for things like cross-field checks:

```ts
import { z } from 'zod'
import { zodSchema } from '@pyreon/validation'
import { useForm } from '@pyreon/form'

const form = useForm({
  initialValues: { email: '', password: '', confirmPassword: '' },
  validators: {
    // Custom cross-field validation at the field level
    confirmPassword: (value, allValues) =>
      value !== allValues.password ? 'Passwords must match' : undefined,
  },
  schema: zodSchema(
    z.object({
      email: z.string().email('Invalid email'),
      password: z.string().min(8, 'At least 8 characters'),
      confirmPassword: z.string(),
    }),
  ),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

### Mixing Adapters

You can use different validation libraries for the schema and field validators. For example, use a Zod schema for the form shape and ArkType for a specific field:

```ts
import { z } from 'zod'
import { type } from 'arktype'
import { zodSchema } from '@pyreon/validation'
import { arktypeField } from '@pyreon/validation'
import { useForm } from '@pyreon/form'

const form = useForm({
  initialValues: { email: '', website: '' },
  validators: {
    website: arktypeField(type('string.url')),
  },
  schema: zodSchema(
    z.object({
      email: z.string().email(),
      website: z.string(),
    }),
  ),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

---

## Custom Error Messages

All three adapters pass through the error messages from their respective schema libraries. Customize messages using each library's native API:

### Zod Custom Messages

```ts
const schema = z.object({
  email: z
    .string({
      required_error: 'Email is required',
      invalid_type_error: 'Email must be a string',
    })
    .email('Please enter a valid email address'),
  age: z.number().min(18, 'You must be at least 18 years old'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username cannot exceed 20 characters')
    .regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores'),
})
```

### Valibot Custom Messages

```ts
const schema = v.object({
  email: v.pipe(
    v.string('Email must be a string'),
    v.nonEmpty('Email is required'),
    v.email('Please enter a valid email address'),
  ),
  age: v.pipe(
    v.number('Age must be a number'),
    v.minValue(18, 'You must be at least 18 years old'),
  ),
})
```

### ArkType Custom Messages

ArkType generates error messages automatically based on the type definition. For custom messages, use the `narrow` utility or handle errors in the field validator:

```ts
const schema = type({
  email: 'string.email',
  age: 'number >= 18',
})

// ArkType generates messages like:
// "must be an email address (was 'invalid')"
// "must be at least 18 (was 5)"
```

---

## Async Validation

All adapters support async validation. The Zod and Valibot adapters use async parse functions by default. This enables patterns like server-side uniqueness checks:

### Async with Zod

```ts
const schema = z.object({
  username: z
    .string()
    .min(3)
    .refine(
      async (username) => {
        const response = await fetch(`/api/check-username?u=${username}`)
        const { available } = await response.json()
        return available
      },
      { message: 'Username is already taken' },
    ),
  email: z.string().email(),
})

const form = useForm({
  initialValues: { username: '', email: '' },
  schema: zodSchema(schema),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

### Async with Valibot

```ts
const schema = v.objectAsync({
  email: v.pipeAsync(
    v.string(),
    v.email('Invalid email'),
    v.checkAsync(async (email) => {
      const response = await fetch(`/api/check-email?e=${email}`)
      const { available } = await response.json()
      return available
    }, 'Email is already registered'),
  ),
})

const form = useForm({
  initialValues: { email: '' },
  schema: valibotSchema(schema, v.safeParseAsync),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

### Async Field-Level Validation

You can also use async validation at the field level by providing a custom async validator function directly to `@pyreon/form`:

```ts
const form = useForm({
  initialValues: { email: '' },
  validators: {
    email: async (value, _allValues) => {
      if (!value.includes('@')) return 'Invalid email'
      const response = await fetch(`/api/check-email?e=${value}`)
      const { available } = await response.json()
      return available ? undefined : 'Email is already registered'
    },
  },
  onSubmit: async (values) => {
    /* ... */
  },
})
```

---

## Cross-Field Validation

### Using Zod Refinements

Zod refinements on the root schema object can validate across fields:

```ts
const schema = z
  .object({
    startDate: z.string(),
    endDate: z.string(),
    minAge: z.number(),
    maxAge: z.number(),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: 'End date must be after start date',
    path: ['endDate'],
  })
  .refine((data) => data.maxAge > data.minAge, {
    message: 'Max age must be greater than min age',
    path: ['maxAge'],
  })

const form = useForm({
  initialValues: { startDate: '', endDate: '', minAge: 0, maxAge: 100 },
  schema: zodSchema(schema),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

### Using Field-Level Validators

Field-level validators receive the full form values as the second argument, enabling cross-field checks without schema-level refinements:

```ts
const form = useForm({
  initialValues: { password: '', confirmPassword: '' },
  validators: {
    confirmPassword: (value, allValues) =>
      value !== allValues.password ? 'Passwords must match' : undefined,
  },
  onSubmit: async (values) => {
    /* ... */
  },
})
```

### Combining Both Approaches

```ts
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string(),
})

const form = useForm({
  initialValues: { email: '', password: '', confirmPassword: '' },
  validators: {
    // Cross-field at field level (runs first)
    confirmPassword: (value, allValues) =>
      value !== allValues.password ? 'Passwords must match' : undefined,
  },
  // Structural validation at schema level (runs second)
  schema: zodSchema(schema),
  onSubmit: async (values) => {
    /* ... */
  },
})
```

---

## Complete Form + Validation Example

Here is a full registration form using `@pyreon/form` with `@pyreon/validation` and Zod:

```tsx
import { defineComponent } from '@pyreon/core'
import { useForm } from '@pyreon/form'
import { z } from 'zod'
import { zodSchema, zodField } from '@pyreon/validation'

const registrationSchema = z
  .object({
    username: z.string().min(3, 'At least 3 characters').max(20, 'At most 20 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string(),
    age: z.number().min(18, 'Must be at least 18'),
    acceptTerms: z.boolean().refine((v) => v === true, 'You must accept the terms'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

const RegistrationForm = defineComponent(() => {
  const form = useForm({
    initialValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      age: 0,
      acceptTerms: false,
    },
    schema: zodSchema(registrationSchema),
    onSubmit: async (values) => {
      await fetch('/api/register', {
        method: 'POST',
        body: JSON.stringify(values),
      })
    },
  })

  return () => (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <div>
        <label>Username</label>
        <input
          value={form.fields.username.value()}
          onInput={(e) => form.fields.username.setValue(e.target.value)}
        />
        {form.fields.username.error() && <span class="error">{form.fields.username.error()}</span>}
      </div>

      <div>
        <label>Email</label>
        <input
          type="email"
          value={form.fields.email.value()}
          onInput={(e) => form.fields.email.setValue(e.target.value)}
        />
        {form.fields.email.error() && <span class="error">{form.fields.email.error()}</span>}
      </div>

      <div>
        <label>Password</label>
        <input
          type="password"
          value={form.fields.password.value()}
          onInput={(e) => form.fields.password.setValue(e.target.value)}
        />
        {form.fields.password.error() && <span class="error">{form.fields.password.error()}</span>}
      </div>

      <div>
        <label>Confirm Password</label>
        <input
          type="password"
          value={form.fields.confirmPassword.value()}
          onInput={(e) => form.fields.confirmPassword.setValue(e.target.value)}
        />
        {form.fields.confirmPassword.error() && (
          <span class="error">{form.fields.confirmPassword.error()}</span>
        )}
      </div>

      <div>
        <label>Age</label>
        <input
          type="number"
          value={form.fields.age.value()}
          onInput={(e) => form.fields.age.setValue(Number(e.target.value))}
        />
        {form.fields.age.error() && <span class="error">{form.fields.age.error()}</span>}
      </div>

      <div>
        <label>
          <input
            type="checkbox"
            checked={form.fields.acceptTerms.value()}
            onChange={(e) => form.fields.acceptTerms.setValue(e.target.checked)}
          />
          I accept the terms and conditions
        </label>
        {form.fields.acceptTerms.error() && (
          <span class="error">{form.fields.acceptTerms.error()}</span>
        )}
      </div>

      <button type="submit" disabled={form.isSubmitting()}>
        {form.isSubmitting() ? 'Registering...' : 'Register'}
      </button>
    </form>
  )
})
```

---

## Writing a Custom Validation Adapter

All adapters follow the same pattern: normalize library-specific errors into `ValidationIssue[]`, then call `issuesToRecord` to produce the field-error record. Here is how to build an adapter for any validation library.

### The Types

```ts
import type { SchemaValidateFn, ValidateFn, ValidationIssue } from '@pyreon/validation'
```

- `SchemaValidateFn<TValues>` -- `(values: TValues) => Promise<Partial<Record<keyof TValues, string>>> | Partial<Record<keyof TValues, string>>`
- `ValidateFn<T>` -- `(value: T, allValues: Record<string, unknown>) => Promise<string | undefined> | string | undefined`
- `ValidationIssue` -- `&#123; path: string; message: string &#125;`

### Schema Adapter Template

```ts
import type { SchemaValidateFn } from '@pyreon/validation'
import { issuesToRecord } from '@pyreon/validation'
import type { ValidationIssue } from '@pyreon/validation'

interface MyLibrarySchema<T = unknown> {
  validate(data: unknown): { ok: boolean; errors?: Array<{ field: string; msg: string }> }
}

export function myLibrarySchema<TValues extends Record<string, unknown>>(
  schema: MyLibrarySchema<TValues>,
): SchemaValidateFn<TValues> {
  return async (values) => {
    const result = schema.validate(values)

    if (result.ok) return {}

    const issues: ValidationIssue[] = (result.errors ?? []).map((e) => ({
      path: e.field,
      message: e.msg,
    }))

    return issuesToRecord(issues)
  }
}
```

### Field Adapter Template

```ts
import type { ValidateFn } from '@pyreon/validation'

interface MyLibraryFieldSchema<T = unknown> {
  validate(value: unknown): { ok: boolean; errors?: Array<{ msg: string }> }
}

export function myLibraryField<T>(schema: MyLibraryFieldSchema<T>): ValidateFn<T> {
  return async (value) => {
    const result = schema.validate(value)

    if (result.ok) return undefined

    return result.errors?.[0]?.msg
  }
}
```

### Key Implementation Notes

1. **Path normalization** -- convert the library's native path format (array of strings/numbers, nested objects, etc.) to a dot-separated string. For example, `["address", "city"]` becomes `"address.city"`, and `["tags", 0]` becomes `"tags.0"`.

2. **First error wins** -- `issuesToRecord` keeps only the first error per path. If your library reports errors in a specific order (most important first), this works in your favor.

3. **Async support** -- even if your library is synchronous, wrapping the adapter function as `async` or returning a `Promise` is fine because `@pyreon/form` awaits all validators.

4. **Error detection** -- use a reliable method to detect errors. ArkType uses `Array.isArray(result) && 'summary' in result`. Zod uses `result.success === false`. Choose whatever is most robust for your library.

---

## API Reference

### Zod

| Function            | Signature                                                             | Description                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `zodSchema(schema)` | `<TValues>(schema: ZodSchema<TValues>) => TypedSchemaAdapter<TValues>` | Create a typed form-level adapter (`{ _infer, validator, parse }`) from a Zod object schema. Uses `safeParseAsync` (validator) + `safeParse` (parse). Duck-typed to work with Zod v3 and v4. |
| `zodField(schema)`  | `<T>(schema: ZodSchema<T>) => ValidateFn<T>`                         | Create a per-field validator from a Zod schema. Returns first error message. Duck-typed to work with Zod v3 and v4.                            |

### Valibot

| Function                             | Signature                                                      | Description                                                                                    |
| ------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `valibotSchema(schema, safeParseFn)` | `<TValues>(schema, safeParseFn) => TypedSchemaAdapter<TValues>` | Create a typed form-level adapter from a Valibot schema. Pass `v.safeParseAsync` or `v.safeParse` (the sync `parse` path needs `v.safeParse`). |
| `valibotField(schema, safeParseFn)`  | `<T>(schema, safeParseFn) => ValidateFn<T>`                   | Create a per-field validator from a Valibot schema. Returns first error message.               |

### ArkType

| Function                | Signature                                                          | Description                                                                                             |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `arktypeSchema(schema)` | `<TValues>(schema: ArkTypeCallable) => TypedSchemaAdapter<TValues>` | Create a typed form-level adapter from an ArkType schema. Synchronous. Accepts any callable.            |
| `arktypeField(schema)`  | `<T>(schema: ArkTypeCallable) => ValidateFn<T>`                   | Create a per-field validator from an ArkType schema. Returns first error message. Accepts any callable. |

### Standard Schema Bridge

| Function                             | Signature                                                                   | Description                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `standardSchemaToValidator(schema)`  | `<TValues>(schema: StandardSchemaLike) => SchemaValidateFn<TValues>`         | Convert a raw Standard Schema into a whole-object `SchemaValidateFn` (sync fast-path: sync schema → plain record; async schema → Promise). The bridge behind passing a raw schema. |
| `isStandardSchema(value)`            | `(value: unknown) => value is StandardSchemaShape<unknown>`                  | Type guard — detect a Standard Schema by its `~standard` property.                                                            |
| `isPyreonAdapter(value)`             | `(value: unknown) => value is PyreonAdapterShape<Record<string, unknown>>`   | Type guard — detect a Pyreon `TypedSchemaAdapter` (`_infer` + callable `parse`).                                              |
| `wrapStandardSchema(schema)`         | `<T>(schema: StandardSchemaShape) => (value) => SchemaParseResult<T>`        | Convert a Standard Schema into a sync coerced-value parser (async → `Promise` return). `@internal`.                          |
| `extractParseFn(schema)`             | `<T>(schema: unknown) => (value) => SchemaParseResult<T>`                    | Uniform sync parser from a `TypedSchemaAdapter` OR a raw Standard Schema. Throws on neither. Store / state-tree entry point.  |
| `formatIssues(issues, op)`           | `(issues: SchemaIssue[], op: string) => string`                             | Format normalized issues into a readable `[Pyreon] Schema validation failed (<op>): ...` message.                            |

### Utility

| Function                 | Signature                                                                        | Description                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `issuesToRecord(issues)` | `<TValues>(issues: ValidationIssue[]) => Partial<Record<keyof TValues, string>>` | Convert `ValidationIssue[]` to a flat field-error record. First error per path wins. |

---

## Type Exports

These types are **owned by `@pyreon/validation`** (the gate has zero Pyreon deps; the data packages depend on it). `@pyreon/form` re-exports the contract types (`ValidationError`, `ValidateFn`, `SchemaValidateFn`) for back-compat, so `import { ValidationError } from '@pyreon/form'` still works.

| Type                          | Definition                                                                            | Description                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ValidationError`             | `string \| undefined`                                                                 | A single field's error value                                  |
| `ValidateFn<T, TValues>`      | `(value: T, allValues: TValues, signal?: AbortSignal) => MaybePromise<ValidationError>` | Per-field validator function type                              |
| `SchemaValidateFn<TValues>`   | `(values: TValues) => MaybePromise<Partial<Record<keyof TValues, ValidationError>>>`  | Whole-object validator function type                          |
| `TypedSchemaAdapter<TValues>` | `{ _infer; validator: SchemaValidateFn<TValues>; parse?: (v) => ParseResult<TValues> }` | What `zodSchema` / `valibotSchema` / `arktypeSchema` return   |
| `ValidationIssue`             | `&#123; path: string; message: string &#125;`                                         | Normalized issue with dot-separated path (aliased `SchemaIssue`) |
| `ParseResult<T>`              | `&#123; ok: true; value: T &#125; \| &#123; ok: false; issues: ValidationIssue[] &#125;` | Sync parse result (aliased `SchemaParseResult`)              |
| `StandardSchemaLike<Output>`  | `&#123; '~standard': &#123; types?; validate &#125; &#125;`                            | The `~standard` shape `standardSchemaToValidator` accepts      |
| `InferSchema<S>`              | `S['_infer'] \| S['~standard']['types']['output'] \| Record<string, unknown>`         | Infer field types from an adapter or a raw schema             |
| `SchemaAdapter<TSchema>`      | `<TValues>(schema: TSchema) => SchemaValidateFn<TValues>`                             | Generic schema adapter type                                   |
| `FieldAdapter<TSchema>`       | `<T>(schema: TSchema) => ValidateFn<T>`                                               | Generic field adapter type                                   |
