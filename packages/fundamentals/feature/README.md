# @pyreon/feature

Schema-driven CRUD primitives — define a Zod schema once, get queries / forms / tables / stores.

`defineFeature({ name, schema, api })` takes a Zod schema and a REST endpoint and produces a complete set of auto-wired hooks: `useList` / `useById` / `useSearch` (queries), `useCreate` / `useUpdate` / `useDelete` (mutations with auto-invalidation + optimistic updates on update), `useForm` (with schema validation + auto-fetch in edit mode), `useTable` (with schema-inferred columns), and `useStore` (cached selection + items). Composes `@pyreon/query` + `@pyreon/form` + `@pyreon/validation` + `@pyreon/store` + `@pyreon/table` under the hood — the feature definition is the single source of truth that lets an AI agent (or a human) write 10 lines of schema instead of 200 lines of wiring.

## Install

```bash
bun add @pyreon/feature @pyreon/core @pyreon/reactivity zod
```

Transitive workspace dependencies (`@pyreon/form` / `@pyreon/query` / `@pyreon/validation` / `@pyreon/store` / `@pyreon/table`) come with `@pyreon/feature`. **A `<QueryClientProvider>` must be mounted in the component tree** — every query / mutation hook depends on `@pyreon/query`'s context.

## Quick start

```tsx
import { defineFeature, reference } from '@pyreon/feature'
import { z } from 'zod'

const users = defineFeature({
  name: 'users',
  schema: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    role: z.enum(['admin', 'editor', 'viewer']),
  }),
  api: '/api/users',
})

// List query
function UserList() {
  const { data, isPending } = users.useList()
  if (isPending()) return <p>Loading...</p>
  return (
    <ul>
      {data()!.map((u) => (
        <li>
          {u.name} ({u.email})
        </li>
      ))}
    </ul>
  )
}

// Create form — schema validation + POST /api/users
function CreateUser() {
  const form = users.useForm()
  return (
    <form onSubmit={(e) => form.handleSubmit(e)}>
      <input {...form.register('name')} />
      <input {...form.register('email')} />
      <select {...form.register('role')}>
        <option value="admin">Admin</option>
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
      </select>
      <button type="submit">Create</button>
    </form>
  )
}

// Edit form — auto-fetches existing data, PUT /api/users/:id on submit
function EditUser({ id }: { id: number }) {
  const form = users.useForm({ mode: 'edit', id })
  return (
    <form onSubmit={(e) => form.handleSubmit(e)}>
      <input {...form.register('name')} />
      <input {...form.register('email')} />
      <button type="submit">Save</button>
    </form>
  )
}
```

## `defineFeature(config)`

| Option           | Type                        | Description                                                              |
| ---------------- | --------------------------- | ------------------------------------------------------------------------ |
| `name`           | `string`                    | Unique feature name — used for store ID and query-key namespace          |
| `schema`         | Zod-compatible schema       | Validation schema (Zod v3 / v4, duck-typed; ArkType / Valibot also work) |
| `api`            | `string`                    | REST base path (e.g. `'/api/users'`)                                     |
| `initialValues?` | `Partial<TValues>`          | Default create-form values (auto-generated from schema field types if omitted) |
| `validate?`      | `SchemaValidateFn<TValues>` | Custom schema-level validation (overrides schema-from-`safeParseAsync`)  |
| `fetcher?`       | `typeof fetch`              | Custom fetch (e.g. for auth headers); defaults to global `fetch`         |

`TValues` is inferred from `schema._output` (Zod v3/v4 carry it) — all generated hooks are end-to-end typed.

## Returned `Feature<TValues>`

