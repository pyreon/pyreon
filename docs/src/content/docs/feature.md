---
title: Feature
description: Schema-driven CRUD primitives with auto-generated hooks for lists, forms, tables, and stores.
---

`@pyreon/feature` eliminates CRUD boilerplate by deriving an entire feature's data layer from a single schema definition. Define your entity once with `defineFeature`, and get reactive hooks for listing, fetching, searching, creating, updating, and deleting records — all composed from `@pyreon/query` (server state), `@pyreon/form` (forms + validation), `@pyreon/table` (tables), and `@pyreon/store` (client-side cache).

<PackageBadge name="@pyreon/feature" href="/docs/feature" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/feature
```

```bash [bun]
bun add @pyreon/feature
```

```bash [pnpm]
pnpm add @pyreon/feature
```

```bash [yarn]
yarn add @pyreon/feature
```

:::

`@pyreon/feature` composes five Pyreon packages under the hood — `@pyreon/query`, `@pyreon/form`, `@pyreon/validation`, `@pyreon/store`, and `@pyreon/table`. They are declared as dependencies, so a single install pulls them in. You also need a validation library for your schema (`zod`, `valibot`, or `arktype`).

:::warning
The query hooks (`useList`, `useById`, `useSearch`, `useCreate`, `useUpdate`, `useDelete`, and `useForm` in edit mode) all run on `@pyreon/query`, which requires a `QueryClient` mounted in the component tree. Wrap your app in `<QueryClientProvider client={...}>` or every query hook throws.
:::

## Quick Start

Define a feature with a validation schema and an API base path, then use the auto-generated hooks in your components:

```ts
import { defineFeature } from '@pyreon/feature'
import { z } from 'zod'

