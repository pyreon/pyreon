---
title: "Schema Validation Adapters — API Reference"
description: "Schema adapters for Pyreon forms — Zod, Valibot, ArkType"
---

# @pyreon/validation — API Reference

> **Generated** from `validation`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [validation](/docs/validation).

Validation adapters that bridge schema libraries (Zod, Valibot, ArkType) with `@pyreon/form`. Each adapter provides a `*Schema()` function for whole-form validation and a `*Field()` function for single-field validation. Duck-typed so version mismatches are handled gracefully. All three schema libraries are optional peer dependencies — install only the one you use.

## Features

- zodSchema / zodField — duck-typed Zod adapter (works with v3 and v4)
- valibotSchema / valibotField — Valibot standalone-function style adapter
- arktypeSchema / arktypeField — ArkType sync adapter
- Whole-form and per-field validation variants for each library
- issuesToRecord utility for manual issue-to-error-map conversion

## Complete example

A full, end-to-end usage of the package:

```tsx
import { useForm } from '@pyreon/form'
import { zodSchema, zodField } from '@pyreon/validation'
import { z } from 'zod'

// Whole-form validation via zodSchema
const schema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
})

const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: zodSchema(schema),        // validates all fields at once
  onSubmit: (values) => save(values),
})

// Per-field validation via zodField — use when fields have independent rules
const form2 = useForm({
  initialValues: { username: '', bio: '' },
  validators: {
    username: zodField(z.string().min(3).max(20)),
    bio: zodField(z.string().max(500)),
  },
  onSubmit: (values) => save(values),
})

// Valibot adapter — standalone-function style
import { valibotSchema, valibotField } from '@pyreon/validation'
import * as v from 'valibot'

const vSchema = v.object({ email: v.pipe(v.string(), v.email()) })
const form3 = useForm({
  initialValues: { email: '' },
  schema: valibotSchema(vSchema, v.safeParse),  // pass safeParse explicitly
  onSubmit: (values) => save(values),
})

// ArkType adapter — sync validation only
import { arktypeSchema } from '@pyreon/validation'
import { type } from 'arktype'

const atSchema = type({ email: 'email', age: 'number > 18' })
const form4 = useForm({
  initialValues: { email: '', age: 0 },
  schema: arktypeSchema(atSchema),
  onSubmit: (values) => save(values),
})
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`zodSchema`](#zodschema) | function | Create a whole-form schema adapter from a Zod schema. |
| [`zodField`](#zodfield) | function | Create a per-field validator from a Zod schema. |
| [`valibotSchema`](#valibotschema) | function | Create a whole-form schema adapter from a Valibot schema. |
| [`valibotField`](#valibotfield) | function | Create a per-field validator from a Valibot schema. |
| [`arktypeSchema`](#arktypeschema) | function | Create a whole-form schema adapter from an ArkType type. |
| [`arktypeField`](#arktypefield) | function | Create a per-field validator from an ArkType type. |

## API

### zodSchema `function`

```ts
<T>(schema: ZodType<T>) => SchemaAdapter<T>
```

Create a whole-form schema adapter from a Zod schema. Duck-typed against the `.safeParse()` method so it works with both Zod v3 and v4 without version checks. Pass the result to `useForm({ schema })` for automatic full-form validation on submit or blur.

**Example**

```tsx
const schema = z.object({ email: z.string().email(), age: z.number().min(18) })
const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: zodSchema(schema),
  onSubmit: (values) => save(values),
})
```

**Common mistakes**

- Passing zodSchema AND per-field validators for the same field — both run and errors may conflict
- Using zodSchema with a non-object schema (z.string()) — form schemas must validate an object shape matching initialValues

**See also:** `zodField` · `valibotSchema` · `arktypeSchema`

---

### zodField `function`

```ts
<T>(schema: ZodType<T>) => ValidateFn<T>
```

Create a per-field validator from a Zod schema. Returns a function compatible with `useForm({ validators: { fieldName: zodField(z.string().email()) } })`. Use when individual fields have independent validation rules that don't need cross-field context.

**Example**

```tsx
const form = useForm({
  initialValues: { username: '' },
  validators: { username: zodField(z.string().min(3).max(20)) },
  onSubmit: (values) => save(values),
})
```

**See also:** `zodSchema` · `valibotField`

---

### valibotSchema `function`

```ts
<T>(schema: ValibotSchema<T>, safeParse: SafeParseFn) => SchemaAdapter<T>
```

Create a whole-form schema adapter from a Valibot schema. Requires passing the `safeParse` function explicitly (Valibot uses standalone functions, not methods). This keeps the adapter independent of Valibot's internal module structure across versions.

**Example**

```tsx
import * as v from 'valibot'
const schema = v.object({ email: v.pipe(v.string(), v.email()) })
const form = useForm({
  initialValues: { email: '' },
  schema: valibotSchema(schema, v.safeParse),
  onSubmit: (values) => save(values),
})
```

**Common mistakes**

- Forgetting to pass v.safeParse as the second argument — the adapter cannot call safeParse without it since Valibot uses standalone functions

**See also:** `valibotField` · `zodSchema`

---

### valibotField `function`

```ts
<T>(schema: ValibotSchema<T>, safeParse: SafeParseFn) => ValidateFn<T>
```

Create a per-field validator from a Valibot schema. Same standalone-function-style as valibotSchema — pass `v.safeParse` explicitly.

**Example**

```tsx
validators: { email: valibotField(v.pipe(v.string(), v.email()), v.safeParse) }
```

**See also:** `valibotSchema` · `zodField`

---

### arktypeSchema `function`

```ts
<T>(schema: ArkTypeSchema<T>) => SchemaAdapter<T>
```

Create a whole-form schema adapter from an ArkType type. ArkType validation is synchronous only — async validators are not supported through this adapter. Returns errors via the ArkType `problems` array.

**Example**

```tsx
import { type } from 'arktype'
const schema = type({ email: 'email', age: 'number > 18' })
const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: arktypeSchema(schema),
  onSubmit: (values) => save(values),
})
```

**See also:** `arktypeField` · `zodSchema`

---

### arktypeField `function`

```ts
<T>(schema: ArkTypeSchema<T>) => ValidateFn<T>
```

Create a per-field validator from an ArkType type. Synchronous only, same as arktypeSchema.

**Example**

```tsx
validators: { age: arktypeField(type('number > 18')) }
```

**See also:** `arktypeSchema` · `zodField`

---

## Package-level notes

> **Note:** All three schema libraries are optional peer dependencies. Install only the one you use — the adapters are tree-shaken per import path (`@pyreon/validation/zod`, `@pyreon/validation/valibot`, `@pyreon/validation/arktype`).

> **Valibot standalone functions:** Valibot uses standalone functions (not methods), so `valibotSchema` and `valibotField` require passing `v.safeParse` as an explicit argument. This is by design to avoid internal coupling to Valibot's module structure.

> **Duck typing:** The Zod adapter is duck-typed against `.safeParse()` — it works with both Zod v3 and v4 without version detection. If a future Zod version changes the safeParse return shape, the adapter will need updating.
