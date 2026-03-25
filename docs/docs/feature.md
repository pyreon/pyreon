---
title: Feature
description: Schema-driven CRUD primitives with auto-generated hooks for lists, forms, tables, and stores.
---

`@pyreon/feature` eliminates CRUD boilerplate by deriving an entire feature's data layer from a single schema definition. Define your entity once with `defineFeature`, and get reactive hooks for listing, searching, creating, updating, and deleting records -- all backed by `@pyreon/query` for server state and `@pyreon/store` for client-side cache.

<PackageBadge name="@pyreon/feature" href="/docs/feature" />

## Installation

::: code-group
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

## Quick Start

Define a feature with a schema and API configuration, then use the auto-generated hooks in your components:

```ts
import { defineFeature } from '@pyreon/feature'
import { z } from 'zod'

const taskFeature = defineFeature({
  name: 'task',
  schema: z.object({
    id: z.string(),
    title: z.string().min(1),
    status: z.enum(['todo', 'in-progress', 'done']),
    assignee: z.string().optional(),
    dueDate: z.string().optional(),
  }),
  api: {
    baseUrl: '/api/tasks',
  },
})
```

Use the generated hooks in a component:

```tsx
import { defineComponent } from '@pyreon/core'

const TaskList = defineComponent(() => {
  const { items, isLoading } = taskFeature.useList()

  return () => (
    <div>
      {isLoading() ? (
        <p>Loading tasks...</p>
      ) : (
        <ul>
          {items().map(task => (
            <li key={task.id}>
              {task.title} — {task.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
```

Add a creation form with a single hook:

```tsx
const CreateTask = defineComponent(() => {
  const { form, handleSubmit, isSubmitting } = taskFeature.useForm({ mode: 'create' })

  return () => (
    <form onSubmit={handleSubmit}>
      <input {...form.field('title').register()} placeholder="Task title" />
      <select {...form.field('status').register()}>
        <option value="todo">To Do</option>
        <option value="in-progress">In Progress</option>
        <option value="done">Done</option>
      </select>
      <button type="submit" disabled={isSubmitting()}>Create</button>
    </form>
  )
})
```

## `defineFeature` Configuration

The `defineFeature` function accepts a configuration object that drives all auto-generated hooks:

```ts
const feature = defineFeature({
  // Required: unique name used as query key prefix and store ID
  name: 'task',

  // Required: Zod schema describing the entity shape (including `id`)
  schema: z.object({
    id: z.string(),
    title: z.string().min(1),
    status: z.enum(['todo', 'in-progress', 'done']),
    assignee: z.string().optional(),
  }),

  // Required: API configuration
  api: {
    baseUrl: '/api/tasks',

    // Optional: custom fetch headers
    headers: () => ({
      Authorization: `Bearer ${getToken()}`,
    }),

    // Optional: override individual endpoints
    endpoints: {
      list:   (params) => ({ url: '/api/tasks', method: 'GET', params }),
      byId:   (id) => ({ url: `/api/tasks/${id}`, method: 'GET' }),
      create: (data) => ({ url: '/api/tasks', method: 'POST', body: data }),
      update: (id, data) => ({ url: `/api/tasks/${id}`, method: 'PATCH', body: data }),
      delete: (id) => ({ url: `/api/tasks/${id}`, method: 'DELETE' }),
      search: (query) => ({ url: '/api/tasks/search', method: 'GET', params: { q: query } }),
    },
  },

  // Optional: default page size for pagination
  pageSize: 20,
})
```

### Return Value

`defineFeature` returns an object containing all generated hooks and utilities:

| Property | Type | Description |
|----------|------|-------------|
| `useList` | `(opts?) => ListResult` | Fetch and display a paginated list of entities |
| `useById` | `(id) => ByIdResult` | Fetch a single entity by ID |
| `useSearch` | `(opts?) => SearchResult` | Search entities with a reactive query signal |
| `useCreate` | `() => CreateResult` | Mutation hook for creating entities |
| `useUpdate` | `(opts?) => UpdateResult` | Mutation hook with optimistic updates |
| `useDelete` | `() => DeleteResult` | Mutation hook for deleting entities |
| `useForm` | `(opts) => FormResult` | Form hook with create/edit modes |
| `useTable` | `(opts?) => TableResult` | Table hook with schema-inferred columns |
| `useStore` | `() => StoreResult` | Reactive client-side cache |
| `schema` | `ZodSchema` | The original schema passed to `defineFeature` |
| `name` | `string` | The feature name |

## Hooks

### `useList`

Fetches a paginated list of entities. Returns reactive signals for the items, loading state, and pagination controls:

