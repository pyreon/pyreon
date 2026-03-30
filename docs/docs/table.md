---
title: Table
description: Reactive TanStack Table adapter with fine-grained signal integration.
---

`@pyreon/table` is the Pyreon adapter for [TanStack Table](https://tanstack.com/table). It wraps TanStack Table's core with a reactive `useTable` hook that returns a signal-based table instance, and provides `flexRender` for rendering column definitions in Pyreon templates.

<PackageBadge name="@pyreon/table" href="/docs/table" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/table
```

```bash [bun]
bun add @pyreon/table
```

```bash [pnpm]
pnpm add @pyreon/table
```

```bash [yarn]
yarn add @pyreon/table
```

:::

TanStack Table core is included as a dependency -- all exports from `@tanstack/table-core` are re-exported for convenience.

## Basic Usage

Use `useTable` to create a reactive table instance. Options are passed as a function so reactive signals (e.g., data, columns, sorting state) can be read inside and the table updates automatically.

```tsx
import { defineComponent } from "@pyreon/core";
import { signal } from "@pyreon/reactivity";
import { useTable, flexRender, getCoreRowModel, createColumnHelper } from "@pyreon/table";

interface Person {
  name: string;
  age: number;
  email: string;
}

const columnHelper = createColumnHelper<Person>();

const columns = [
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.accessor("age", { header: "Age" }),
  columnHelper.accessor("email", { header: "Email" }),
];

const PeopleTable = defineComponent(() => {
  const data = signal<Person[]>([
    { name: "Alice", age: 30, email: "alice@example.com" },
    { name: "Bob", age: 25, email: "bob@example.com" },
  ]);

  const table = useTable(() => ({
    data: data(),
    columns,
    getCoreRowModel: getCoreRowModel(),
  }));

  return () => (
    <table>
      <thead>
        {table()
          .getHeaderGroups()
          .map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
      </thead>
      <tbody>
        {table()
          .getRowModel()
          .rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
      </tbody>
    </table>
  );
});
```

## `useTable`

```ts
function useTable<TData extends RowData>(
  options: () => TableOptions<TData>,
): Computed<Table<TData>>;
```

Creates a reactive TanStack Table instance. Returns a `Computed<Table<TData>>` -- a read-only signal that holds the table instance. Read it in effects or templates to track state changes.

### How It Works

Internally, `useTable`:

1. Creates an internal `signal<TableState>` to hold the adapter-managed state.
2. Creates the TanStack Table instance via `createTable()` with resolved options.
3. Sets up a reactive `effect()` that re-syncs options whenever signals read inside the options function change.
4. Uses a version counter signal to force the returned `Computed` to re-notify consumers when table state changes (since the table object identity does not change).
5. Registers an `onUnmount` callback to dispose the effect when the component unmounts.

### Reactive Options

Because options are passed as a function, you can use signals for dynamic data. When any signal read inside the options function changes, the table options are updated and the table re-evaluates.

```ts
const data = signal<Person[]>([]);
const columns = signal<ColumnDef<Person, unknown>[]>([
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age" },
]);

const table = useTable(() => ({
  data: data(),
  columns: columns(),
  getCoreRowModel: getCoreRowModel(),
}));

// Table updates automatically when data or columns change:
data.set([
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
]);
// table() now returns 2 rows

columns.set([{ accessorKey: "name", header: "Name" }]);
// table() now has 1 column
```

### Reactive Derived State

Use `computed()` to derive values from the table signal. These derived computeds automatically update when table state changes:

```ts
import { computed } from "@pyreon/reactivity";

const data = signal<Person[]>(defaultData);

const table = useTable(() => ({
  data: data(),
  columns,
  getCoreRowModel: getCoreRowModel(),
}));

const rowCount = computed(() => table().getRowModel().rows.length);
rowCount(); // 3

data.set([...defaultData, { name: "Diana", age: 28 }]);
rowCount(); // 4

data.set([defaultData[0]]);
rowCount(); // 1
```

### State Change Callbacks

The adapter automatically manages internal state via `onStateChange`. When you provide your own state and change handlers (e.g., `onSortingChange`, `onPaginationChange`), they are called **in addition to** the adapter's internal state management. The adapter merges your provided state with its internal state.

```ts
const sorting = signal<SortingState>([]);

const table = useTable(() => ({
  data: data(),
  columns,
  state: { sorting: sorting() },
  onSortingChange: (updater) => {
    sorting.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
}));
```

### Handling Updaters

TanStack Table state change callbacks receive an `Updater<T>` which can be either a function or a direct value. Always handle both cases:

```ts
onSortingChange: (updater) => {
  sorting.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
};
```

This pattern applies to all `on*Change` callbacks: `onSortingChange`, `onPaginationChange`, `onColumnFiltersChange`, `onRowSelectionChange`, `onColumnVisibilityChange`, `onExpandedChange`, `onGroupingChange`, etc.

### Cleanup

`useTable` registers an `onUnmount` callback to dispose its internal effect when the component unmounts. No manual cleanup is needed.

## `flexRender`

```ts
function flexRender<TData extends RowData, TValue>(
  component: ((props: TValue) => unknown) | string | number | null | undefined,
  props: TValue,
): unknown;
```

Renders a TanStack Table column definition template (header, cell, or footer). Handles:

- **Strings and numbers** -- returned as-is (e.g., `"Name"` or `42`)
- **Functions** -- called with the provided props (render functions or components)
- **VNodes** -- passed through to the renderer (detected by checking for `type`, `props`, and `children` properties)
- **null/undefined** -- returns `null`
- **Other types** (booleans, plain objects) -- returns `null`

```tsx
// Header
flexRender(header.column.columnDef.header, header.getContext());

// Cell
flexRender(cell.column.columnDef.cell, cell.getContext());

// Footer
flexRender(footer.column.columnDef.footer, footer.getContext());
```

### Custom Cell Renderers

Use function column definitions to render custom Pyreon components:

```ts
const columns = [
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => <strong>{info.getValue()}</strong>,
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor('avatar', {
    header: 'Avatar',
    cell: (info) => (
      <img
        src={info.getValue()}
        alt={info.row.original.name}
        width={32}
        height={32}
        style={{ borderRadius: '50%' }}
      />
    ),
  }),
  columnHelper.accessor('actions', {
    header: () => null,
    cell: (info) => (
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={() => editRow(info.row.original)}>Edit</button>
        <button onClick={() => deleteRow(info.row.original.id)}>Delete</button>
      </div>
    ),
  }),
]
```

### Custom Header Renderers

Headers can also be functions for interactive headers:

```ts
columnHelper.accessor('name', {
  header: ({ column }) => (
    <button onClick={() => column.toggleSorting()}>
      Name {column.getIsSorted() === 'asc' ? '(asc)' : column.getIsSorted() === 'desc' ? '(desc)' : ''}
    </button>
  ),
  cell: (info) => info.getValue(),
})
```

## Column Definitions

TanStack Table offers several column types, all re-exported from `@pyreon/table`.

### Using `createColumnHelper`

The type-safe way to define columns:

```ts
import { createColumnHelper } from '@pyreon/table'

interface Person {
  name: string
  age: number
  email: string
  department: { name: string; id: number }
}

const columnHelper = createColumnHelper<Person>()

const columns = [
  // Simple accessor columns
  columnHelper.accessor('name', {
    header: 'Full Name',
    cell: (info) => info.getValue(),
    footer: () => 'Total',
  }),

  columnHelper.accessor('age', {
    header: 'Age',
    cell: (info) => info.getValue(),
  }),

  columnHelper.accessor('email', {
    header: 'Email',
    cell: (info) => <a href={`mailto:${info.getValue()}`}>{info.getValue()}</a>,
  }),

  // Accessor function for nested data
  columnHelper.accessor((row) => row.department.name, {
    id: 'departmentName',
    header: 'Department',
    cell: (info) => info.getValue(),
  }),

  // Display column (no accessor, custom rendering)
  columnHelper.display({
    id: 'actions',
    header: 'Actions',
    cell: (info) => (
      <button onClick={() => handleEdit(info.row.original)}>
        Edit
      </button>
    ),
  }),
]
```

### Using Plain Column Definitions

You can also define columns as plain objects:

```ts
import type { ColumnDef } from "@pyreon/table";

const columns: ColumnDef<Person, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "age",
    header: "Age",
  },
  {
    id: "fullInfo",
    accessorFn: (row) => `${row.name} (${row.age})`,
    header: "Summary",
  },
];
```

### Column Groups

Group related columns under a shared header:

```ts
const columns = [
  columnHelper.group({
    header: "Personal Info",
    columns: [
      columnHelper.accessor("name", { header: "Name" }),
      columnHelper.accessor("age", { header: "Age" }),
    ],
  }),
  columnHelper.group({
    header: "Contact",
    columns: [
      columnHelper.accessor("email", { header: "Email" }),
      columnHelper.accessor("phone", { header: "Phone" }),
    ],
  }),
];
```

## Sorting

### Basic Sorting

Enable sorting by adding `getSortedRowModel`:

```tsx
import { useTable, getCoreRowModel, getSortedRowModel } from "@pyreon/table";

const table = useTable(() => ({
  data: data(),
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
}));
```

With the adapter's built-in state management, sorting works automatically. Toggle sorting on a column:

```ts
// Toggle sorting on the "age" column
table().getColumn("age")!.toggleSorting(false); // ascending
table().getColumn("age")!.toggleSorting(true); // descending

// Check current sort state
table().getState().sorting;
// [{ id: 'age', desc: false }]
```

### Controlled Sorting

For full control over sort state, manage it with a signal:

```tsx
import type { SortingState } from "@pyreon/table";

const sorting = signal<SortingState>([]);

const table = useTable(() => ({
  data: data(),
  columns,
  state: { sorting: sorting() },
  onSortingChange: (updater) => {
    sorting.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
}));
```

### Multi-Column Sorting

Enable multi-column sorting so users can sort by multiple columns:

```ts
const table = useTable(() => ({
  data: data(),
  columns,
  enableMultiSort: true,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
}));
```

### Sortable Header Component

```tsx
function SortableHeader({ column, label }) {
  const sorted = column.getIsSorted();
  return (
    <button
      onClick={() => column.toggleSorting()}
      style={{ cursor: "pointer", fontWeight: "bold" }}
    >
      {label}
      {sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : ""}
    </button>
  );
}

const columns = [
  columnHelper.accessor("name", {
    header: ({ column }) => <SortableHeader column={column} label="Name" />,
  }),
  columnHelper.accessor("age", {
    header: ({ column }) => <SortableHeader column={column} label="Age" />,
    sortingFn: "basic", // numeric sorting
  }),
];
```

### Custom Sort Functions

```ts
columnHelper.accessor("priority", {
  header: "Priority",
  sortingFn: (rowA, rowB, columnId) => {
    const order = { high: 3, medium: 2, low: 1 };
    const a = order[rowA.getValue(columnId)] ?? 0;
    const b = order[rowB.getValue(columnId)] ?? 0;
    return a - b;
  },
});
```

## Filtering

### Column Filters

Filter individual columns with `getFilteredRowModel`:

```tsx
import { useTable, getCoreRowModel, getFilteredRowModel } from "@pyreon/table";
import type { ColumnFiltersState } from "@pyreon/table";

const columnFilters = signal<ColumnFiltersState>([]);

const table = useTable(() => ({
  data: data(),
  columns,
  state: { columnFilters: columnFilters() },
  onColumnFiltersChange: (updater) => {
    columnFilters.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
}));
```

Set a filter value on a column:

```ts
table().getColumn("name")!.setFilterValue("Ali");
// Only rows where "name" includes "Ali" are shown
```

### Automatic Filtering

Without controlled state, the adapter manages filter state internally:

```ts
const table = useTable(() => ({
  data: data(),
  columns,
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
}));

// Set a filter directly on the column
table().getColumn("name")!.setFilterValue("Ali");
const filtered = table().getRowModel().rows;
// filtered has 1 row: Alice
```

### Global Filter

Apply a single search query across all columns:

```tsx
const globalFilter = signal('')

const table = useTable(() => ({
  data: data(),
  columns,
  state: { globalFilter: globalFilter() },
  onGlobalFilterChange: (updater) => {
    globalFilter.update((prev) =>
      typeof updater === 'function' ? updater(prev) : updater
    )
  },
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
}))

// Search input
<input
  type="text"
  placeholder="Search all columns..."
  value={globalFilter()}
  onInput={(e) => globalFilter.set(e.target.value)}
/>
```

### Custom Filter Functions

```ts
columnHelper.accessor("age", {
  header: "Age",
  filterFn: (row, columnId, filterValue) => {
    const age = row.getValue<number>(columnId);
    const [min, max] = filterValue as [number, number];
    return age >= min && age <= max;
  },
});

// Usage: filter ages between 20 and 35
table().getColumn("age")!.setFilterValue([20, 35]);
```

### Filter Input Component

```tsx
function ColumnFilter({ column }) {
  return (
    <input
      type="text"
      value={(column.getFilterValue() ?? "") as string}
      onInput={(e) => column.setFilterValue(e.target.value)}
      placeholder={`Filter ${column.id}...`}
      style={{ width: "100%", padding: "4px" }}
    />
  );
}

// In the header:
{
  table()
    .getHeaderGroups()
    .map((headerGroup) => (
      <tr key={headerGroup.id}>
        {headerGroup.headers.map((header) => (
          <th key={header.id}>
            {flexRender(header.column.columnDef.header, header.getContext())}
            {header.column.getCanFilter() && <ColumnFilter column={header.column} />}
          </th>
        ))}
      </tr>
    ));
}
```

## Pagination

### Client-Side Pagination

```tsx
import { useTable, getCoreRowModel, getPaginationRowModel } from "@pyreon/table";
import type { PaginationState } from "@pyreon/table";

const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 10 });

const table = useTable(() => ({
  data: data(),
  columns,
  state: { pagination: pagination() },
  onPaginationChange: (updater) => {
    pagination.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
}));
```

### Automatic Pagination

Without controlled state, pagination is managed internally with a default page size of 10:

```ts
const bigData = Array.from({ length: 25 }, (_, i) => ({
  name: `Person ${i}`,
  age: 20 + i,
}));

const table = useTable(() => ({
  data: bigData,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
}));

table().getRowModel().rows.length; // 10 (first page)
table().getCanNextPage(); // true
table().getCanPreviousPage(); // false

table().nextPage();
table().getRowModel().rows.length; // 10 (second page)
table().getRowModel().rows[0].original.name; // "Person 10"

table().nextPage();
table().getRowModel().rows.length; // 5 (last page, only 5 remaining)
table().getCanNextPage(); // false
```

### Pagination Controls

```tsx
function PaginationControls({ table }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" }}>
      <button onClick={() => table().firstPage()} disabled={!table().getCanPreviousPage()}>
        {"<<"}
      </button>
      <button onClick={() => table().previousPage()} disabled={!table().getCanPreviousPage()}>
        {"<"}
      </button>
      <span>
        Page {table().getState().pagination.pageIndex + 1} of {table().getPageCount()}
      </span>
      <button onClick={() => table().nextPage()} disabled={!table().getCanNextPage()}>
        {">"}
      </button>
      <button onClick={() => table().lastPage()} disabled={!table().getCanNextPage()}>
        {">>"}
      </button>
      <select
        value={table().getState().pagination.pageSize}
        onChange={(e) => table().setPageSize(Number(e.target.value))}
      >
        {[10, 20, 50, 100].map((size) => (
          <option key={size} value={size}>
            Show {size}
          </option>
        ))}
      </select>
    </div>
  );
}
```

### Page Size Selector

```ts
// Change page size programmatically
table().setPageSize(25);

// Go to a specific page
table().setPageIndex(2); // third page (zero-indexed)
```

### Server-Side Pagination

For server-side pagination, manage the data fetching externally and disable client-side pagination:

```tsx
import { signal } from "@pyreon/reactivity";

const data = signal<Person[]>([]);
const totalRows = signal(0);
const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 20 });