const tasks = defineFeature({
  name: 'tasks',
  schema: z.object({
    title: z.string().min(1),
    status: z.enum(['todo', 'in-progress', 'done']),
    assignee: z.string().optional(),
    dueDate: z.string().optional(),
  }),
  api: '/api/tasks',
})
```

:::note
`schema` is a real validation schema (Zod, Valibot, or ArkType) — **not** a map of string type names. `api` is a **string** (the REST base path), not a config object. Endpoint URLs follow RESTful conventions automatically (see [API Conventions](#api-conventions)).
:::

Use the generated query hook in a component. `useList` returns `@pyreon/query`'s `UseQueryResult` — `data`, `isLoading`, `error`, etc. are all reactive signals you call:

```tsx
function TaskList() {
  const { data, isLoading, error } = tasks.useList()

  return () => (
    <div>
      {isLoading() && <p>Loading tasks…</p>}
      {error() && <p>Error: {error()?.message}</p>}
      <For each={() => data() ?? []} by={(t) => t.id}>
        {(task) => <li>{task.title} — {task.status}</li>}
      </For>
    </div>
  )
}
```

Add a creation form with a single hook. `useForm` returns `@pyreon/form`'s `FormState` directly — `register`, `handleSubmit`, and `isSubmitting` live on it:

```tsx
function CreateTask() {
  const form = tasks.useForm()

  return () => (
    <form onSubmit={form.handleSubmit}>
      <input {...form.register('title')} placeholder="Task title" />
      <button type="submit" disabled={form.isSubmitting()}>Create</button>
    </form>
  )
}
```

<Example file="./examples/feature/definefeature-crud-from-a-schema" title="defineFeature — CRUD from a schema" />

## `defineFeature` Configuration

`defineFeature(config)` accepts a `FeatureConfig` object and returns a `Feature` with the generated hooks and metadata:

```ts
const tasks = defineFeature({
  // Required: unique name — used as the @pyreon/store ID and query-key namespace
  name: 'tasks',

  // Required: a validation schema. Validation works for Zod AND any Standard
  // Schema (Valibot / ArkType / modern Zod / `@pyreon/validate`'s `s`).
  // NOTE: field INTROSPECTION (auto form fields, table columns, create-form
  // defaults) is Zod-only — with a Valibot/ArkType schema you must supply
  // `initialValues` + table `columns` explicitly. Zod's `_output` drives
  // TypeScript inference of the entity type.
  schema: z.object({
    title: z.string().min(1),
    status: z.enum(['todo', 'in-progress', 'done']),
  }),

  // Required: REST base path (a STRING, not a config object)
  api: '/api/tasks',

  // Optional: override schema-derived create-form defaults
  initialValues: { status: 'todo' },

  // Optional: custom schema-level validation (overrides auto-detection)
  validate: myValidateFn,

  // Optional: custom fetch implementation (defaults to global fetch)
  fetcher: myAuthedFetch,
})
```

### `FeatureConfig`

| Property        | Type                              | Required | Description                                                                                                |
| --------------- | --------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `name`          | `string`                          | Yes      | Unique feature name. Used as the `@pyreon/store` ID and the query-key namespace.                           |
| `schema`        | validation schema                 | Yes      | Zod, or any Standard Schema (Valibot / ArkType / `s`) — see [Validators & introspection](#validators--introspection). Zod's `_output` infers the entity type. |
| `api`           | `string`                          | Yes      | REST base path, e.g. `'/api/tasks'`. Endpoint URLs derive from RESTful conventions.                        |
| `initialValues` | `Partial<TValues>`                | No       | Override the schema-derived defaults used to seed `useForm` create-mode.                                   |
| `validate`      | `SchemaValidateFn<TValues>`       | No       | Custom validation function. When provided, replaces auto-detection from the schema.                        |
| `fetcher`       | `typeof fetch`                    | No       | Custom fetch (auth headers, base URL rewriting, mocking). Defaults to global `fetch`.                      |

### Return Value

`defineFeature` returns a `Feature<TValues>` object:

| Property      | Type                                                                | Description                                                |
| ------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `name`        | `string`                                                            | The feature name passed in.                                |
| `api`         | `string`                                                            | The API base path passed in.                               |
| `schema`      | `unknown`                                                           | The original schema (untyped — passed through verbatim).   |
| `fields`      | `FieldInfo[]`                                                       | Schema fields introspected at definition time.             |
| `queryKey`    | `(suffix?: string \| number) => QueryKey`                           | Namespaced query-key factory: `['tasks']` / `['tasks', 5]`. |
| `useList`     | `(opts?: ListOptions) => UseQueryResult<TValues[]>`                 | Fetch a list (optionally paginated / filtered).            |
| `useById`     | `(id: string \| number) => UseQueryResult<TValues>`                 | Fetch one entity by ID.                                    |
| `useSearch`   | `(term: Signal<string>, opts?: ListOptions) => UseQueryResult<TValues[]>` | Reactive search keyed on a signal.                  |
| `useCreate`   | `() => UseMutationResult<TValues, unknown, Partial<TValues>>`       | Create mutation (`POST`).                                  |
| `useUpdate`   | `() => UseMutationResult<TValues, unknown, { id; data }>`           | Update mutation (`PUT`) with optimistic cache updates.     |
| `useDelete`   | `() => UseMutationResult<void, unknown, string \| number>`          | Delete mutation (`DELETE`).                                |
| `useForm`     | `(opts?: FeatureFormOptions) => FormState<TValues>`                 | Form with create / edit modes + schema validation.         |
| `useTable`    | `(data, opts?: FeatureTableOptions) => FeatureTableResult<TValues>` | Table with schema-inferred columns.                        |
| `useStore`    | `() => StoreApi<FeatureStore<TValues>>`                             | Reactive client-side cache.                                |

### Validators & introspection

`defineFeature` uses the schema for **two independent jobs**, and they have different validator coverage:

| Job | What it powers | Validator support |
| --- | --- | --- |
| **Validation** | `useForm` submit/blur validation | **Zod AND any Standard Schema** — Valibot, ArkType (its callable schema included), modern Zod, `@pyreon/validate`'s `s`. A raw schema is routed through `standardSchemaToValidator`; errors land on the right field. |
| **Field introspection** | `feature.fields`, auto create-form `initialValues`, auto `useTable` columns | **Zod only.** `extractFields` reads Zod's `_def.shape` / `_zod.def.shape`. There is no cross-library shape-introspection standard, so a Valibot / ArkType schema yields **no** fields. |

The query hooks (`useList`, `useById`, `useSearch`, `useCreate`, `useUpdate`, `useDelete`) and `useStore` are **schema-agnostic** — they only touch `api` and the row type, so every validator works with them.

:::note
**Using Valibot / ArkType?** Validation works out of the box, but because field introspection is Zod-only you must supply what would otherwise be derived:

```ts
const users = defineFeature({
  name: 'users',
  schema: v.object({ name: v.pipe(v.string(), v.minLength(2)), email: v.pipe(v.string(), v.email()) }),
  api: '/api/users',
  initialValues: { name: '', email: '' }, // required — useForm() has no auto fields
})