```tsx
const TaskList = defineComponent(() => {
  const { items, isLoading, error, page, pageSize, totalPages, nextPage, prevPage } =
    taskFeature.useList({ pageSize: 10 })

  return () => (
    <div>
      {isLoading() && <p>Loading...</p>}
      {error() && <p>Error: {error().message}</p>}

      <ul>
        {items().map(task => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>

      <div>
        <button onClick={prevPage} disabled={page() === 1}>Previous</button>
        <span>Page {page()} of {totalPages()}</span>
        <button onClick={nextPage} disabled={page() === totalPages()}>Next</button>
      </div>
    </div>
  )
})
```

### `useById`

Fetches a single entity by ID. The ID can be a reactive signal:

```tsx
const TaskDetail = defineComponent((props: { id: string }) => {
  const { data, isLoading, error } = taskFeature.useById(props.id)

  return () => (
    <div>
      {isLoading() ? (
        <p>Loading...</p>
      ) : error() ? (
        <p>Error: {error().message}</p>
      ) : (
        <div>
          <h2>{data().title}</h2>
          <p>Status: {data().status}</p>
          <p>Assignee: {data().assignee ?? 'Unassigned'}</p>
        </div>
      )}
    </div>
  )
})
```

### `useSearch`

Provides a reactive search query signal with debounced fetching:

```tsx
const TaskSearch = defineComponent(() => {
  const { query, results, isSearching } = taskFeature.useSearch({ debounceMs: 300 })

  return () => (
    <div>
      <input
        value={query()}
        onInput={(e) => query.set(e.target.value)}
        placeholder="Search tasks..."
      />

      {isSearching() && <p>Searching...</p>}

      <ul>
        {results().map(task => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
    </div>
  )
})
```

### `useCreate`

Mutation hook for creating new entities. Automatically invalidates the list query on success:

```tsx
const { mutate, isSubmitting, error } = taskFeature.useCreate()

await mutate({
  title: 'New Task',
  status: 'todo',
})
```

### `useUpdate`

Mutation hook for updating entities with optimistic update support:

```tsx
const { mutate, isSubmitting, error } = taskFeature.useUpdate()

await mutate({
  id: 'task-1',
  title: 'Updated Title',
})
```