async function fetchPage(pageIndex: number, pageSize: number) {
  const response = await fetch(`/api/people?page=${pageIndex}&size=${pageSize}`);
  const result = await response.json();
  data.set(result.items);
  totalRows.set(result.total);
}

// Initial fetch
fetchPage(0, 20);

const table = useTable(() => ({
  data: data(),
  columns,
  pageCount: Math.ceil(totalRows() / pagination().pageSize),
  state: { pagination: pagination() },
  onPaginationChange: (updater) => {
    const newPagination = typeof updater === "function" ? updater(pagination.peek()) : updater;
    pagination.set(newPagination);
    fetchPage(newPagination.pageIndex, newPagination.pageSize);
  },
  manualPagination: true,
  getCoreRowModel: getCoreRowModel(),
}));
```

## Row Selection

### Enabling Row Selection

```tsx
const rowSelection = signal<Record<string, boolean>>({});

const table = useTable(() => ({
  data: data(),
  columns,
  state: { rowSelection: rowSelection() },
  onRowSelectionChange: (updater) => {
    rowSelection.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  enableRowSelection: true,
  getCoreRowModel: getCoreRowModel(),
}));
```

### Automatic Row Selection

Without controlled state, selection works out of the box:

```ts
const table = useTable(() => ({
  data: data(),
  columns,
  getCoreRowModel: getCoreRowModel(),
  enableRowSelection: true,
}));

table().getSelectedRowModel().rows; // []

table().getRowModel().rows[0].toggleSelected(true);
table().getSelectedRowModel().rows; // [first row]

table().getRowModel().rows[0].toggleSelected(false);
table().getSelectedRowModel().rows; // []
```

### Selection Checkbox Column

```ts
const columns = [
  columnHelper.display({
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllRowsSelected()}
        indeterminate={table.getIsSomeRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  }),
  // ... other columns
]
```

### Getting Selected Rows

```ts
// Get selected row models
const selectedRows = table().getSelectedRowModel().rows;

// Get selected row data
const selectedData = selectedRows.map((row) => row.original);

// Check how many are selected
const selectedCount = Object.keys(table().getState().rowSelection).length;
```

### Conditional Row Selection

```ts
const table = useTable(() => ({
  data: data(),
  columns,
  enableRowSelection: (row) => row.original.status !== "locked",
  getCoreRowModel: getCoreRowModel(),
}));
```

## Column Visibility

Toggle columns on and off:

```tsx
const columnVisibility = signal<Record<string, boolean>>({});

const table = useTable(() => ({
  data: data(),
  columns,
  state: { columnVisibility: columnVisibility() },
  onColumnVisibilityChange: (updater) => {
    columnVisibility.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  getCoreRowModel: getCoreRowModel(),
}));
```

### Automatic Column Visibility

```ts
const table = useTable(() => ({
  data: data(),
  columns,
  getCoreRowModel: getCoreRowModel(),
}));

table().getVisibleFlatColumns().length; // 2

table().getColumn("age")!.toggleVisibility(false);
table().getVisibleFlatColumns().length; // 1
table().getVisibleFlatColumns()[0].id; // "name"

table().getColumn("age")!.toggleVisibility(true);
table().getVisibleFlatColumns().length; // 2
```

### Column Visibility Toggle UI

```tsx
function ColumnToggle({ table }) {
  return (
    <div style={{ padding: "8px" }}>
      <label>
        <input
          type="checkbox"
          checked={table().getIsAllColumnsVisible()}
          onChange={table().getToggleAllColumnsVisibilityHandler()}
        />
        Toggle All
      </label>
      {table()
        .getAllLeafColumns()
        .map((column) => (
          <label key={column.id} style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={column.getIsVisible()}
              onChange={column.getToggleVisibilityHandler()}
            />
            {column.id}
          </label>
        ))}
    </div>
  );
}
```

## Column Ordering

Reorder columns programmatically:

```tsx
import type { ColumnOrderState } from "@pyreon/table";

const columnOrder = signal<ColumnOrderState>([]);

const table = useTable(() => ({
  data: data(),
  columns,
  state: { columnOrder: columnOrder() },
  onColumnOrderChange: (updater) => {
    columnOrder.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  getCoreRowModel: getCoreRowModel(),
}));

// Reorder columns
columnOrder.set(["email", "name", "age"]);
```

## Expanding and Grouping Rows

### Row Expanding

For hierarchical data with sub-rows:

```tsx
import { useTable, getCoreRowModel, getExpandedRowModel } from "@pyreon/table";
import type { ExpandedState } from "@pyreon/table";

const expanded = signal<ExpandedState>({});

const table = useTable(() => ({
  data: treeData(),
  columns,
  state: { expanded: expanded() },
  onExpandedChange: (updater) => {
    expanded.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  getSubRows: (row) => row.children,
  getCoreRowModel: getCoreRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
}));
```

### Expand Toggle in a Column

```ts
columnHelper.display({
  id: 'expander',
  header: () => null,
  cell: ({ row }) => {
    if (!row.getCanExpand()) return null
    return (
      <button onClick={row.getToggleExpandedHandler()}>
        {row.getIsExpanded() ? '▼' : '▶'}
      </button>
    )
  },
})
```

### Row Grouping

Group rows by column values:

```tsx
import { useTable, getCoreRowModel, getGroupedRowModel, getExpandedRowModel } from "@pyreon/table";
import type { GroupingState } from "@pyreon/table";

const grouping = signal<GroupingState>([]);

const table = useTable(() => ({
  data: data(),
  columns,
  state: { grouping: grouping() },
  onGroupingChange: (updater) => {
    grouping.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  getCoreRowModel: getCoreRowModel(),
  getGroupedRowModel: getGroupedRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
}));

// Group by department
grouping.set(["department"]);
```

## Combining Features

### Sorting + Filtering + Pagination

```tsx
import { signal } from "@pyreon/reactivity";
import {
  useTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  createColumnHelper,
} from "@pyreon/table";
import type { SortingState, ColumnFiltersState, PaginationState } from "@pyreon/table";

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
}

const columnHelper = createColumnHelper<Product>();

const columns = [
  columnHelper.accessor("name", { header: "Product" }),
  columnHelper.accessor("category", { header: "Category" }),
  columnHelper.accessor("price", {
    header: "Price",
    cell: (info) => `$${info.getValue().toFixed(2)}`,
  }),
  columnHelper.accessor("stock", {
    header: "Stock",
    cell: (info) => {
      const stock = info.getValue();
      return (
        <span style={{ color: stock < 10 ? "red" : stock < 50 ? "orange" : "green" }}>{stock}</span>
      );
    },
  }),
];

const ProductTable = defineComponent(() => {
  const data = signal<Product[]>([
    /* ... */
  ]);
  const sorting = signal<SortingState>([]);
  const columnFilters = signal<ColumnFiltersState>([]);
  const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const table = useTable(() => ({
    data: data(),
    columns,
    state: {
      sorting: sorting(),
      columnFilters: columnFilters(),
      pagination: pagination(),
    },
    onSortingChange: (updater) => {
      sorting.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    onColumnFiltersChange: (updater) => {
      columnFilters.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    onPaginationChange: (updater) => {
      pagination.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  }));

  return () => (
    <div>
      <table>
        <thead>
          {table()
            .getHeaderGroups()
            .map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : (
                      <div>
                        <button onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === "asc" ? " ↑" : ""}
                          {header.column.getIsSorted() === "desc" ? " ↓" : ""}
                        </button>
                        {header.column.getCanFilter() && (
                          <input
                            type="text"
                            value={(header.column.getFilterValue() ?? "") as string}
                            onInput={(e) => header.column.setFilterValue(e.target.value)}
                            placeholder="Filter..."
                          />
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
        </thead>
        <tbody>
          {table()
            .getRowModel()
            .rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" }}>
        <button onClick={() => table().previousPage()} disabled={!table().getCanPreviousPage()}>
          Previous
        </button>
        <span>
          Page {table().getState().pagination.pageIndex + 1} of {table().getPageCount()}
        </span>
        <button onClick={() => table().nextPage()} disabled={!table().getCanNextPage()}>
          Next
        </button>
      </div>
    </div>
  );
});
```

## Server-Side Data Loading with @pyreon/query

Combine `useTable` with `@pyreon/query` for server-driven tables:

```tsx
import { signal } from "@pyreon/reactivity";
import { useQuery } from "@pyreon/query";
import { useTable, getCoreRowModel, createColumnHelper } from "@pyreon/table";
import type { SortingState, PaginationState } from "@pyreon/table";

interface ApiResponse {
  items: Person[];
  total: number;
}

const sorting = signal<SortingState>([]);
const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 20 });

// Build query key from table state
const queryKey = () => ["people", pagination().pageIndex, pagination().pageSize, sorting()];

const { data, isLoading, error } = useQuery<ApiResponse>({
  queryKey: queryKey(),
  queryFn: async () => {
    const { pageIndex, pageSize } = pagination.peek();
    const sort = sorting.peek();
    const params = new URLSearchParams({
      page: String(pageIndex),
      size: String(pageSize),
      ...(sort.length > 0 && {
        sortBy: sort[0].id,
        sortDir: sort[0].desc ? "desc" : "asc",
      }),
    });
    const res = await fetch(`/api/people?${params}`);
    return res.json();
  },
});

const table = useTable(() => ({
  data: data()?.items ?? [],
  columns,
  pageCount: Math.ceil((data()?.total ?? 0) / pagination().pageSize),
  state: {
    sorting: sorting(),
    pagination: pagination(),
  },
  onSortingChange: (updater) => {
    sorting.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  onPaginationChange: (updater) => {
    pagination.update((prev) => (typeof updater === "function" ? updater(prev) : updater));
  },
  manualPagination: true,
  manualSorting: true,
  getCoreRowModel: getCoreRowModel(),
}));
```

## Responsive Table Patterns

### Horizontal Scroll Wrapper

```tsx
const TableWrapper = styled('div')`
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`

const StyledTable = styled('table')`
  width: 100%;
  min-width: 600px;
  border-collapse: collapse;

  th, td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid #e0e0e0;
  }

  th {
    background: #f5f5f5;
    font-weight: 600;
    position: sticky;
    top: 0;
  }

  tr:hover td {
    background: #fafafa;
  }
`

// Usage
<TableWrapper>
  <StyledTable>
    {/* table content */}
  </StyledTable>
</TableWrapper>
```

### Hide Columns on Small Screens

Use column visibility with a media query check:

```ts
function useResponsiveColumns(table) {
  const isSmall = signal(window.innerWidth < 768);

  window.addEventListener("resize", () => {
    isSmall.set(window.innerWidth < 768);
  });

  effect(() => {
    if (isSmall()) {
      // Hide less important columns on small screens
      table().getColumn("email")?.toggleVisibility(false);
      table().getColumn("department")?.toggleVisibility(false);
    } else {
      table().getColumn("email")?.toggleVisibility(true);
      table().getColumn("department")?.toggleVisibility(true);
    }
  });
}
```

## Full Real-World Data Table Example

A complete, production-style data table with all features combined:

```tsx
import { defineComponent } from "@pyreon/core";
import { signal, computed } from "@pyreon/reactivity";
import {
  useTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  createColumnHelper,
} from "@pyreon/table";
import type { SortingState, ColumnFiltersState, PaginationState } from "@pyreon/table";

interface Employee {
  id: number;
  name: string;
  email: string;
  department: string;
  role: string;
  salary: number;
  startDate: string;
  status: "active" | "inactive" | "on-leave";
}

const columnHelper = createColumnHelper<Employee>();

const columns = [
  columnHelper.display({
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
    size: 40,
  }),
  columnHelper.accessor("name", {
    header: ({ column }) => (
      <button onClick={() => column.toggleSorting()}>
        Name {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
      </button>
    ),
    cell: (info) => <strong>{info.getValue()}</strong>,
  }),
  columnHelper.accessor("email", {
    header: "Email",
    cell: (info) => <a href={`mailto:${info.getValue()}`}>{info.getValue()}</a>,
  }),
  columnHelper.accessor("department", {
    header: ({ column }) => (
      <button onClick={() => column.toggleSorting()}>
        Department{" "}
        {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
      </button>
    ),
  }),
  columnHelper.accessor("role", { header: "Role" }),
  columnHelper.accessor("salary", {
    header: ({ column }) => (
      <button onClick={() => column.toggleSorting()}>
        Salary {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
      </button>
    ),
    cell: (info) => `$${info.getValue().toLocaleString()}`,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const status = info.getValue();
      const colors = {
        active: { bg: "#dcfce7", text: "#166534" },
        inactive: { bg: "#fee2e2", text: "#991b1b" },
        "on-leave": { bg: "#fef9c3", text: "#854d0e" },
      };
      const { bg, text } = colors[status];
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "9999px",
            fontSize: "12px",
            background: bg,
            color: text,
          }}
        >
          {status}
        </span>
      );
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: (info) => (
      <div style={{ display: "flex", gap: "4px" }}>
        <button onClick={() => console.log("Edit", info.row.original)}>Edit</button>
        <button onClick={() => console.log("Delete", info.row.original.id)}>Delete</button>
      </div>
    ),
  }),
];

const EmployeeTable = defineComponent(() => {
  const data = signal<Employee[]>([
    /* ... employee data ... */
  ]);
  const sorting = signal<SortingState>([]);
  const columnFilters = signal<ColumnFiltersState>([]);
  const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const rowSelection = signal<Record<string, boolean>>({});
  const globalFilter = signal("");

  const table = useTable(() => ({
    data: data(),
    columns,
    state: {
      sorting: sorting(),
      columnFilters: columnFilters(),
      pagination: pagination(),
      rowSelection: rowSelection(),
      globalFilter: globalFilter(),
    },
    onSortingChange: (u) => sorting.update((p) => (typeof u === "function" ? u(p) : u)),
    onColumnFiltersChange: (u) => columnFilters.update((p) => (typeof u === "function" ? u(p) : u)),
    onPaginationChange: (u) => pagination.update((p) => (typeof u === "function" ? u(p) : u)),
    onRowSelectionChange: (u) => rowSelection.update((p) => (typeof u === "function" ? u(p) : u)),
    onGlobalFilterChange: (u) => globalFilter.update((p) => (typeof u === "function" ? u(p) : u)),
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  }));

  const selectedCount = computed(() => Object.keys(table().getState().rowSelection).length);

  return () => (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
        <input
          type="text"
          placeholder="Search all columns..."
          value={globalFilter()}
          onInput={(e) => globalFilter.set(e.target.value)}
          style={{ padding: "6px 12px", border: "1px solid #ccc", borderRadius: "4px" }}
        />
        <span>
          {selectedCount()} of {table().getRowModel().rows.length} row(s) selected
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            {table()
              .getHeaderGroups()
              .map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        borderBottom: "2px solid #e0e0e0",
                      }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
          </thead>
          <tbody>
            {table()
              .getRowModel()
              .rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #e0e0e0" }}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ padding: "8px 12px" }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 0",
        }}
      >
        <span style={{ fontSize: "14px", color: "#666" }}>
          Showing {table().getRowModel().rows.length} of {data().length} rows
        </span>
        <div style={{ display: "flex", gap: "4px" }}>
          <button onClick={() => table().firstPage()} disabled={!table().getCanPreviousPage()}>
            {"<<"}
          </button>
          <button onClick={() => table().previousPage()} disabled={!table().getCanPreviousPage()}>
            {"<"}
          </button>
          <span style={{ padding: "0 8px" }}>
            Page {table().getState().pagination.pageIndex + 1} of {table().getPageCount()}
          </span>
          <button onClick={() => table().nextPage()} disabled={!table().getCanNextPage()}>
            {">"}
          </button>
          <button onClick={() => table().lastPage()} disabled={!table().getCanNextPage()}>
            {">>"}
          </button>
        </div>
      </div>
    </div>
  );
});
```

## TanStack Table Core Re-exports

All exports from `@tanstack/table-core` are re-exported. This includes:

### Row Model Factories

- `getCoreRowModel` -- required for all tables
- `getSortedRowModel` -- client-side sorting
- `getFilteredRowModel` -- client-side filtering
- `getPaginationRowModel` -- client-side pagination
- `getGroupedRowModel` -- row grouping
- `getExpandedRowModel` -- row expanding (for tree data or grouping)
- `getFacetedRowModel` -- faceted row model for filter facets
- `getFacetedUniqueValues` -- unique values for faceted filters
- `getFacetedMinMaxValues` -- min/max values for range filters

### Column Helpers

- `createColumnHelper` -- type-safe column definition helper

### All Types

- `Table`, `Row`, `Cell`, `Column`, `Header`, `HeaderGroup`
- `ColumnDef`, `ColumnDefTemplate`, `AccessorColumnDef`, `DisplayColumnDef`, `GroupColumnDef`
- `TableOptions`, `TableOptionsResolved`, `RowData`, `TableState`
- `SortingState`, `ColumnFiltersState`, `PaginationState`
- `VisibilityState`, `ExpandedState`, `GroupingState`
- `ColumnOrderState`, `RowSelectionState`
- `Updater`, `OnChangeFn`
- And many more

## API Reference

### `useTable(options)`

Create a reactive TanStack Table instance.

- **`options`** (`() => TableOptions<TData>`) -- Reactive options function. Signals read inside are automatically tracked.
- **Returns** `Computed<Table<TData>>` -- A computed signal holding the table instance.

### `UseTableOptions<TData>`

```ts
type UseTableOptions<TData extends RowData> = () => TableOptions<TData>;
```

A function returning TanStack Table options. Called reactively -- when any signal read inside changes, the table options are updated.

### `flexRender(component, props)`

Render a TanStack Table column definition template.

- **`component`** -- The column def template (string, number, function, VNode, or null).
- **`props`** -- The context props from TanStack Table (e.g., `header.getContext()`, `cell.getContext()`).
- **Returns** -- The rendered output (string, number, VNode, or null).
