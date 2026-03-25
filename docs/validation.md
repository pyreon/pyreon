# @pyreon/validation

Schema adapters that bridge Zod, Valibot, and ArkType with `@pyreon/form`. Each adapter is available via subpath exports (`@pyreon/validation/zod`, etc.) for tree-shaking, or from the main entry point.

## Installation

```bash
bun add @pyreon/validation

# Plus your schema library of choice:
bun add zod
# or: bun add valibot
# or: bun add arktype
```

## Quick Start

```ts
import { useForm } from "@pyreon/form"
import { zodSchema } from "@pyreon/validation/zod"
import { z } from "zod"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

const form = useForm({
  initialValues: { email: "", password: "" },
  schema: zodSchema(schema),
  onSubmit: (values) => { ... },
})
```

## Zod Adapter

Import from `@pyreon/validation/zod`.

### `zodSchema(schema)`

Create a form-level schema validator from a Zod schema. Uses `safeParseAsync` internally.

```ts
import { zodSchema } from "@pyreon/validation/zod"
import { z } from "zod"

const schema = z.object({
  email: z.string().email("Invalid email"),
  age: z.number().min(18, "Must be 18+"),
})

const form = useForm({
  initialValues: { email: "", age: 0 },
  schema: zodSchema(schema),
  onSubmit: (values) => { ... },
})
```

### `zodField(schema)`

Create a single-field validator from a Zod schema:

```ts
import { zodField } from "@pyreon/validation/zod"
import { z } from "zod"

const form = useForm({
  initialValues: { email: "" },
  validators: {
    email: zodField(z.string().email("Invalid email")),
  },
  onSubmit: (values) => { ... },
})
```

## Valibot Adapter

Import from `@pyreon/validation/valibot`.

Valibot uses standalone functions rather than methods, so you must pass the parse function explicitly.

### `valibotSchema(schema, safeParseFn)`

```ts
import { valibotSchema } from "@pyreon/validation/valibot"
import * as v from "valibot"

const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
})

const form = useForm({
  initialValues: { email: "", password: "" },
  schema: valibotSchema(schema, v.safeParseAsync),
  onSubmit: (values) => { ... },
})
```

### `valibotField(schema, safeParseFn)`

```ts
import { valibotField } from "@pyreon/validation/valibot"
import * as v from "valibot"

const form = useForm({
  initialValues: { email: "" },
  validators: {
    email: valibotField(
      v.pipe(v.string(), v.email("Invalid email")),
      v.safeParseAsync,
    ),
  },
  onSubmit: (values) => { ... },
})
```

## ArkType Adapter

Import from `@pyreon/validation/arktype`.

ArkType validation is synchronous — no async needed.

### `arktypeSchema(schema)`

```ts
import { arktypeSchema } from "@pyreon/validation/arktype"
import { type } from "arktype"

const schema = type({
  email: "string.email",
  age: "number >= 18",
})

const form = useForm({
  initialValues: { email: "", age: 0 },
  schema: arktypeSchema(schema),
  onSubmit: (values) => { ... },
})
```

### `arktypeField(schema)`

```ts
import { arktypeField } from "@pyreon/validation/arktype"
import { type } from "arktype"

const form = useForm({
  initialValues: { email: "" },
  validators: {
    email: arktypeField(type("string.email")),
  },
  onSubmit: (values) => { ... },
})
```

## Utilities

### `issuesToRecord(issues)`

Convert an array of `ValidationIssue` objects to a flat field-error record. Used internally by all adapters but exported for custom adapter implementations.

```ts
import { issuesToRecord } from "@pyreon/validation"

const errors = issuesToRecord([
  { path: "email", message: "Required" },
  { path: "address.city", message: "Invalid" },
])
// { email: "Required", "address.city": "Invalid" }
```

First error per field path wins.

## Types

| Type | Description |
| --- | --- |
| `ValidationIssue` | `{ path: string, message: string }` |
| `SchemaValidateFn<TValues>` | Form-level validator (re-export from `@pyreon/form`) |
| `ValidateFn<T>` | Field-level validator (re-export from `@pyreon/form`) |
| `ValidationError` | `string \| undefined` (re-export from `@pyreon/form`) |
| `SchemaAdapter<TSchema>` | Generic schema adapter type |
| `FieldAdapter<TSchema>` | Generic field adapter type |

## Design

All adapters use minimal TypeScript interfaces that match each library's public API surface — **no hard runtime dependencies** on any schema library. This means:

- Zod, Valibot, and ArkType are optional peer dependencies
- Only the adapter you import is bundled
- If a library changes its API, the adapter interface can be updated without affecting others

**Duck-typed internals:**

- **ArkType adapter** uses an internal `ArkTypeCallable` interface — any callable that returns either parsed data or an `ArkErrors` array.
- **Valibot adapter** accepts `GenericSafeParseFn` (typed as `Function`) for the parse function, avoiding hard coupling to Valibot's generic constraints.