See the [Optimistic Updates](#optimistic-updates) section for details on how updates are applied immediately.

### `useDelete`

Mutation hook for deleting entities. Removes the entity from the cache on success:

```tsx
const { mutate, isSubmitting } = taskFeature.useDelete()

await mutate('task-1')
```

## Edit Form

`useForm` supports two modes: `create` and `edit`. In edit mode, the form auto-fetches the entity by ID and populates the fields:

```tsx
const EditTask = defineComponent((props: { id: string }) => {
  const { form, handleSubmit, isSubmitting, isLoadingInitial } = taskFeature.useForm({
    mode: 'edit',
    id: props.id,
  })

  return () => {
    if (isLoadingInitial()) return <p>Loading task...</p>

    return (
      <form onSubmit={handleSubmit}>
        <input {...form.field('title').register()} />

        <select {...form.field('status').register()}>
          <option value="todo">To Do</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
        </select>

        <input {...form.field('assignee').register()} placeholder="Assignee" />

        <button type="submit" disabled={isSubmitting()}>
          Save Changes
        </button>
      </form>
    )
  }
})
```

When the form is in `edit` mode:

1. `useById` is called internally with the provided `id`.
2. Once the data arrives, the form's `initialValues` are populated from the response.
3. `isLoadingInitial()` is `true` until the fetch completes.
4. On submit, `useUpdate` is called instead of `useCreate`.

### Create vs Edit Summary

| Behavior | `mode: 'create'` | `mode: 'edit'` |
|----------|-------------------|----------------|
| Initial values | From schema defaults | Auto-fetched by ID |
| Submit action | `useCreate` | `useUpdate` |
| Auto-fetch | No | Yes (`useById`) |
| `isLoadingInitial` | Always `false` | `true` until fetched |

## Pagination

Every `useList` call returns pagination signals and controls. The page signal is reactive -- changing it automatically refetches:

```tsx
const PaginatedTasks = defineComponent(() => {
  const { items, page, pageSize, totalPages, nextPage, prevPage, goToPage } =
    taskFeature.useList({ pageSize: 25 })

  return () => (
    <div>
      <ul>
        {items().map(task => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>

      <nav>
        <button onClick={prevPage} disabled={page() <= 1}>
          Previous
        </button>

        {Array.from({ length: totalPages() }, (_, i) => (
          <button
            key={i + 1}
            onClick={() => goToPage(i + 1)}
            class={page() === i + 1 ? 'active' : ''}
          >
            {i + 1}
          </button>
        ))}

        <button onClick={nextPage} disabled={page() >= totalPages()}>
          Next
        </button>
      </nav>

      <p>{pageSize()} items per page</p>
    </div>
  )
})
```

| Signal / Method | Type | Description |
|-----------------|------|-------------|
| `page` | `Signal<number>` | Current page number (1-indexed) |
| `pageSize` | `Signal<number>` | Items per page |
| `totalPages` | `Computed<number>` | Total number of pages |
| `nextPage()` | `() => void` | Increment page by 1 |
| `prevPage()` | `() => void` | Decrement page by 1 |
| `goToPage(n)` | `(n: number) => void` | Jump to a specific page |

## Optimistic Updates

`useUpdate` applies changes to the local cache immediately, before the server responds. If the server request fails, the change is rolled back:

```tsx
const TaskToggle = defineComponent((props: { task: Task }) => {
  const { mutate } = taskFeature.useUpdate({ optimistic: true })

  const toggle = async () => {
    const nextStatus = props.task.status === 'done' ? 'todo' : 'done'

    await mutate({
      id: props.task.id,
      status: nextStatus,
    })
    // UI updates instantly. If the request fails, it reverts.
  }

  return () => (
    <button onClick={toggle}>
      {props.task.status === 'done' ? 'Reopen' : 'Complete'}
    </button>
  )
})
```

### How Optimistic Updates Work

1. The mutation payload is merged into the cached entity immediately via `useStore`.
2. The list query cache is updated to reflect the change.
3. The server request is sent in the background.
4. On success, the cache is replaced with the server's response (which may include server-computed fields).
5. On failure, the cache is rolled back to the previous state and the `error` signal is set.

Optimistic updates are enabled by default for `useUpdate`. Pass `&#123; optimistic: false &#125;` to disable them:

```ts
const { mutate } = taskFeature.useUpdate({ optimistic: false })
```

## References

Use `reference()` to declare foreign key relationships between features. This enables automatic resolution and nested data fetching:

```ts
import { defineFeature, reference } from '@pyreon/feature'

const userFeature = defineFeature({
  name: 'user',
  schema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
  api: { baseUrl: '/api/users' },
})

const taskFeature = defineFeature({
  name: 'task',
  schema: z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(['todo', 'in-progress', 'done']),
    assigneeId: reference(userFeature),
  }),
  api: { baseUrl: '/api/tasks' },
})
```

When a field uses `reference()`, the feature knows how to resolve the related entity:

```tsx
const TaskWithAssignee = defineComponent((props: { task: Task }) => {
  const { data: assignee } = userFeature.useById(props.task.assigneeId)

  return () => (
    <div>
      <p>{props.task.title}</p>
      <p>Assigned to: {assignee()?.name ?? 'Loading...'}</p>
    </div>
  )
})
```

`reference()` also provides metadata for table columns and form fields -- a referenced field renders as a select/autocomplete by default, populated from the related feature's `useList`.

## Schema Introspection

`@pyreon/feature` can introspect the schema to extract field metadata. This powers automatic table column generation, form field rendering, and default value computation.

### `extractFields`

Returns an array of `FieldInfo` objects describing each field in the schema:

```ts
import { extractFields } from '@pyreon/feature'

const fields = extractFields(taskFeature.schema)

// [
//   { name: 'id',       type: 'string',  required: true,  enumValues: undefined },
//   { name: 'title',    type: 'string',  required: true,  enumValues: undefined },
//   { name: 'status',   type: 'enum',    required: true,  enumValues: ['todo', 'in-progress', 'done'] },
//   { name: 'assignee', type: 'string',  required: false, enumValues: undefined },
//   { name: 'dueDate',  type: 'string',  required: false, enumValues: undefined },
// ]
```

### `FieldInfo`

The shape returned by `extractFields` for each field:

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Field name from the schema |
| `type` | `string` | Inferred type: `'string'`, `'number'`, `'boolean'`, `'enum'`, `'date'`, `'array'`, `'object'` |
| `required` | `boolean` | Whether the field is required |
| `enumValues` | `string[] \| undefined` | Possible values for enum fields |
| `defaultValue` | `unknown \| undefined` | Default value if defined in the schema |
| `reference` | `FeatureRef \| undefined` | Reference metadata if the field uses `reference()` |

### `defaultInitialValues`

Computes initial form values from the schema, using schema defaults and type-appropriate fallbacks:

```ts
import { defaultInitialValues } from '@pyreon/feature'

const initial = defaultInitialValues(taskFeature.schema)
// { id: '', title: '', status: 'todo', assignee: undefined, dueDate: undefined }
```

This is what `useForm(&#123; mode: 'create' &#125;)` uses internally to populate the form's initial state.

## `useTable`

`useTable` generates table columns from the schema and wires up data fetching. It returns a configured `@pyreon/table` instance:

```tsx
const TaskTable = defineComponent(() => {
  const { table, isLoading } = taskFeature.useTable({
    columns: {
      // Override specific columns
      title: { header: 'Task Name', size: 300 },
      status: {
        header: 'Status',
        cell: (info) => <span class={`badge-${info.getValue()}`}>{info.getValue()}</span>,
      },
      // Exclude columns
      id: false,
    },
  })

  return () => (
    <div>
      {isLoading() ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
})
```

## `useStore`

`useStore` provides direct access to the feature's reactive client-side cache. It exposes signals for the entity list, selected item, and loading states:

```tsx
const TaskDashboard = defineComponent(() => {
  const { items, selected, loading, select, clear } = taskFeature.useStore()

  return () => (
    <div>
      <p>{items().length} tasks loaded</p>
      <p>Loading: {loading() ? 'Yes' : 'No'}</p>

      {selected() && (
        <div>
          <h3>Selected: {selected().title}</h3>
          <button onClick={clear}>Deselect</button>
        </div>
      )}
    </div>
  )
})
```

| Signal / Method | Type | Description |
|-----------------|------|-------------|
| `items` | `Signal<T[]>` | All cached entities |
| `selected` | `Signal<T \| null>` | Currently selected entity |
| `loading` | `Signal<boolean>` | Whether any query is in flight |
| `select(item)` | `(item: T) => void` | Set the selected entity |
| `clear()` | `() => void` | Clear the selection |

## Integration with Other Packages

`@pyreon/feature` is a composition layer that builds on top of several Pyreon fundamentals packages. You can use them directly when you need more control.

### With `@pyreon/query`

All data fetching hooks (`useList`, `useById`, `useSearch`, `useCreate`, `useUpdate`, `useDelete`) are thin wrappers around `@pyreon/query`. You can access the underlying query options:

```ts
import { useQuery } from '@pyreon/query'

// Use the feature's query key factory for custom queries
const customQuery = useQuery({
  queryKey: [taskFeature.name, 'custom', { status: 'overdue' }],
  queryFn: () => fetch('/api/tasks/overdue').then(r => r.json()),
})
```

### With `@pyreon/form`

`useForm` wraps `@pyreon/form`'s `useForm` with schema-derived validation and automatic initial values. You can pass any `@pyreon/form` option through:

```ts
const { form } = taskFeature.useForm({
  mode: 'create',
  validateOn: 'blur',
  debounceMs: 200,
})
```

### With `@pyreon/table`

`useTable` wraps `@pyreon/table`'s `useTable` with schema-inferred column definitions. Pass additional TanStack Table options through:

```ts
const { table } = taskFeature.useTable({
  enableSorting: true,
  enableFiltering: true,
  manualPagination: true,
})
```

### With `@pyreon/validation`

Schema validation uses `@pyreon/validation` adapters internally. The schema passed to `defineFeature` is automatically wrapped with the appropriate adapter (Zod, Valibot, or ArkType):

```ts
import { z } from 'zod'

// Zod schemas work out of the box
const feature = defineFeature({
  name: 'task',
  schema: z.object({ /* ... */ }),
  api: { baseUrl: '/api/tasks' },
})
```

### With `@pyreon/store`

The feature's `useStore` is built on `@pyreon/store`'s `defineStore`. You can compose it with other stores:

```ts
import { defineStore, signal, computed } from '@pyreon/store'

const useDashboard = defineStore('dashboard', () => {
  const tasks = taskFeature.useStore()
  const users = userFeature.useStore()

  const assignedTaskCount = computed(() =>
    tasks.items().filter(t => t.assigneeId != null).length
  )

  return { tasks, users, assignedTaskCount }
})
```

## Why

A typical CRUD feature in a modern frontend requires list queries, detail queries, search, create/update/delete mutations, forms with validation, table columns, pagination, optimistic updates, and cache management. Written by hand, each feature requires approximately 200 lines of repetitive wiring code.

`defineFeature` replaces that with roughly 10 lines. You declare the schema and the API base URL. The package generates every hook, infers form fields and table columns from the schema, handles optimistic updates, manages pagination signals, and keeps the client-side cache in sync.

This is especially valuable in AI-assisted development workflows. Instead of generating 200 lines of boilerplate that must be reviewed line by line, an LLM produces a single `defineFeature` call. The generated code is declarative, auditable at a glance, and guaranteed to follow consistent patterns across every feature in your application.
