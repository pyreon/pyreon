# @pyreon/feature

Schema-driven CRUD primitives. Define a schema and API endpoint once, get auto-generated queries, mutations, forms, tables, and stores.

## Installation

```bash
bun add @pyreon/feature @pyreon/query @pyreon/form @pyreon/validation @pyreon/store @pyreon/table
```

## Usage

### Define a Feature

```tsx
import { defineFeature } from "@pyreon/feature"
import { z } from "zod"

const users = defineFeature({
  name: "users",
  schema: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    role: z.enum(["admin", "editor", "viewer"]),
  }),
  api: "/api/users",
})
```

### List Page

```tsx
function UsersPage() {
  const { data, isPending } = users.useList()
  if (isPending()) return <p>Loading...</p>
  return <ul>{data()!.map(u => <li key={u.email}>{u.name}</li>)}</ul>
}
```

### Create Form

```tsx
function CreateUser() {
  const form = users.useForm()
  return (
    <form onSubmit={(e: Event) => form.handleSubmit(e)}>
      <input {...form.register("name")} />
      <input {...form.register("email")} />
      <button type="submit">Create</button>
    </form>
  )
}
```

### Edit Form (auto-fetches item)

```tsx
function EditUser({ id }: { id: number }) {
  const form = users.useForm({ mode: "edit", id })
  return (
    <form onSubmit={(e: Event) => form.handleSubmit(e)}>
      <input {...form.register("name")} />
      <button type="submit">Save</button>
    </form>
  )
}
```

### Generated Hooks

Each `defineFeature()` call generates:

| Hook | Description |
| --- | --- |
| `useList(options?)` | Paginated list query |
| `useById(id)` | Single item query |
| `useSearch(params)` | Search/filter query |
| `useCreate()` | Create mutation |
| `useUpdate()` | Update mutation with optimistic updates |
| `useDelete()` | Delete mutation |
| `useForm(options?)` | Pre-configured form with schema validation |
| `useTable(options?)` | Pre-configured table with column definitions |
| `useStore()` | Feature-scoped store |

### Schema Introspection

```ts
import { extractFields, reference, defaultInitialValues } from "@pyreon/feature"

const fields = extractFields(schema)
// [{ name: "name", type: "string", required: true }, ...]

const initialValues = defaultInitialValues(schema)
// { name: "", email: "", role: "admin" }

// Reference fields for relations
const postSchema = z.object({
  title: z.string(),
  authorId: reference("users"),
})
```

## API Reference

| Export | Description |
| --- | --- |
| `defineFeature(config)` | Create a feature with auto-generated CRUD hooks |
| `extractFields(schema)` | Introspect schema into `FieldInfo[]` |
| `defaultInitialValues(schema)` | Generate default values from schema |
| `reference(featureName)` | Mark a field as a foreign key reference |
| `isReference(value)` | Type guard for reference schemas |
