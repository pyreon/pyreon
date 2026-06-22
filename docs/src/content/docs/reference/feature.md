---
title: "Schema-Driven CRUD — API Reference"
description: "Schema-driven CRUD primitives — define once, get queries, forms, tables, and stores"
---

# @pyreon/feature — API Reference

> **Generated** from `feature`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [feature](/docs/feature).

Schema-driven feature factory for Pyreon. Define a feature schema and API config once, and `defineFeature` auto-generates reactive hooks for listing, fetching, searching, creating, updating, deleting, form management, table configuration, and store access. Composes `@pyreon/query`, `@pyreon/form`, `@pyreon/validation`, `@pyreon/store`, and `@pyreon/table` under the hood.

## Features

- defineFeature(&#123; name, schema, api &#125;) — single declaration generates 10+ hooks
- Auto-generated useList, useById, useSearch with @pyreon/query
- Auto-generated useCreate, useUpdate, useDelete mutations
- Auto-generated useForm with schema validation via @pyreon/validation
- Auto-generated useTable with column inference via @pyreon/table
- Auto-generated useStore for global feature state via @pyreon/store
- reference() helper for foreign key relationships in schemas

## Complete example

A full, end-to-end usage of the package:

```tsx
import { defineFeature, reference } from '@pyreon/feature'

// 1. Define feature schema + API config
const Posts = defineFeature({
  name: 'posts',
  schema: {
    title: 'string',
    body: 'string',
    published: 'boolean',
    author: reference('users'),     // foreign key reference
  },
  api: {
    baseUrl: '/api/posts',
    // Optional overrides: listUrl, getUrl, createUrl, updateUrl, deleteUrl, searchUrl
  },
})

// 2. Use auto-generated hooks in components:

// Paginated list query
const ListPage = () => {
  const { data, isLoading } = Posts.useList({ page: 1, limit: 20 })
  return <For each={() => data()?.items ?? []} by={(p) => p.id}>
    {(post) => <div>{post.title}</div>}
  </For>
}

// Single item query
const DetailPage = (props: { id: string }) => {
  const { data } = Posts.useById(props.id)
  return <div>{data()?.title}</div>
}

// Search with debounce (via @pyreon/query)
const SearchPage = () => {
  const query = signal('')
  const { data } = Posts.useSearch(() => query())
  // ...
}

// Create mutation
const CreateForm = () => {
  const { mutate, isLoading } = Posts.useCreate()
  return <button onClick={() => mutate({ title: 'New', body: '...', published: false })}>
    {isLoading() ? 'Creating...' : 'Create'}
  </button>
}

// Edit form with schema validation (via @pyreon/form + @pyreon/validation)
const EditForm = (props: { id: string }) => {
  const { form, field, submit, isSubmitting } = Posts.useForm(props.id)
  return (
    <form onSubmit={submit}>
      <input {...field('title').register()} />
      <textarea {...field('body').register()} />
      <button disabled={isSubmitting}>Save</button>
    </form>
  )
}

// Table with sorting/filtering/pagination (via @pyreon/table)
const TableView = () => {
  const { table } = Posts.useTable({ columns: ['title', 'author', 'published'] })
  // table is a Computed<Table<Post>> — render with flexRender
}

// Global store access
const store = Posts.useStore()
store.items()   // cached items
store.loading() // loading state
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`defineFeature`](#definefeature) | function | Define a schema-driven CRUD feature. |
| [`reference`](#reference) | function | Mark a schema field as a foreign key reference to another feature. |
| [`isReference`](#isreference) | function | Type-guard that returns true if a value is a ReferenceSchema produced by `reference()`. |
| [`extractFields`](#extractfields) | function | Introspect a schema object and return an array of `FieldInfo` describing each field (name, type, optional, label, plus e |
| [`defaultInitialValues`](#defaultinitialvalues) | function | Generate sensible default initial values from extracted field info. |

## API

### defineFeature `function`

```ts
<T>(config: FeatureConfig<T>) => Feature<T>
```

Define a schema-driven CRUD feature. Accepts a name, field schema, and API config. Returns a Feature object with auto-generated hooks: `useList`, `useById`, `useSearch`, `useCreate`, `useUpdate`, `useDelete`, `useForm`, `useTable`, `useStore`. Composes @pyreon/query (data fetching), @pyreon/form (form state), @pyreon/validation (schema validation), @pyreon/store (global state), and @pyreon/table (table configuration). Schema field types are inferred for TypeScript autocompletion across all generated hooks.

**Example**

```tsx
const Posts = defineFeature({
  name: 'posts',
  schema: {
    title: 'string',
    body: 'string',
    author: reference('users'),
  },
  api: { baseUrl: '/api/posts' },
})

Posts.useList({ page: 1 })
Posts.useById('123')
Posts.useCreate()
Posts.useForm('123')
Posts.useTable({ columns: ['title', 'author'] })
```

**Common mistakes**

- Forgetting to install peer dependencies — defineFeature composes @pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table internally
- Using defineFeature without a QueryClient provider — useList/useById/useSearch/useCreate/useUpdate/useDelete all depend on @pyreon/query which requires a QueryClient in context
- Passing schema field types as TypeScript types instead of string literals — schema values must be runtime strings like `"string"`, `"number"`, `"boolean"`, or `reference("otherFeature")`
- Calling useForm without an id for edit mode — pass an id to load existing data, omit it for create mode

**See also:** `reference` · `extractFields` · `defaultInitialValues`

---

### reference `function`

```ts
reference(target: { name: string }) => ReferenceSchema
```

Mark a schema field as a foreign key reference to another feature. Used inside defineFeature schema definitions to establish relationships between features. The generated form and table hooks understand reference fields and can render appropriate UI (select dropdowns, linked displays). The marker is a `Symbol.for('pyreon:feature:reference')` property — invisible to JSON.stringify but detected by extractFields() and the validation layer.

**Example**

```tsx
const Users = defineFeature({ name: 'users', schema: { name: 'string' }, api: { baseUrl: '/api/users' } })
const Posts = defineFeature({
  name: 'posts',
  schema: {
    title: 'string',
    author: reference(Users),    // FK to users feature
    category: reference({ name: 'categories' }),
  },
  api: { baseUrl: '/api/posts' },
})
```

**Common mistakes**

- Passing a plain string instead of a Feature ref — `reference("users")` will not typecheck; pass the Feature object or `{ name: "users" }`.
- Forgetting that the referenced Feature must ALSO be defined via defineFeature — the FK only works end-to-end when both sides are real Features sharing the same QueryClient.
- Expecting reference() to enforce schema validation at the foreign side — it only marks the field. Cascade behaviour (deleting a user → orphaning posts) is the consumer's concern.

**See also:** `defineFeature` · `isReference`

---

### isReference `function`

```ts
isReference(value: unknown) => value is ReferenceSchema
```

Type-guard that returns true if a value is a ReferenceSchema produced by `reference()`. Used internally by `extractFields` to recognise FK fields, and exposed for consumers building custom form/table renderers that need to special-case reference fields (e.g. render a select dropdown instead of a text input).

**Example**

```tsx
import { isReference } from '@pyreon/feature'

for (const [key, value] of Object.entries(Posts.schema)) {
  if (isReference(value)) {
    console.log(`${key} is a foreign key to ${value._featureName}`)
  }
}
```

**Common mistakes**

- Trying to detect references via `instanceof` — references are symbol-tagged plain objects, not class instances. Always use isReference().
- Confusing isReference() with Zod's own type guards — isReference checks ONLY for the Pyreon reference marker, not for arbitrary Zod schemas.

**See also:** `reference` · `extractFields`

---

### extractFields `function`

```ts
extractFields(schema: unknown) => FieldInfo[]
```

Introspect a schema object and return an array of `FieldInfo` describing each field (name, type, optional, label, plus enumValues for enums and referenceTo for references). Duck-types both Zod v3 (`._def.shape` callable) and Zod v4 (`._zod.def.shape` direct) without importing Zod. Used internally by `defineFeature` to build the generated form/table; exposed for consumers building custom UI that needs to enumerate schema fields.

**Example**

```tsx
import { extractFields } from '@pyreon/feature'
import { z } from 'zod'

const schema = z.object({
  title: z.string(),
  views: z.number().optional(),
  status: z.enum(['draft', 'published']),
})

const fields = extractFields(schema)
// [
//   { name: 'title',  type: 'string', optional: false, label: 'Title' },
//   { name: 'views',  type: 'number', optional: true,  label: 'Views' },
//   { name: 'status', type: 'enum',   optional: false, label: 'Status', enumValues: ['draft', 'published'] },
// ]
```

**Common mistakes**

- Calling extractFields on a Pyreon plain-string schema (`{ title: "string" }`) instead of a Zod schema — extractFields expects Zod shapes; the plain-string form is interpreted inside defineFeature, not here.
- Expecting field order to match declaration order in ALL JS engines — relies on Object.keys() insertion order, which V8 / SpiderMonkey / JSC all preserve for string keys but is technically engine-specific.
- Assuming `label` is derived from a docs comment — labels are derived from the field name via humanize-case (`firstName` → `First Name`). Override by passing a label via your own `FieldInfo`.

**See also:** `defaultInitialValues` · `defineFeature`

---

### defaultInitialValues `function`

```ts
defaultInitialValues(fields: FieldInfo[]) => Record<string, unknown>
```

Generate sensible default initial values from extracted field info. Returns `{ stringField: "", numberField: 0, booleanField: false, enumField: <first enumValue>, dateField: "", arrayField: [], objectField: {}, referenceField: null }`. Used by `Posts.useForm()` to seed an empty form when no id is passed (create mode). Exposed for consumers building their own form initial-value seeding logic.

**Example**

```tsx
import { extractFields, defaultInitialValues } from '@pyreon/feature'

const fields = extractFields(zodSchema)
const initial = defaultInitialValues(fields)
// { title: '', views: 0, status: 'draft' }

const form = useForm({ initialValues: initial, ... })
```

**Common mistakes**

- Expecting defaults to come from Zod's `.default()` modifier — defaultInitialValues uses the FIELD TYPE only. Zod-level defaults flow through Zod's own parse, not this helper.
- Using these defaults for create-or-update forms — these are CREATE-mode seeds. For edit mode, fetch the existing record and use those values.

**See also:** `extractFields` · `defineFeature`

---

## Package-level notes

> **Note:** defineFeature composes 5 packages internally (@pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table). All must be installed, and a QueryClient provider must be mounted in the component tree for the query hooks to work.

> **Schema is runtime:** The schema object uses runtime string values (`"string"`, `"number"`, `"boolean"`) and `reference()` calls — not TypeScript types. TypeScript infers the value types from these runtime markers for end-to-end type safety.

> **API config:** The `api.baseUrl` is the only required API field. Individual endpoint URLs default to RESTful conventions (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `GET /search`). Override with `listUrl`, `getUrl`, etc.