| Hook / Property          | Returns                       | Description                                                  |
| ------------------------ | ----------------------------- | ------------------------------------------------------------ |
| `name`                   | `string`                      | Feature name                                                 |
| `api`                    | `string`                      | API base path                                                |
| `schema`                 | `unknown`                     | The original schema reference                                |
| `fields`                 | `FieldInfo[]`                 | Schema-introspected field metadata                           |
| `queryKey(suffix?)`      | `QueryKey`                    | Namespaced query keys: `[name, ...]`                         |
| `useList(opts?)`         | `UseQueryResult<TValues[]>`   | `GET /api` — list with optional pagination + params          |
| `useById(id)`            | `UseQueryResult<TValues>`     | `GET /api/:id`                                               |
| `useSearch(term, opts?)` | `UseQueryResult<TValues[]>`   | `GET /api?q=…` — reactive signal term                        |
| `useCreate()`            | `UseMutationResult`           | `POST /api`, auto-invalidates list on success                |
| `useUpdate()`            | `UseMutationResult`           | `PUT /api/:id`, **optimistic update with rollback on error** |
| `useDelete()`            | `UseMutationResult`           | `DELETE /api/:id`, auto-invalidates list                     |
| `useForm(opts?)`         | `FormState<TValues>`          | Schema-validated form + API submit                           |
| `useTable(data, opts?)`  | `FeatureTableResult<TValues>` | Reactive TanStack Table with schema-inferred columns         |
| `useStore()`             | `StoreApi<FeatureStore>`      | Items + selected + loading state                             |

## Pagination

Pass `page` (number or signal) and `pageSize` to `useList()` — each page is cached independently via the query key.

```tsx
const page = signal(1)
const { data, isPending } = users.useList({ page, pageSize: 10 })
```

`ListOptions`:

| Field         | Type                                          | Description                                       |
| ------------- | --------------------------------------------- | ------------------------------------------------- |
| `params?`     | `Record<string, string \| number \| boolean>` | Additional query parameters                       |
| `page?`       | `number \| Signal<number>`                    | Reactive page number                              |
| `pageSize?`   | `number`                                      | Items per page (defaults to `20` if `page` is set) |
| `staleTime?`  | `number`                                      | Override stale time for this query                |
| `enabled?`    | `boolean`                                     | Enable/disable                                    |

## Edit form (auto-fetch)

`useForm({ mode: 'edit', id })` fetches the item by ID and populates the form. `isSubmitting` is `true` until the data lands.

```tsx
const form = users.useForm({
  mode: 'edit',
  id,
  onSuccess: () => console.log('Updated!'),
  onError: (err) => console.error(err),
})
```

`FeatureFormOptions`:

| Field            | Type                             | Description                            |
| ---------------- | -------------------------------- | -------------------------------------- |
| `mode?`          | `'create' \| 'edit'`             | Default: `'create'`                    |
| `id?`            | `string \| number`               | Required when `mode: 'edit'`           |
| `initialValues?` | `Partial<TValues>`               | Override defaults                      |
| `validateOn?`    | `'blur' \| 'change' \| 'submit'` | Default: `'blur'`                      |
| `onSuccess?`     | `(result: unknown) => void`      | After successful submit                |
| `onError?`       | `(error: unknown) => void`       | On submit error                        |

## Optimistic updates (useUpdate)

`useUpdate()` writes to the query cache immediately, then rolls back if the server returns an error.

```tsx
const { mutate: update } = users.useUpdate()
update({ id: user.id, data: { active: !user.active } })
// Cache updates immediately, rolls back on error
```

## `reference(feature)`

Foreign-key field for cross-feature relationships. Returns a Zod-compatible schema that validates as `string | number` and carries metadata about the referenced feature for form dropdowns and table links.

```tsx
const users = defineFeature({
  name: 'users',
  schema: z.object({ name: z.string(), email: z.string().email() }),
  api: '/api/users',
})

const posts = defineFeature({
  name: 'posts',
  schema: z.object({
    title: z.string(),
    body: z.string(),
    authorId: reference(users), // typed foreign key
  }),
  api: '/api/posts',
})

const authorField = posts.fields.find((f) => f.name === 'authorId')
// { name: 'authorId', type: 'reference', referenceTo: 'users', label: 'Author Id' }
```

## Schema introspection

Every feature exposes `fields: FieldInfo[]` extracted from the schema at runtime (duck-typed against Zod v3 + v4). Powers auto-generated form fields, table columns, and reference detection.