users.useForm()      // validates via Valibot; fields come from initialValues
users.useList()      // works — schema-agnostic
```

Because `useTable` derives its columns from Zod introspection, a non-Zod-schema table has no auto columns — build it with `@pyreon/table`'s `useTable` directly (passing an explicit `ColumnDef[]`).

`defineFeature` emits a one-time dev warning if a non-Zod schema yields no fields and no `initialValues` was provided, so the confusing downstream `Field … does not exist` error never surprises you.
:::

## API Conventions

`api` is a base path. Each hook derives its endpoint URL from RESTful conventions:

| Hook        | Method   | URL              |
| ----------- | -------- | ---------------- |
| `useList`   | `GET`    | `/api/tasks`     |
| `useById`   | `GET`    | `/api/tasks/:id` |
| `useSearch` | `GET`    | `/api/tasks?q=…` |
| `useCreate` | `POST`   | `/api/tasks`     |
| `useUpdate` | `PUT`    | `/api/tasks/:id` |
| `useDelete` | `DELETE` | `/api/tasks/:id` |

`useForm` submits via `POST /api/tasks` in create mode and `PUT /api/tasks/:id` in edit mode. Responses are parsed as JSON; a `204 No Content` resolves to `undefined`. A non-2xx response throws an `Error` carrying `status` and (when the body has an `errors` field) an `errors` property.

The built-in fetcher sends `Content-Type: application/json` and JSON-stringifies the body for `POST` / `PUT`. To add auth headers or rewrite URLs, pass a custom `fetcher`:

```ts
const tasks = defineFeature({
  name: 'tasks',
  schema: taskSchema,
  api: '/api/tasks',
  fetcher: (url, init) =>
    fetch(url, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${getToken()}` },
    }),
})
```

## Query Hooks

### `useList`

Fetches a list of entities. Returns `@pyreon/query`'s [`UseQueryResult`](/docs/query) — every field is a reactive signal you call:

```tsx
function TaskList() {
  const { data, isLoading, isError, error, refetch } = tasks.useList()

  return () => (
    <div>
      {isLoading() && <p>Loading…</p>}
      {isError() && <p>Error: {error()?.message}</p>}
      <ul>
        <For each={() => data() ?? []} by={(t) => t.id}>
          {(task) => <li>{task.title}</li>}
        </For>
      </ul>
      <button onClick={() => refetch()}>Reload</button>
    </div>
  )
}
```

`UseQueryResult` exposes `result`, `data`, `error`, `status`, `isPending`, `isLoading`, `isFetching`, `isError`, `isSuccess`, and `refetch()`.

#### `ListOptions`

`useList` (and `useSearch`) accept a `ListOptions` object:

| Option      | Type                                              | Description                                                                       |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `params`    | `Record<string, string \| number \| boolean>`     | Extra query params appended to the URL.                                           |
| `page`      | `number \| Signal<number>`                        | Page number. When set, `page` + `pageSize` are appended to the query params.      |
| `pageSize`  | `number`                                          | Items per page. Defaults to `20` when `page` is provided.                         |
| `staleTime` | `number`                                          | Override the query's stale time.                                                  |
| `enabled`   | `boolean`                                         | Enable / disable the query.                                                       |

:::note
Pagination is **server-driven**. `useList` appends `page` and `pageSize` to the request URL and returns whatever the server sends as `data()` — there are no client-side `nextPage()` / `totalPages()` helpers. Pass a `Signal<number>` as `page` to refetch reactively when the page changes; the query key includes the params, so changing the page automatically refetches.
:::

```tsx
function PaginatedTasks() {
  const page = signal(1)
  const { data, isFetching } = tasks.useList({ page, pageSize: 25 })

  return () => (
    <div>
      <For each={() => data() ?? []} by={(t) => t.id}>
        {(task) => <li>{task.title}</li>}
      </For>
      <button onClick={() => page.update((p) => Math.max(1, p - 1))} disabled={page() <= 1}>
        Previous
      </button>
      <span>Page {page()}{isFetching() && ' …'}</span>
      <button onClick={() => page.update((p) => p + 1)}>Next</button>
    </div>
  )
}
```

Filter by passing `params`:

```tsx
const { data } = tasks.useList({ params: { status: 'todo', sort: 'dueDate' } })
// → GET /api/tasks?status=todo&sort=dueDate
```

### `useById`

Fetches a single entity by ID. The query is disabled when the id is `null` / `undefined`:

```tsx
function TaskDetail(props: { id: string }) {
  const { data, isLoading, error } = tasks.useById(props.id)

  return () => (
    <div>
      {isLoading() ? (
        <p>Loading…</p>
      ) : error() ? (
        <p>Error: {error()?.message}</p>
      ) : (
        <div>
          <h2>{data()?.title}</h2>
          <p>Status: {data()?.status}</p>
        </div>
      )}
    </div>
  )
}
```

:::warning
`useById(id)` takes a plain `string | number` — it is **not** reactive to a signal you pass in. To refetch when the id changes, mount the component under a keyed boundary (so a new id re-mounts the hook), or drive it from `useList` + the store. (`useSearch` is the reactive-input hook.)
:::

### `useSearch`

Reactive search keyed on a `Signal<string>`. The query is disabled while the term is empty, and the term is sent as the `q` query param:

```tsx
function TaskSearch() {
  const term = signal('')
  const { data, isFetching } = tasks.useSearch(term)

  return () => (
    <div>
      <input value={term()} onInput={(e) => term.set(e.currentTarget.value)} placeholder="Search…" />
      {isFetching() && <p>Searching…</p>}
      <For each={() => data() ?? []} by={(t) => t.id}>
        {(task) => <li>{task.title}</li>}
      </For>
    </div>
  )
}
```

`useSearch` reads the signal inside the query key, so every keystroke that mutates `term` refetches. It accepts a second `ListOptions` argument for extra `params` / `staleTime`.

:::tip
To debounce, derive a debounced signal with `useDebouncedValue` from `@pyreon/hooks` and pass it to `useSearch` — keep the input bound to the raw signal and feed the debounced one to the hook.
:::

## Mutations

The three mutation hooks return `@pyreon/query`'s [`UseMutationResult`](/docs/query): `mutate` (fire-and-forget), `mutateAsync` (promise), `isPending`, `isSuccess`, `isError`, `error`, `data`, and `reset`.

### `useCreate`

`POST`s to the API. On success it invalidates the list query so any `useList` / `useSearch` view refetches:

```tsx
function CreateButton() {
  const { mutate, isPending, error } = tasks.useCreate()

  return () => (
    <div>
      <button
        disabled={isPending()}
        onClick={() => mutate({ title: 'New task', status: 'todo' })}
      >
        {isPending() ? 'Creating…' : 'Create'}
      </button>
      {error() && <p>Failed: {error()?.message}</p>}
    </div>
  )
}
```

For try/catch, use `mutateAsync`:

```ts
const { mutateAsync } = tasks.useCreate()
try {
  const created = await mutateAsync({ title: 'New task', status: 'todo' })
} catch (err) {
  // handle failure
}
```

### `useUpdate`

`PUT`s to `/:id` with **optimistic cache updates**. The mutation variable is `{ id, data }`:

```tsx
function ToggleStatus(props: { task: Task }) {
  const { mutate } = tasks.useUpdate()

  const toggle = () =>
    mutate({
      id: props.task.id,
      data: { status: props.task.status === 'done' ? 'todo' : 'done' },
    })

  return () => <button onClick={toggle}>Toggle</button>
}
```

#### How the optimistic update works

Optimism is built in — there is no opt-out flag. On `mutate({ id, data })`:

1. `onMutate` cancels any in-flight `useById(id)` query and snapshots the current cached entity.
2. The cached entity at `[name, id]` is merged with `data` immediately, so the UI updates before the server responds.
3. If the request **fails**, `onError` restores the snapshot — the optimistic change is rolled back.
4. On **success**, both the list query and the `[name, id]` query are invalidated, so they refetch the server's authoritative value (including any server-computed fields).

### `useDelete`

`DELETE`s `/:id`. The mutation variable is the id directly. Invalidates the list on success:

```tsx
function DeleteButton(props: { id: string }) {
  const { mutate, isPending } = tasks.useDelete()
  return () => (
    <button disabled={isPending()} onClick={() => mutate(props.id)}>
      Delete
    </button>
  )
}
```

## Forms

`useForm` returns `@pyreon/form`'s [`FormState`](/docs/form) directly, pre-wired with schema validation (via `@pyreon/validation`), schema-derived initial values, and an API-submitting `onSubmit`. Spread `form.register(field)` onto inputs and bind `form.handleSubmit` to the `<form>`.

### Create mode (default)

```tsx
function CreateTask() {
  const form = tasks.useForm()

  return () => (
    <form onSubmit={form.handleSubmit}>
      <input {...form.register('title')} placeholder="Title" />

      <select {...form.register('status')}>
        <option value="todo">To Do</option>
        <option value="in-progress">In Progress</option>
        <option value="done">Done</option>
      </select>

      <span {...form.errorProps('title')}>{form.errors().title?.message}</span>

      <button type="submit" disabled={form.isSubmitting()}>Create</button>
    </form>
  )
}
```

On submit, create mode `POST`s the values to the API and invalidates the list query so a `useList` view shows the new item without a manual reload.

### Edit mode

Pass `mode: 'edit'` and an `id`. The form auto-fetches the entity by id (toggling `isSubmitting` while loading), populates the fields, and `PUT`s on submit:

```tsx
function EditTask(props: { id: string }) {
  const form = tasks.useForm({ mode: 'edit', id: props.id })

  return () => {
    if (form.isSubmitting()) return <p>Loading…</p>
    return (
      <form onSubmit={form.handleSubmit}>
        <input {...form.register('title')} />
        <select {...form.register('status')}>
          <option value="todo">To Do</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <button type="submit">Save</button>
      </form>
    )
  }
}
```

:::warning
There is no separate `isLoadingInitial` signal. In edit mode the form sets **`isSubmitting`** to `true` while the initial fetch is in flight, then back to `false` once the fields are populated. Gate your loading UI on `form.isSubmitting()`.
:::

The auto-fetch is unmount-safe: if the component unmounts before the `getById` promise settles (route nav, list re-render), the late resolution is dropped — no write to a disposed form.

### `FeatureFormOptions`

| Option          | Type                                | Description                                                              |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `mode`          | `'create' \| 'edit'`                | `'create'` (default) `POST`s; `'edit'` auto-fetches by `id` and `PUT`s.  |
| `id`            | `string \| number`                  | Required in edit mode — drives the auto-fetch and the `PUT /:id` URL.    |
| `initialValues` | `Partial<TValues>`                  | Merged on top of the schema-derived + feature-level defaults.            |
| `validateOn`    | `'blur' \| 'change' \| 'submit'`    | When to validate. Defaults to `'blur'`.                                  |
| `onSuccess`     | `(result: unknown) => void`         | Called after a successful create / update.                              |
| `onError`       | `(error: unknown) => void`          | Called when the submit throws (the error is re-thrown after).            |

### Create vs Edit

| Behavior          | `mode: 'create'`          | `mode: 'edit'`                          |
| ----------------- | ------------------------- | --------------------------------------- |
| Initial values    | Schema defaults + config  | Auto-fetched via `GET /:id`             |
| Submit method     | `POST /api/…`             | `PUT /api/…/:id`                        |
| Auto-fetch        | No                        | Yes (uses the built-in fetcher)         |
| Loading signal    | `isSubmitting` → `false`  | `isSubmitting` → `true` until fetched   |
| Invalidates       | list query                | list query + `[name, id]` query         |

## Tables

`useTable(data, options?)` infers columns from the schema and returns a configured `@pyreon/table` instance plus reactive sorting / filtering signals. **The data is the first argument** — an array or an accessor; the table does not fetch on its own. Pair it with `useList`:

```tsx
import { flexRender } from '@pyreon/table'

function TaskTable() {
  const { data } = tasks.useList()
  const { table, sorting, globalFilter } = tasks.useTable(() => data() ?? [], {
    columns: ['title', 'status', 'assignee'],
  })

  return () => (
    <div>
      <input
        value={globalFilter()}
        onInput={(e) => globalFilter.set(e.currentTarget.value)}
        placeholder="Filter…"
      />
      <table>
        <thead>
          <For each={() => table().getHeaderGroups()} by={(g) => g.id}>
            {(headerGroup) => (
              <tr>
                <For each={() => headerGroup.headers} by={(h) => h.id}>
                  {(header) => (
                    <th onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  )}
                </For>
              </tr>
            )}
          </For>
        </thead>
        <tbody>
          <For each={() => table().getRowModel().rows} by={(r) => r.id}>
            {(row) => (
              <tr>
                <For each={() => row.getVisibleCells()} by={(c) => c.id}>
                  {(cell) => <td>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}
```

`table` is a `Computed<Table<TValues>>` — **call it** (`table()`) to read the live TanStack Table instance. Core, sorted, and filtered row models are wired by default; pagination is enabled only when `pageSize` is set.

### `FeatureTableOptions`

| Option            | Type                                                       | Description                                                                 |
| ----------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `columns`         | `(keyof TValues & string)[]`                               | Subset of schema fields to show. Omit to show all fields.                   |
| `columnOverrides` | `Partial<Record<keyof TValues & string, Record<string, unknown>>>` | Per-column overrides (custom `header`, `cell` renderer, `size`, etc.). |
| `pageSize`        | `number`                                                   | Enables client-side pagination. Omitted → no pagination row model.          |

```ts
const { table } = tasks.useTable(() => data() ?? [], {
  columns: ['title', 'status'],
  columnOverrides: {
    status: { header: 'State', cell: (info) => <Badge value={info.getValue()} /> },
  },
  pageSize: 20,
})
```

### `FeatureTableResult`

| Property       | Type                            | Description                                                |
| -------------- | ------------------------------- | ---------------------------------------------------------- |
| `table`        | `Computed<Table<TValues>>`      | The reactive TanStack Table instance — call it to read.    |
| `sorting`      | `Signal<SortingState>`          | Sorting state. Bind to header click handlers.              |
| `globalFilter` | `Signal<string>`                | Global filter term. Bind to a search input.                |
| `columns`      | `FieldInfo[]`                   | The introspected metadata for the visible columns.         |

## Store

`useStore()` returns the `@pyreon/store` [`StoreApi`](/docs/store) wrapping the feature's reactive client-side cache. The state lives on **`storeApi.store`**:

```tsx
function TaskDashboard() {
  const { store } = tasks.useStore()

  return () => (
    <div>
      <p>{store.items().length} tasks cached</p>
      <p>Loading: {store.loading() ? 'Yes' : 'No'}</p>
      {store.selected() && (
        <div>
          <h3>Selected: {store.selected()?.title}</h3>
          <button onClick={store.clear}>Deselect</button>
        </div>
      )}
    </div>
  )
}
```

### `FeatureStore` (the `store` field)

| Member          | Type                       | Description                                              |
| --------------- | -------------------------- | -------------------------------------------------------- |
| `items`         | `Signal<TValues[]>`        | Cached list of entities.                                 |
| `selected`      | `Signal<TValues \| null>`  | Currently selected entity.                               |
| `loading`       | `Signal<boolean>`          | Loading state.                                           |
| `select(id)`    | `(id: string \| number) => void` | Select an item **by id** (looks up `items` by `.id`). |
| `clear()`       | `() => void`               | Clear the selection.                                     |

:::warning
`select` takes an **id**, not an item object — it finds the matching entry in `items` by its `id` field. The store is a singleton keyed by the feature `name`; calling `useStore()` from anywhere returns the same `StoreApi`. The `StoreApi` wrapper also gives you `patch`, `subscribe`, `reset`, and `dispose` (see [`@pyreon/store`](/docs/store)).
:::

## Schema Introspection

`defineFeature` introspects the schema at definition time (the result is on `feature.fields`). The same helpers are exported so you can build custom form / table renderers.

### `extractFields`

Returns a `FieldInfo[]` describing each field. Duck-types Zod v3 (`._def.shape`), Zod v4 (`._zod.def.shape`), and a direct `.shape` — without importing Zod:

```ts
import { extractFields } from '@pyreon/feature'
import { z } from 'zod'

const fields = extractFields(
  z.object({
    title: z.string(),
    views: z.number().optional(),
    status: z.enum(['draft', 'published']),
  }),
)
// [
//   { name: 'title',  type: 'string', optional: false, label: 'Title' },
//   { name: 'views',  type: 'number', optional: true,  label: 'Views' },
//   { name: 'status', type: 'enum',   optional: false, label: 'Status', enumValues: ['draft', 'published'] },
// ]
```

### `FieldInfo`

| Property      | Type                          | Description                                                                                             |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `name`        | `string`                      | Field key from the schema.                                                                              |
| `type`        | `FieldType`                   | `'string'`, `'number'`, `'boolean'`, `'date'`, `'enum'`, `'array'`, `'object'`, `'reference'`, `'unknown'`. |
| `optional`    | `boolean`                     | Whether the field is wrapped in `.optional()` / `.nullable()`.                                          |
| `label`       | `string`                      | Human-readable label from the field name (`firstName` → `First Name`, `created_at` → `Created At`).     |
| `enumValues`  | `(string \| number)[]` *(opt)*| Allowed values for `enum` fields.                                                                       |
| `referenceTo` | `string` *(opt)*              | Name of the referenced feature, for `reference()` fields.                                               |

:::warning
The field is named `optional` (not `required`), and references carry `referenceTo` (a feature-name string), not a `reference` object. There is no `defaultValue` on `FieldInfo` — Zod-level `.default()` modifiers flow through Zod's own parse, not through introspection. Labels come from the field name via humanize-case, never from a docs comment.
:::

### `defaultInitialValues`

Generates create-mode seed values from extracted `FieldInfo[]` — **takes the fields, not a schema**:

```ts
import { extractFields, defaultInitialValues } from '@pyreon/feature'

const fields = extractFields(taskSchema)
const initial = defaultInitialValues(fields)
// strings → '', numbers → 0, booleans → false,
// enums → first value (or ''), dates → '', anything else → ''
```

This is what `useForm()` uses internally to seed an empty create form. For edit mode the existing record (auto-fetched by id) supplies the values.

## References

`reference(feature)` marks a schema field as a foreign key to another feature. It returns a Zod-compatible validator (validates as `string | number`) carrying a `_featureName` so introspection can surface it. Use it **inside** your validation schema:

```ts
import { defineFeature, reference } from '@pyreon/feature'
import { z } from 'zod'

const users = defineFeature({
  name: 'users',
  schema: z.object({ name: z.string(), email: z.string().email() }),
  api: '/api/users',
})

const tasks = defineFeature({
  name: 'tasks',
  schema: z.object({
    title: z.string(),
    status: z.enum(['todo', 'in-progress', 'done']),
    assigneeId: reference(users),       // FK to the users feature
    categoryId: reference({ name: 'categories' }), // or a bare { name }
  }),
  api: '/api/tasks',
})
```

A `reference()` field shows up in `extractFields` as `{ type: 'reference', referenceTo: 'users' }`, letting custom form / table renderers special-case it (e.g. a select dropdown populated from the related feature's `useList`). Resolve the related entity with the other feature's `useById`:

```tsx
function TaskWithAssignee(props: { task: Task }) {
  const { data: assignee } = users.useById(props.task.assigneeId)
  return () => <p>Assigned to: {assignee()?.name ?? '…'}</p>
}
```

:::warning
- Pass the **Feature object** or a `{ name }` object — `reference('users')` (a bare string) does not typecheck.
- The referenced feature must **also** be defined via `defineFeature`, and both sides share the same `QueryClient` for the FK to resolve end-to-end.
- `reference()` only **marks** the field. It does not enforce existence at the foreign side or cascade deletes — that's your server's / consumer's concern.
:::

### `isReference`

Type-guard for a value produced by `reference()`. References are symbol-tagged plain objects, so use this — never `instanceof`:

```ts
import { isReference } from '@pyreon/feature'

for (const [key, value] of Object.entries(rawSchemaShape)) {
  if (isReference(value)) {
    console.log(`${key} → ${value._featureName}`)
  }
}
```

## Composed Packages

`@pyreon/feature` is a composition layer. Reach for the underlying packages directly when you need more control:

### `@pyreon/query`

Every data hook is a thin `@pyreon/query` wrapper. Use the feature's `queryKey` factory for custom queries that share the cache namespace:

```ts
import { useQuery } from '@pyreon/query'

const overdue = useQuery(() => ({
  queryKey: [...tasks.queryKey(), 'overdue'],
  queryFn: () => fetch('/api/tasks/overdue').then((r) => r.json()),
}))
```

### `@pyreon/form`

`useForm` wraps `@pyreon/form`'s `useForm` with schema-derived validation + initial values. The returned object IS a `FormState` — `register`, `handleSubmit`, `values`, `errors`, `setFieldValue`, `reset`, `trigger`, `errorProps`, `labelProps`, and friends are all available.

### `@pyreon/validation`

A Zod schema (it exposes `safeParseAsync`) is wrapped with `@pyreon/validation`'s `zodSchema()` adapter. Any other **Standard Schema** — Valibot, ArkType, `@pyreon/validate`'s `s`, or modern Zod — is routed through `standardSchemaToValidator` (detecting the `~standard` contract, callable schemas like ArkType included). Either way, submit/blur validation produces a per-field error record the form surfaces on the right field. Pass `validate` in the config to override with a custom validator.

### `@pyreon/table`

`useTable` wraps `@pyreon/table`'s `useTable` with schema-inferred `ColumnDef`s and wires the core / sorted / filtered (and optional paginated) row models. Use `flexRender` to render headers and cells.

### `@pyreon/store`

`useStore` is built on `@pyreon/store`'s `defineStore`, keyed by the feature `name` — so the cache is a singleton. Compose it with other stores:

```ts
import { defineStore, computed } from '@pyreon/store'

const useDashboard = defineStore('dashboard', () => {
  const taskStore = tasks.useStore().store
  const assignedCount = computed(() => taskStore.items().filter((t) => t.assigneeId != null).length)
  return { assignedCount }
})
```

## API Reference

### `defineFeature(config)`

`<TValues>(config: FeatureConfig<TValues>) => Feature<TValues>` — see [`FeatureConfig`](#featureconfig) and [Return Value](#return-value).

### Generated hooks

| Hook                                     | Returns                                                  | Notes                                                  |
| ---------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| `useList(opts?)`                         | `UseQueryResult<TValues[]>`                              | `GET /api`. `opts`: `ListOptions`.                     |
| `useById(id)`                            | `UseQueryResult<TValues>`                                | `GET /api/:id`. Disabled when `id` is nullish.         |
| `useSearch(term, opts?)`                 | `UseQueryResult<TValues[]>`                              | `GET /api?q=…`. `term` is a `Signal<string>`.          |
| `useCreate()`                            | `UseMutationResult<TValues, _, Partial<TValues>>`        | `POST /api`. Invalidates list on success.              |
| `useUpdate()`                            | `UseMutationResult<TValues, _, { id, data }>`            | `PUT /api/:id`. Optimistic; rolls back on error.       |
| `useDelete()`                            | `UseMutationResult<void, _, string \| number>`           | `DELETE /api/:id`. Invalidates list on success.        |
| `useForm(opts?)`                         | `FormState<TValues>`                                     | Create / edit form. `opts`: `FeatureFormOptions`.      |
| `useTable(data, opts?)`                  | `FeatureTableResult<TValues>`                            | `data` is an array or accessor. `opts`: `FeatureTableOptions`. |
| `useStore()`                             | `StoreApi<FeatureStore<TValues>>`                        | Singleton cache. State on `.store`.                    |

### Standalone exports

| Export                       | Signature                                                | Description                                           |
| ---------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `reference(feature)`         | `(feature: { name: string }) => ReferenceSchema`         | Mark a schema field as a foreign key.                 |
| `isReference(value)`         | `(value: unknown) => value is ReferenceSchema`           | Type-guard for `reference()` results.                 |
| `extractFields(schema)`      | `(schema: unknown) => FieldInfo[]`                       | Introspect a schema's fields.                         |
| `defaultInitialValues(fields)` | `(fields: FieldInfo[]) => Record<string, unknown>`     | Seed create-mode values from extracted fields.        |

### Exported types

`Feature`, `FeatureConfig`, `FeatureFormOptions`, `FeatureStore`, `FeatureTableOptions`, `FeatureTableResult`, `InferSchemaValues`, `ListOptions`, `FieldInfo`, `FieldType`, `ReferenceSchema`.

## Why

A typical CRUD feature needs list queries, detail queries, search, create / update / delete mutations, optimistic updates, a validated form for both create and edit, table columns, and a client cache — easily ~200 lines of repetitive wiring per entity.

`defineFeature` replaces that with roughly ten lines. You declare the schema and the API base path; the package generates every hook, infers form fields and table columns from the schema, applies optimistic updates, and keeps the client cache in sync.

This is especially valuable in AI-assisted workflows: instead of reviewing 200 lines of boilerplate line by line, an agent produces a single `defineFeature` call — declarative, auditable at a glance, and consistent across every feature in the app.
