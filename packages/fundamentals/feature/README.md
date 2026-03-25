# @pyreon/feature

Schema-driven feature primitives for Pyreon. Define a Zod schema and API path once, get fully typed CRUD hooks, forms, tables, stores, pagination, optimistic updates, and references -- all wired together automatically.

## Install

```bash
bun add @pyreon/feature
```

Peer dependencies: `@pyreon/core`, `@pyreon/reactivity`

## Quick Start

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
        <li>{u.name} ({u.email})</li>
      ))}
    </ul>
  )
}

// Create form
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

// Edit form (auto-fetches data)
function EditUser({ id }: { id: number }) {
  const form = users.useForm({ mode: 'edit', id })
  if (form.isSubmitting()) return <p>Loading...</p>
  return (
    <form onSubmit={(e) => form.handleSubmit(e)}>
      <input {...form.register('name')} />
      <input {...form.register('email')} />
      <button type="submit">Save</button>
    </form>
  )
}
```

## API Reference

### `defineFeature(config)`

Creates a feature object with all CRUD hooks, form, table, and store.

| Parameter | Type | Description |
| --- | --- | --- |
| `name` | `string` | Unique feature name -- used for store ID and query key namespace |
| `schema` | `ZodSchema` | Validation schema -- passed to `zodSchema()` for form validation |
| `api` | `string` | API base path (e.g., `/api/users`) |
| `initialValues?` | `Partial<TValues>` | Default values for create forms (auto-generated from schema if omitted) |
| `validate?` | `SchemaValidateFn<TValues>` | Custom schema-level validation (overrides auto-detection) |
| `fetcher?` | `typeof fetch` | Custom fetch function (defaults to global `fetch`) |

### Returned Feature Object

| Property / Hook | Returns | Description |
| --- | --- | --- |
| `name` | `string` | Feature name |
| `api` | `string` | API base path |
| `schema` | `unknown` | The schema passed to `defineFeature` |
| `fields` | `FieldInfo[]` | Introspected field metadata from the schema |
| `queryKey(suffix?)` | `QueryKey` | Generate namespaced query keys |
| `useList(opts?)` | `UseQueryResult<T[]>` | GET `api` -- list query with optional pagination and params |
| `useById(id)` | `UseQueryResult<T>` | GET `api/:id` -- single item query |
| `useSearch(term, opts?)` | `UseQueryResult<T[]>` | GET `api?q=term` -- search with reactive signal |
| `useCreate()` | `UseMutationResult` | POST `api` -- invalidates list on success |
| `useUpdate()` | `UseMutationResult` | PUT `api/:id` -- optimistic update with rollback on error |
| `useDelete()` | `UseMutationResult` | DELETE `api/:id` -- invalidates list on success |
| `useForm(opts?)` | `FormState<T>` | Form with schema validation + API submit |
| `useTable(data, opts?)` | `FeatureTableResult<T>` | Reactive table with schema-inferred columns |
| `useStore()` | `StoreApi<FeatureStore<T>>` | Reactive store for items, selection, and loading state |

### `reference(feature)`

Creates a typed foreign key field for cross-feature relationships.

| Parameter | Type | Description |
| --- | --- | --- |
| `feature` | `{ name: string }` | The referenced feature (or any object with a `name` property) |

Returns a Zod-compatible schema that validates as `string | number` and carries metadata about the referenced feature.

### `extractFields(schema)`

Extracts field metadata from a Zod object schema.

| Parameter | Type | Description |
| --- | --- | --- |
| `schema` | `unknown` | A Zod object schema (duck-typed, works with v3 and v4) |

Returns `FieldInfo[]` with `name`, `type`, `optional`, `enumValues`, `referenceTo`, and `label` for each field.

### `isReference(value)`

Returns `true` if a value is a reference schema created by `reference()`.

### `defaultInitialValues(fields)`

Generates default initial values from a `FieldInfo[]` array. Strings default to `''`, numbers to `0`, booleans to `false`, enums to the first value.

## useStore

The feature store provides a reactive cache for list data and selection state. It uses `@pyreon/store` internally with the feature name as the store ID.

```tsx
function UserManager() {
  const { store } = users.useStore()
  const { data } = users.useList()

  // Sync query data to store
  effect(() => {
    const items = data()
    if (items) store.items.set(items)
  })

  return (
    <div>
      <ul>
        {store.items().map((u) => (
          <li onClick={() => store.select(u.id)}>
            {u.name}
          </li>
        ))}
      </ul>
      {store.selected() && (
        <div>Selected: {store.selected()!.name}</div>
      )}
      <button onClick={() => store.clear()}>Clear Selection</button>
    </div>
  )
}
```

**Store API:**

| Property | Type | Description |
| --- | --- | --- |
| `items` | `Signal<TValues[]>` | Cached list of items |
| `selected` | `Signal<TValues \| null>` | Currently selected item |
| `loading` | `Signal<boolean>` | Loading state |
| `select(id)` | `(id: string \| number) => void` | Find and select an item by ID from the items list |
| `clear()` | `() => void` | Clear the current selection |

## Pagination

Pass `page` (number or reactive signal) and `pageSize` to `useList()` for automatic pagination. Each page is cached independently.

```tsx
function PaginatedUsers() {
  const page = signal(1)
  const { data, isPending } = users.useList({ page, pageSize: 10 })

  return (
    <div>
      {isPending() ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {data()!.map((u) => <li>{u.name}</li>)}
        </ul>
      )}
      <button onClick={() => page.set(page() - 1)} disabled={page() <= 1}>
        Previous
      </button>
      <button onClick={() => page.set(page() + 1)}>
        Next
      </button>
    </div>
  )
}
```

**ListOptions:**

| Parameter | Type | Description |
| --- | --- | --- |
| `params?` | `Record<string, string \| number \| boolean>` | Additional query parameters |
| `page?` | `number \| Signal<number>` | Page number (reactive or static) |
| `pageSize?` | `number` | Items per page (defaults to 20 when `page` is set) |
| `staleTime?` | `number` | Override stale time for this query |
| `enabled?` | `boolean` | Enable/disable the query |

## Edit Form (Auto-fetch)

When `useForm()` is called with `mode: 'edit'` and an `id`, it automatically fetches the item and populates the form. The form's `isSubmitting` signal is `true` until the data loads.

```tsx
function EditUser({ id }: { id: number }) {
  const form = users.useForm({
    mode: 'edit',
    id,
    onSuccess: () => console.log('Updated!'),
    onError: (err) => console.error(err),
  })

  if (form.isSubmitting()) return <p>Loading user...</p>

  return (
    <form onSubmit={(e) => form.handleSubmit(e)}>
      <input {...form.register('name')} />
      <input {...form.register('email')} />
      <button type="submit">Save</button>
    </form>
  )
}
```

**FeatureFormOptions:**

| Parameter | Type | Description |
| --- | --- | --- |
| `mode?` | `'create' \| 'edit'` | Form mode (default: `'create'`) |
| `id?` | `string \| number` | Item ID for edit mode (triggers auto-fetch) |
| `initialValues?` | `Partial<TValues>` | Override initial values |
| `validateOn?` | `'blur' \| 'change' \| 'submit'` | Validation trigger (default: `'blur'`) |
| `onSuccess?` | `(result: unknown) => void` | Called after successful submit |
| `onError?` | `(error: unknown) => void` | Called on submit error |

## Optimistic Updates

`useUpdate()` automatically performs optimistic cache updates. When a mutation starts, the query cache is updated immediately with the new data. If the server returns an error, the cache rolls back to the previous value.

```tsx
function UserRow({ user }: { user: User }) {
  const { mutate: update } = users.useUpdate()

  const toggleActive = () => {
    // Cache updates immediately, rolls back on error
    update({ id: user.id, data: { active: !user.active } })
  }

  return (
    <tr>
      <td>{user.name}</td>
      <td>
        <button onClick={toggleActive}>
          {user.active ? 'Deactivate' : 'Activate'}
        </button>
      </td>
    </tr>
  )
}
```

## References

Use `reference()` to define typed foreign keys between features. Reference fields validate as `string | number` and carry metadata for form dropdowns and table links.

```tsx
import { defineFeature, reference } from '@pyreon/feature'
import { z } from 'zod'

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
    authorId: reference(users),  // typed foreign key
  }),
  api: '/api/posts',
})