```ts
function AutoForm({ feature }: { feature: Feature<any> }) {
  const form = feature.useForm()
  return (
    <form onSubmit={(e) => form.handleSubmit(e)}>
      {feature.fields.map((field) => {
        if (field.type === 'enum') {
          return (
            <select {...form.register(field.name)}>
              {field.enumValues!.map((v) => <option value={v}>{v}</option>)}
            </select>
          )
        }
        if (field.type === 'boolean') {
          return <input type="checkbox" {...form.register(field.name, { type: 'checkbox' })} />
        }
        if (field.type === 'reference') return <p>Reference to: {field.referenceTo}</p>
        return <input {...form.register(field.name)} placeholder={field.label} />
      })}
      <button type="submit">Submit</button>
    </form>
  )
}
```

`FieldInfo`:

| Property       | Type                   | Description                                                                                                   |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `name`         | `string`               | Schema key                                                                                                    |
| `type`         | `FieldType`            | `'string' \| 'number' \| 'boolean' \| 'date' \| 'enum' \| 'array' \| 'object' \| 'reference' \| 'unknown'`     |
| `optional`     | `boolean`              | Schema `.optional()` / `.nullable()`                                                                          |
| `enumValues?`  | `(string \| number)[]` | Enum-only                                                                                                     |
| `referenceTo?` | `string`               | Reference-only — name of the referenced feature                                                               |
| `label`        | `string`               | Auto-derived from name (`firstName` → `'First Name'`, `created_at` → `'Created At'`)                          |

Helpers: `extractFields(schema)` returns the `FieldInfo[]` for any Zod schema; `isReference(value)` checks for the `reference()` brand; `defaultInitialValues(fields)` generates default values from field types.

## `useStore`

Reactive cache for items, selection, and loading state — composed via `@pyreon/store` under the feature's name.

```tsx
const { store } = users.useStore()
const { data } = users.useList()

effect(() => {
  const items = data()
  if (items) store.items.set(items)
})

// store.items() | store.selected() | store.loading() | store.select(id) | store.clear()
```

`FeatureStore<TValues>`:

| Property     | Type                             | Description                            |
| ------------ | -------------------------------- | -------------------------------------- |
| `items`      | `Signal<TValues[]>`              | Cached list                            |
| `selected`   | `Signal<TValues \| null>`        | Currently selected item                |
| `loading`    | `Signal<boolean>`                | Loading state                          |
| `select(id)` | `(id: string \| number) => void` | Select by ID from `items`              |
| `clear()`    | `() => void`                     | Clear selection                        |

## Error handling

The built-in fetcher parses structured error responses — `{ message: string }` becomes `error().message`, and `{ errors: { field: string } }` is attached to the thrown error for field-level handling.

```tsx
const { mutate, error, isError } = users.useCreate()
mutate({ name: 'Alice', email: 'taken@example.com' })

isError() && (
  <div>
    <p>{(error() as Error).message}</p>
    {(error() as any).errors?.email && <p>Email: {(error() as any).errors.email}</p>}
  </div>
)
```

## Gotchas

- **Requires a `<QueryClientProvider>`** mounted above the feature's hooks. `useList` / `useById` / `useSearch` / `useCreate` / `useUpdate` / `useDelete` all depend on `@pyreon/query`'s context.
- **`schema` is a real Zod (or Zod-compatible) schema**, not a runtime-string map. `TValues` is inferred via the `_output` field that Zod v3 and v4 both expose.
- **`api` is a string base path**, not an object. RESTful URLs are derived: `GET /api`, `GET /api/:id`, `POST /api`, `PUT /api/:id`, `DELETE /api/:id`, `GET /api?q=…`.
- **`useUpdate` does optimistic updates with rollback** — the cache reflects the new value immediately and rolls back on error. Useful by default; if you don't want this, write the mutation manually via `useMutation`.
- **`useForm({ mode: 'edit', id })` triggers a fetch** — `isSubmitting` is `true` while loading. Skip the `id` (or pass `mode: 'create'`) to use the form for creation.
- **`reference(feature)` is a Zod-shaped schema** — it returns `string | number` runtime-validated values. Pass any `{ name: string }` (a Feature is one) — the metadata flows into the generated form / table renderers.
- **Auto-generated `initialValues` use type defaults** — `string → ''`, `number → 0`, `boolean → false`, `enum → first value`. Override via `initialValues` if your schema has non-default defaults.

## Documentation

Full docs: [docs.pyreon.dev/docs/feature](https://docs.pyreon.dev/docs/feature) (or `docs/docs/feature.md` in this repo).

## License

MIT
