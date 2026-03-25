# @pyreon/table

Pyreon adapter for [TanStack Table](https://tanstack.com/table). Wraps TanStack Table's core with reactive signal-based state management.

## Installation

```bash
bun add @pyreon/table @tanstack/table-core
```

## Quick Start

```tsx
import { useTable, createColumnHelper, getCoreRowModel, flexRender } from "@pyreon/table"

type Person = { name: string; age: number }

const columnHelper = createColumnHelper<Person>()

const columns = [
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.accessor("age", { header: "Age" }),
]

const data: Person[] = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
]

function PeopleTable() {
  const table = useTable(() => ({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  }))

  return (
    <table>
      <thead>
        {table().getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table().getRowModel().rows.map(row => (
          <tr key={row.id}>
            {row.getVisibleCells().map(cell => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

## API

### `useTable(options)`

Create a reactive table instance.

**Parameters:**

- `options: () => TableOptions<TData>` — a function returning TanStack Table options. Passed as a function so reactive signals can be read inside, and the table updates automatically when they change.

**Returns:** `Computed<Table<TData>>` — a reactive computed signal containing the table instance. Read it with `table()` to access the TanStack Table API.

```tsx
const table = useTable(() => ({
  data: items(),  // reactive signal
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
}))

// Access in JSX:
<thead>
  {table().getHeaderGroups().map(hg => (
    <tr key={hg.id}>
      {hg.headers.map(h => (
        <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
      ))}
    </tr>
  ))}
</thead>
```

### Reactive Options

Options are re-evaluated when signals inside the function change:

```ts
const sorting = signal<SortingState>([])
const filtering = signal("")

const table = useTable(() => ({
  data: items(),
  columns,
  state: {
    sorting: sorting(),
    globalFilter: filtering(),
  },
  onSortingChange: (updater) => {
    sorting.set(typeof updater === "function" ? updater(sorting()) : updater)
  },
  onGlobalFilterChange: (updater) => {
    filtering.set(typeof updater === "function" ? updater(filtering()) : updater)
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
}))
```

### `flexRender(component, props)`

Re-exported from TanStack Table for rendering header/cell content:

```ts
flexRender(header.column.columnDef.header, header.getContext())
flexRender(cell.column.columnDef.cell, cell.getContext())
```

## State Management

`useTable` manages internal table state via signals. When you provide `onStateChange` handlers (like `onSortingChange`, `onFilterChange`), the table calls them with either a new value or an updater function:

```ts
const pagination = signal({ pageIndex: 0, pageSize: 10 })

const table = useTable(() => ({
  data: items(),
  columns,
  state: { pagination: pagination() },
  onPaginationChange: (updater) => {
    pagination.set(
      typeof updater === "function" ? updater(pagination()) : updater
    )
  },
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
}))
```

## Re-exports

All exports from `@tanstack/table-core` are re-exported — column helpers, row models, utilities, and types are all available from `@pyreon/table`:

```ts
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  // ... all TanStack Table Core exports
} from "@pyreon/table"
```

## Types

| Type | Description |
| --- | --- |
| `UseTableOptions<TData>` | `() => TableOptions<TData>` — reactive options function |

All TanStack Table types are re-exported.

## Gotchas

**The table is a computed signal.** Access it with `table()`, not `table`. Reading it inside effects or templates tracks reactive dependencies automatically.

**State handlers receive updater functions.** Always handle both direct values and updater functions in `onChange` callbacks: `typeof updater === "function" ? updater(prev) : updater`.
