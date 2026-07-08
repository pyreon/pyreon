# @pyreon/validation

The universal, library-agnostic **validation gate** for the Pyreon stack.

`@pyreon/validation` owns the validation *contract* — the `ValidationError` / `ValidateFn` / `SchemaValidateFn` types and the [Standard Schema](https://standardschema.dev/) bridge — and it depends on **nothing** in Pyreon. Every data package that needs validation (`@pyreon/form`, `@pyreon/store`, `@pyreon/state-tree`, `@pyreon/feature`) depends on *it*, not the other way around. That inversion is what lets any of them accept a raw Zod / Valibot / ArkType schema with no adapter and no cast.

Two ways to plug a validator in:

1. **Raw Standard Schema (no wrapper)** — Zod 3.24+, Valibot 1+, ArkType 2+, Effect Schema, and `@pyreon/validate`'s `s` all expose the `~standard` property, so you can pass the schema *directly*. The gate bridges it via `standardSchemaToValidator`.
2. **Typed adapters** — `zodSchema` / `valibotSchema` / `arktypeSchema` wrap a schema into a `TypedSchemaAdapter` that carries an `_infer` type brand (compile-time field-name checking) and a synchronous `parse` (the coerced value schema-driven `@pyreon/store` / `@pyreon/state-tree` need). Use these when you want the brand, the `parse` path, or a library that is *not* Standard-Schema-compliant.

None of the validator libraries are hard dependencies — they're optional peers, and both the adapters and the bridge duck-type at runtime (`~standard` / `safeParse` / call-as-function), so a major version bump in any of them does not break the gate. Each library has its own subpath entry so unused adapter code is never bundled.

## Install

```bash
bun add @pyreon/validation

# Add whichever validator library you use (all peer-optional):
bun add zod        # for zodSchema/zodField — or pass a raw z.object(...) directly
bun add valibot    # for valibotSchema/valibotField
bun add arktype    # for arktypeSchema/arktypeField
```

`@pyreon/form` (or `@pyreon/store` / `@pyreon/state-tree`) is only needed if you're wiring validation into one of them — `@pyreon/validation` itself has no Pyreon dependency.

## Quick start — raw Standard Schema (no adapter)

Zod ≥3.24 is Standard-Schema-compliant, so pass it straight to `useForm`:

```ts
import { z } from 'zod'
import { useForm } from '@pyreon/form'

const schema = z.object({
  email: z.string().email(),
  age: z.number().min(13),
})

const form = useForm({
  initialValues: { email: '', age: 0 },
  schema, // raw schema — the gate adapts it via standardSchemaToValidator
  onSubmit: async (values) => console.log(values),
})
```

The same works for a raw `v.object(...)`, `type(...)`, an Effect `Schema`, or a `@pyreon/validate` `s` schema — anything with `~standard`.

## Typed adapters

When you want the `_infer` brand (type-safe field names) or the sync `parse` path for schema-driven state, wrap the schema:

```ts
import { z } from 'zod'
import { zodSchema, zodField } from '@pyreon/validation/zod'

const form = useForm({
  initialValues: { email: '', password: '' },
  validators: {
    email: zodField(z.string().email('Invalid email')), // per-field
  },
  schema: zodSchema(
    z.object({ email: z.string().email(), password: z.string().min(8) }),
  ),
  onSubmit: (values) => {
    /* ... */
  },
})
```

Each adapter ships in two flavors: **schema-level** (`zodSchema` — validates the whole form) and **field-level** (`zodField` — validates one field via `form.validators[name]`). `zodSchema`/`valibotSchema`/`arktypeSchema` return a `TypedSchemaAdapter` (`{ _infer, validator, parse }`); the form reads `.validator` for you, and schema-driven store / state-tree read `.parse`.

### Subpath imports

Each library has its own entry so unused adapters are not bundled:

```ts
import { zodSchema, zodField } from '@pyreon/validation/zod'
import { valibotSchema, valibotField } from '@pyreon/validation/valibot'
import { arktypeSchema, arktypeField } from '@pyreon/validation/arktype'
```

The barrel `@pyreon/validation` re-exports all three plus the bridge + contract types. Use subpaths in production code to keep the bundle lean.

### Zod

`zodSchema` / `zodField` use `safeParseAsync` internally — sync and async refinements both work. Duck-typed against `{ safeParse, safeParseAsync }`, so Zod v3 and v4 both work. `zodSchema`'s `parse` uses the sync `safeParse` (async refinements are unsupported in schema-driven store mode).

### Valibot

Valibot uses standalone functions — pass `v.safeParse` or `v.safeParseAsync` as the second arg:

```ts
import * as v from 'valibot'
import { valibotSchema, valibotField } from '@pyreon/validation/valibot'

useForm({
  initialValues: { email: '', password: '' },
  schema: valibotSchema(
    v.object({
      email: v.pipe(v.string(), v.email()),
      password: v.pipe(v.string(), v.minLength(8)),
    }),
    v.safeParse,
  ),
  onSubmit: (values) => {
    /* ... */
  },
})
```

### ArkType

ArkType is synchronous — call the type directly, no `safeParse` arg:

```ts
import { type } from 'arktype'
import { arktypeSchema, arktypeField } from '@pyreon/validation/arktype'

useForm({
  initialValues: { email: '', password: '' },
  validators: { email: arktypeField(type('string.email')) },
  schema: arktypeSchema(
    type({ email: 'string.email', password: 'string >= 8' }),
  ),
  onSubmit: (values) => {
    /* ... */
  },
})
```

## The Standard Schema bridge

`standardSchemaToValidator` is the core of the universal gate — it converts any raw Standard Schema into the whole-object `SchemaValidateFn` (`(values) => per-key error record`) that `@pyreon/form` / `@pyreon/store` consume. This is what `useForm` calls under the hood when you pass a raw schema.

```ts
import { z } from 'zod'
import { standardSchemaToValidator } from '@pyreon/validation'

const schema = z.object({ email: z.string().email(), age: z.number().min(18) })
const validate = standardSchemaToValidator(schema)

const errors = await validate({ email: 'x', age: 5 })
// => { email: 'Invalid email', age: 'Too small: ...' }
```

Issue paths flatten to dot-strings (`address.city`); the first message per path wins; the produced validator is always async — `await` it.

Companion helpers:

- **`isStandardSchema(value)`** — type guard detecting the `~standard` property. Used to route a `schema` option to the raw-schema path.
- **`isPyreonAdapter(value)`** — type guard detecting a Pyreon `TypedSchemaAdapter` (the `_infer` brand + a callable `parse`).
- **`wrapStandardSchema(schema)`** — convert a Standard Schema into a synchronous `SchemaParseResult` parser returning the *coerced value* (not form errors). Surfaces async validation as a `Promise` return. `@internal` — most consumers go through `extractParseFn`.
- **`extractParseFn(schema)`** — the primary schema-driven entry point for `@pyreon/store` + `@pyreon/state-tree`: accepts either a `TypedSchemaAdapter` or a raw Standard Schema and returns one uniform sync parser. Throws a `[Pyreon]`-prefixed error if the value is neither shape.
- **`formatIssues(issues, op)`** — format normalized issues into a readable `[Pyreon] Schema validation failed (<op>): ...` message (truncates after 5).

## `InferSchema<S>`

Extract the inferred output type from *either* a Pyreon adapter (reads `_infer`) *or* a raw Standard Schema (reads `~standard.types.output`). Falls back to `Record<string, unknown>` for unknown shapes — it never collapses to `never`. This powers the strict typing in `@pyreon/store` + `@pyreon/state-tree` when you pass a raw schema directly.

```ts
import type { InferSchema } from '@pyreon/validation'
import { z } from 'zod'

const schema = z.object({ id: z.string(), n: z.number() })
type Values = InferSchema<typeof schema> // { id: string; n: number }
```

## `issuesToRecord(issues)`

Utility for building custom adapters. Converts an array of `ValidationIssue` (`{ path, message }`) into a flat field-to-error record. First error per field wins.

```ts
import { issuesToRecord } from '@pyreon/validation'

issuesToRecord([
  { path: 'email', message: 'Required' },
  { path: 'email', message: 'Invalid' }, // dropped — first wins
  { path: 'age', message: 'Too young' },
])
// => { email: 'Required', age: 'Too young' }
```

Nested paths like `address.city` become dot-separated string keys in the output record.

## The validation contract types

These types are **owned by `@pyreon/validation`** (the gate has zero Pyreon deps; the data packages depend on it). `@pyreon/form` re-exports them for back-compat, so `import { ValidationError } from '@pyreon/form'` still works.

| Type                          | Definition / description                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `ValidationError`             | `string \| undefined` — one field's error value                                          |
| `ValidateFn<T, TValues>`      | `(value, allValues, signal?) => ValidationError \| Promise<…>` — single-field validator  |
| `SchemaValidateFn<TValues>`   | `(values) => Partial<Record<keyof TValues, ValidationError>> \| Promise<…>` — whole-object validator |
| `TypedSchemaAdapter<TValues>` | `{ _infer, validator, parse? }` — what `zodSchema`/`valibotSchema`/`arktypeSchema` return |
| `ValidationIssue`             | `{ path: string; message: string }` — normalized issue (aliased `SchemaIssue`)           |
| `ParseResult<T>`              | `{ ok: true; value: T } \| { ok: false; issues: ValidationIssue[] }` (aliased `SchemaParseResult`) |
| `StandardSchemaLike<Output>`  | The `~standard` shape `standardSchemaToValidator` accepts                                 |
| `InferSchema<S>`              | Infer field types from an adapter (`_infer`) or a raw schema (`~standard.types.output`)   |
| `SchemaAdapter<TSchema>`      | Generic schema-adapter factory type                                                       |
| `FieldAdapter<TSchema>`       | Generic field-adapter factory type                                                        |

## Gotchas

- **Zero Pyreon deps.** The contract types live here, not in `@pyreon/form`. `@pyreon/form` re-exports them, so old imports keep working.
- **Raw Standard Schema needs no wrapper.** Pass `z.object(...)` / `v.object(...)` / `type(...)` straight to `useForm({ schema })`. Reach for `zodSchema()` etc. only for the `_infer` brand, the sync `parse` path (schema-driven store / state-tree), or a non-Standard-Schema library.
- **Adapters return an object, not a function.** `zodSchema(...)` is a `TypedSchemaAdapter` (`{ _infer, validator, parse }`) — the form unwraps `.validator` for you.
- **`standardSchemaToValidator`'s output is async.** It always returns a Promise (schemas may validate async). `await` it.
- **All adapters + the bridge are duck-typed** — they never `import` from Zod / Valibot / ArkType. Major version bumps do not break the gate.
- **Zod + Valibot adapters are async** (they call `safeParseAsync`), even for sync-only schemas. **ArkType is synchronous.**
- **Nested paths are dot-flattened** — `{ address: { city: 'Required' } }` becomes `{ 'address.city': 'Required' }` in the record. Form keys must match.
- **Field validators run first** — schema errors only apply where no field-level error already exists on that key.

## Documentation

Full docs: [pyreon.dev/docs/validation](https://pyreon.dev/docs/validation) (or `docs/src/content/docs/validation.md` in this repo).

## License

MIT
