# @pyreon/validation

Schema adapters for `@pyreon/form`. Duck-typed interfaces for Zod, Valibot, and ArkType — no hard version coupling.

## Install

```bash
bun add @pyreon/validation
```

## Quick Start

```ts
import { z } from "zod"
import { useForm } from "@pyreon/form"
import { zodSchema } from "@pyreon/validation"

const schema = z.object({
  email: z.string().email(),
  age: z.number().min(13),
})

const form = useForm({
  initialValues: { email: "", age: 0 },
  schema: zodSchema(schema),
  onSubmit: async (values) => console.log(values),
})
```

Each adapter comes in two flavors: **schema-level** (validates the whole form) and **field-level** (validates a single field).

## API

### `zodSchema(schema)`

Create a form-level schema validator from a Zod schema. Uses `safeParseAsync` internally — supports both sync and async refinements. Duck-typed to work with Zod v3 and v4.

| Parameter | Type | Description |
| --- | --- | --- |
| `schema` | Zod schema | Any Zod object schema with `safeParse`/`safeParseAsync` |

**Returns:** `SchemaValidateFn<TValues>`

```ts
import { z } from "zod"
const form = useForm({
  initialValues: { email: "", password: "" },
  schema: zodSchema(z.object({
    email: z.string().email(),
    password: z.string().min(8),
  })),
  onSubmit: (values) => { ... },
})
```

### `zodField(schema)`

Create a single-field validator from a Zod schema. Returns the first error message on failure.

| Parameter | Type | Description |
| --- | --- | --- |
| `schema` | Zod schema | Any Zod schema (string, number, etc.) |

**Returns:** `ValidateFn<T>`

```ts
const form = useForm({
  initialValues: { email: "" },
  validators: {
    email: zodField(z.string().email("Invalid email")),
  },
  onSubmit: (values) => { ... },
})
```

### `valibotSchema(schema, safeParseFn)`

Create a form-level schema validator from a Valibot schema. Valibot uses standalone functions, so you must pass the parse function.

| Parameter | Type | Description |
| --- | --- | --- |
| `schema` | Valibot schema | Any Valibot object schema |
| `safeParseFn` | `Function` | `v.safeParse` or `v.safeParseAsync` from valibot |

**Returns:** `SchemaValidateFn<TValues>`

```ts
import * as v from "valibot"
const form = useForm({
  initialValues: { email: "", password: "" },
  schema: valibotSchema(
    v.object({
      email: v.pipe(v.string(), v.email()),
      password: v.pipe(v.string(), v.minLength(8)),
    }),
    v.safeParseAsync,
  ),
  onSubmit: (values) => { ... },
})
```

### `valibotField(schema, safeParseFn)`

Create a single-field validator from a Valibot schema.

| Parameter | Type | Description |
| --- | --- | --- |
| `schema` | Valibot schema | Any Valibot schema |
| `safeParseFn` | `Function` | `v.safeParse` or `v.safeParseAsync` from valibot |

**Returns:** `ValidateFn<T>`

```ts
validators: {
  email: valibotField(v.pipe(v.string(), v.email("Invalid")), v.safeParseAsync),
}
```

### `arktypeSchema(schema)`

Create a form-level schema validator from an ArkType schema. ArkType validation is synchronous.

| Parameter | Type | Description |
| --- | --- | --- |
| `schema` | ArkType `Type` | Any callable ArkType type |

**Returns:** `SchemaValidateFn<TValues>`

```ts
import { type } from "arktype"
const form = useForm({
  initialValues: { email: "", password: "" },
  schema: arktypeSchema(type({
    email: "string.email",
    password: "string >= 8",
  })),
  onSubmit: (values) => { ... },
})
```

### `arktypeField(schema)`

Create a single-field validator from an ArkType schema.

| Parameter | Type | Description |
| --- | --- | --- |
| `schema` | ArkType `Type` | Any callable ArkType type |

**Returns:** `ValidateFn<T>`

```ts
validators: {
  email: arktypeField(type("string.email")),
}
```

### `issuesToRecord(issues)`

Convert an array of `ValidationIssue` objects into a flat field-to-error record. First error per field wins. Useful for building custom adapters.

| Parameter | Type | Description |
| --- | --- | --- |
| `issues` | `ValidationIssue[]` | Array of `{ path: string, message: string }` |

**Returns:** `Partial<Record<keyof TValues, ValidationError>>`

```ts
issuesToRecord([
  { path: "email", message: "Required" },
  { path: "email", message: "Invalid" },  // ignored — first wins
  { path: "age", message: "Too young" },
])
// => { email: "Required", age: "Too young" }
```

## Patterns

### Subpath Imports

Each adapter is available via subpath import to avoid bundling unused adapters:

```ts
import { zodSchema } from "@pyreon/validation/zod"
import { valibotSchema } from "@pyreon/validation/valibot"
import { arktypeSchema } from "@pyreon/validation/arktype"
```

### Mixing Field and Schema Validators

Field-level validators run first. Schema errors only apply to fields that have no field-level error.

```ts
const form = useForm({
  initialValues: { email: "", password: "", confirmPassword: "" },
  validators: {
    email: zodField(z.string().email()),
  },
  schema: zodSchema(z.object({ ... }).refine(
    (data) => data.password === data.confirmPassword,
    { path: ["confirmPassword"], message: "Passwords must match" },
  )),
  onSubmit: (values) => { ... },
})
```

## Types

| Type | Description |
| --- | --- |
| `ValidationIssue` | `{ path: string, message: string }` — normalized issue |
| `SchemaAdapter<TSchema>` | Generic schema adapter factory type |
| `FieldAdapter<TSchema>` | Generic field adapter factory type |
| `SchemaValidateFn<TValues>` | Re-exported from `@pyreon/form` |
| `ValidateFn<T>` | Re-exported from `@pyreon/form` |
| `ValidationError` | Re-exported from `@pyreon/form` — `string \| undefined` |

## Gotchas

- All adapters are duck-typed — they do not import types from Zod, Valibot, or ArkType. This means they work across major versions without breaking.
- Zod and Valibot adapters use async parsing internally (`safeParseAsync`), so validation is always async even for sync schemas.
- ArkType adapters are synchronous — ArkType does not support async validation.
- When a validator throws, the error is caught and converted to a string error message rather than propagating.
- For nested paths like `address.city`, the dot-separated path is used as the field key in the error record.
