# @pyreon/validation

Schema adapters for `@pyreon/form` — Zod, Valibot, ArkType.

Duck-typed adapter layer that lets you plug a Zod / Valibot / ArkType schema into `@pyreon/form` for whole-form OR per-field validation. None of the validator libraries are hard dependencies — they're declared as optional peers, and the adapters interface against duck-typed shapes (`safeParse` / `safeParseAsync` / call-as-function) so a single major upgrade in any of them does not break the adapter. Each library has its own subpath entry to avoid pulling unused adapter code into your bundle.

## Install

```bash
bun add @pyreon/validation @pyreon/form

# Add whichever validator library you use (all peer-optional):
bun add zod        # for zodSchema/zodField
bun add valibot    # for valibotSchema/valibotField
bun add arktype    # for arktypeSchema/arktypeField
```

## Quick start

```ts
import { z } from 'zod'
import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation/zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().min(13),
})

const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: zodSchema(schema),
  onSubmit: async (values) => console.log(values),
})
```

Each adapter ships in two flavors: **schema-level** (validates the whole form via `form.schema`) and **field-level** (validates one field via `form.validators[name]`).

## Subpath imports

Each library has its own entry so unused adapters are not bundled:

```ts
import { zodSchema, zodField } from '@pyreon/validation/zod'
import { valibotSchema, valibotField } from '@pyreon/validation/valibot'
import { arktypeSchema, arktypeField } from '@pyreon/validation/arktype'
```

The barrel `@pyreon/validation` re-exports all three for convenience. Use subpaths in production code to keep the bundle lean.

## Zod

`zodSchema(schema)` and `zodField(schema)` both use `safeParseAsync` internally — sync and async refinements both work. Duck-typed against `{ safeParse, safeParseAsync }`, so Zod v3 and v4 both work without breaking changes.

```ts
import { z } from 'zod'
import { zodSchema, zodField } from '@pyreon/validation/zod'

useForm({
  initialValues: { email: '', password: '' },
  validators: {
    email: zodField(z.string().email('Invalid email')),
  },
  schema: zodSchema(
    z.object({ email: z.string().email(), password: z.string().min(8) }),
  ),
  onSubmit: (values) => {
    /* ... */
  },
})
```

## Valibot

Valibot uses standalone functions — pass `v.safeParse` or `v.safeParseAsync` as the second arg:

```ts
import * as v from 'valibot'
import { valibotSchema, valibotField } from '@pyreon/validation/valibot'

useForm({
  initialValues: { email: '', password: '' },
  validators: {
    email: valibotField(v.pipe(v.string(), v.email('Invalid')), v.safeParseAsync),
  },
  schema: valibotSchema(
    v.object({
      email: v.pipe(v.string(), v.email()),
      password: v.pipe(v.string(), v.minLength(8)),
    }),
    v.safeParseAsync,
  ),
  onSubmit: (values) => {
    /* ... */
  },
})
```

## ArkType

ArkType is synchronous — call the type directly.

```ts
import { type } from 'arktype'
import { arktypeSchema, arktypeField } from '@pyreon/validation/arktype'

useForm({
  initialValues: { email: '', password: '' },
  validators: {
    email: arktypeField(type('string.email')),
  },
  schema: arktypeSchema(
    type({
      email: 'string.email',
      password: 'string >= 8',
    }),
  ),
  onSubmit: (values) => {
    /* ... */
  },
})
```

## Mixing field + schema validators

Field-level validators run first; schema errors merge after — a schema error can override a field-level error on the same key.

```ts
useForm({
  initialValues: { email: '', password: '', confirmPassword: '' },
  validators: {
    email: zodField(z.string().email()),
  },
  schema: zodSchema(
    z
      .object({
        email: z.string(),
        password: z.string(),
        confirmPassword: z.string(),
      })
      .refine((d) => d.password === d.confirmPassword, {
        path: ['confirmPassword'],
        message: 'Passwords must match',
      }),
  ),
  onSubmit: (values) => {
    /* ... */
  },
})
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

## Types

| Type                          | Description                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| `ValidationIssue`             | `{ path: string; message: string }` — normalized issue            |
| `SchemaAdapter<TSchema>`      | Generic schema adapter factory type                               |
| `FieldAdapter<TSchema>`       | Generic field adapter factory type                                |
| `TypedSchemaAdapter<TValues>` | Adapter returned by `zodSchema` — preserves inferred value types  |
| `SchemaValidateFn<TValues>`   | Re-exported from `@pyreon/form` — `(values) => Record<key, error>` |
| `ValidateFn<T>`               | Re-exported from `@pyreon/form` — `(value, allValues) => string \| undefined` |
| `ValidationError`             | Re-exported from `@pyreon/form` — `string \| undefined`           |

## Gotchas

- **All adapters are duck-typed** — they never `import` from Zod / Valibot / ArkType. Major version bumps in any validator library do not break the adapter.
- **Zod + Valibot adapters are async**, even when the schema only contains sync refinements (they call `safeParseAsync`). The form's `isValidating` signal is `true` until the promise resolves.
- **ArkType adapters are synchronous** — ArkType has no async-validation surface.
- **Thrown errors are caught** and converted to error strings — the form does NOT crash on a validator throw, but you lose stack-trace context. Audit validator logic if errors look truncated.
- **Nested paths are dot-flattened** — `{ address: { city: 'Required' } }` becomes `{ 'address.city': 'Required' }` in the record. Form keys must match.
- **Field validators run first** — schema errors only apply where no field-level error already exists on that key. Reorder by removing the per-field validator if you want the schema to win.

## Documentation

Full docs: [pyreon.dev/docs/validation](https://pyreon.dev/docs/validation) (or `docs/src/content/docs/validation.md` in this repo).

## License

MIT