// Field introspection detects the reference
const authorField = posts.fields.find((f) => f.name === 'authorId')
// { name: 'authorId', type: 'reference', referenceTo: 'users', ... }
```

## Schema Introspection

Every feature exposes `fields: FieldInfo[]` with metadata extracted from the schema at runtime. This powers automatic table columns, form generation, and reference detection.

```tsx
function AutoForm({ feature }: { feature: Feature<any> }) {
  const form = feature.useForm()
  return (
    <form onSubmit={(e) => form.handleSubmit(e)}>
      {feature.fields.map((field) => {
        if (field.type === 'enum') {
          return (
            <select {...form.register(field.name)}>
              {field.enumValues!.map((v) => (
                <option value={v}>{v}</option>
              ))}
            </select>
          )
        }
        if (field.type === 'boolean') {
          return <input type="checkbox" {...form.register(field.name, { type: 'checkbox' })} />
        }
        if (field.type === 'reference') {
          return <p>Reference to: {field.referenceTo}</p>
        }
        return <input {...form.register(field.name)} placeholder={field.label} />
      })}
      <button type="submit">Submit</button>
    </form>
  )
}
```

**FieldInfo:**

| Property | Type | Description |
| --- | --- | --- |
| `name` | `string` | Field name (key in the schema) |
| `type` | `FieldType` | `'string'`, `'number'`, `'boolean'`, `'date'`, `'enum'`, `'array'`, `'object'`, `'reference'`, or `'unknown'` |
| `optional` | `boolean` | Whether the field is optional |
| `enumValues?` | `(string \| number)[]` | Allowed values for enum fields |
| `referenceTo?` | `string` | Referenced feature name for reference fields |
| `label` | `string` | Human-readable label (e.g., `firstName` becomes `First Name`) |

## Error Handling

The built-in fetcher parses structured error responses from the API. Errors with a `message` field in the response body use that as the error message. Errors with an `errors` object attach it to the thrown error for field-level error handling.

```tsx
function CreateUser() {
  const { mutate, error, isError } = users.useCreate()

  const handleCreate = () => {
    mutate({ name: 'Alice', email: 'taken@example.com' })
  }

  return (
    <div>
      <button onClick={handleCreate}>Create</button>
      {isError() && (
        <div>
          <p>{(error() as Error).message}</p>
          {(error() as any).errors?.email && (
            <p>Email: {(error() as any).errors.email}</p>
          )}
        </div>
      )}
    </div>
  )
}
```

## Why

An AI agent asked to "add user management" writes 10 lines of schema instead of 200 lines of components, hooks, and wiring. The feature definition is the single source of truth -- types, validation, API calls, cache management, optimistic updates, pagination, and store state all flow from the schema. Human developers get the same leverage: one `defineFeature()` call replaces dozens of boilerplate files.
