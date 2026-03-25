# @pyreon/table

Pyreon adapter for TanStack Table. Reactive signal-driven table state with `flexRender` for column templates.

## Install

```bash
bun add @pyreon/table @tanstack/table-core
```

## Quick Start

```tsx
import { signal } from "@pyreon/reactivity"
import {
  useTable, flexRender, createColumnHelper,
  getCoreRowModel, getSortedRowModel,
} from "@pyreon/table"

type Person = { name: string; age: number }

const columnHelper = createColumnHelper<Person>()
const columns = [
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.accessor("age", { header: "Age" }),
]

function UserTable() {
  const data = signal<Person[]>([
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ])

  const table = useTable(() => ({
    data: data(),
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  }))

  return () => (
    <table>
      <thead>
        {table().getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((header) => (
              <th key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table().getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
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

Create a reactive TanStack Table instance. Options are passed as a function so reactive signals (data, columns, sorting state) can be read inside, and the table updates automatically when they change.

| Parameter | Type | Description |
| --- | --- | --- |
| `options` | `() => TableOptions<TData>` | Function returning TanStack Table options |

**Returns:** `Computed<Table<TData>>` — a read-only computed signal holding the table instance.

The adapter handles internal state synchronization. When the table state changes (e.g. sorting, pagination), a version counter is bumped so the computed signal re-notifies consumers.

```ts
const sorting = signal<SortingState>([])
const table = useTable(() => ({
  data: data(),
  columns,
  state: { sorting: sorting() },
  onSortingChange: (updater) => {
    sorting.set(typeof updater === "function" ? updater(sorting.peek()) : updater)
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
}))
```

### `flexRender(component, props)`

Render a TanStack Table column definition template. Handles strings, numbers, component functions, and VNodes.

| Parameter | Type | Description |
| --- | --- | --- |
| `component` | `Function \| string \| number \| VNode \| null` | Column def template (header, cell, or footer) |
| `props` | `TValue` | Context object from `getContext()` |

**Returns:** `unknown` (string, VNode, or null)

```ts
// In a header cell:
flexRender(header.column.columnDef.header, header.getContext())

// In a data cell:
flexRender(cell.column.columnDef.cell, cell.getContext())

// In a footer cell:
flexRender(footer.column.columnDef.footer, footer.getContext())
```

## Patterns

### Controlled State

Manage table state externally with signals for full control.

```ts
const sorting = signal<SortingState>([])
const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 10 })

const table = useTable(() => ({
  data: data(),
  columns,
  state: {
    sorting: sorting(),
    pagination: pagination(),
  },
  onSortingChange: (u) => sorting.set(typeof u === "function" ? u(sorting.peek()) : u),
  onPaginationChange: (u) => pagination.set(typeof u === "function" ? u(pagination.peek()) : u),
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getPaginatedRowModel: getPaginatedRowModel(),
}))
```

### Custom Cell Renderers

Use functions in column definitions to render custom content.

```tsx
const columns = [
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => <strong>{info.getValue()}</strong>,
  }),
  columnHelper.accessor("age", {
    header: "Age",
    cell: (info) => `${info.getValue()} years`,
  }),
]
```

## Re-exports from `@tanstack/table-core`

Everything from `@tanstack/table-core` is re-exported. This includes all utilities, types, and built-in row model functions:

`createColumnHelper`, `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`, `getPaginatedRowModel`, `getGroupedRowModel`, `getExpandedRowModel`, `getFacetedRowModel`, `getFacetedMinMaxValues`, `getFacetedUniqueValues`, `Table`, `ColumnDef`, `SortingState`, `PaginationState`, `RowData`, and more.

## Gotchas

- `useTable` returns a `Computed<Table>` — you must call `table()` to access the table instance. This ensures reactive tracking.
- Options must be a function `() => opts`, not a plain object. Reading signals inside the function auto-tracks dependencies.
- The table instance is created once and mutated in place. A version counter forces the computed to re-notify even though the reference is the same.
- The effect that syncs options is automatically disposed on component unmount.
