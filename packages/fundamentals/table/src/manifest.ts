import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/table',
  title: 'TanStack Table Adapter',
  tagline: 'Pyreon adapter for TanStack Table — reactive options, signal-driven state, flexRender',
  description:
    'Reactive TanStack Table adapter for Pyreon. Options are passed as a function so signal reads inside (data, columns, sorting) automatically re-sync the table when any tracked signal changes. Returns a Computed<Table<T>> that consumers read inside templates or effects. Re-exports all TanStack Table core utilities and types for single-import convenience.',
  category: 'universal',
  longExample: `import { useTable, flexRender, getCoreRowModel, getSortedRowModel, type ColumnDef } from '@pyreon/table'
import { signal } from '@pyreon/reactivity'

interface User { name: string; email: string; age: number }

const users = signal<User[]>([
  { name: 'Alice', email: 'alice@example.com', age: 30 },
  { name: 'Bob', email: 'bob@example.com', age: 25 },
])

const columns: ColumnDef<User>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'age', header: 'Age' },
]

// Options as a FUNCTION — signal reads inside auto-track.
// Changing users() re-syncs the entire table reactively.
const table = useTable(() => ({
  data: users(),
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
}))

// In JSX — read table() inside reactive scopes:
<table>
  <thead>
    <For each={() => table().getHeaderGroups()} by={(g) => g.id}>
      {(group) => (
        <tr>
          <For each={() => group.headers} by={(h) => h.id}>
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
</table>`,
  features: [
    'useTable(optionsFn) with reactive signal-driven options',
    'flexRender for column def templates (strings, functions, VNodes)',
    'Full TanStack Table core re-exported — single import source',
    'Computed<Table<T>> return type for fine-grained reactivity',
    'Auto state sync via internal signal + version counter',
  ],
  api: [
    {
      name: 'useTable',
      kind: 'hook',
      signature: '<TData extends RowData>(options: () => TableOptions<TData>) => Computed<Table<TData>>',
      summary:
        'Create a reactive TanStack Table instance. Options are passed as a function so reactive signals (data, columns, sorting state) can be read inside and the table updates automatically when they change. Returns a Computed<Table<T>> — read it inside JSX expression thunks or effects to track state changes. Internal state management uses a version counter to force re-notification even when the table reference is the same object.',
      example: `const table = useTable(() => ({
  data: users(),
  columns: [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
  ],
  getCoreRowModel: getCoreRowModel(),
}))

// Read inside reactive scope:
<For each={() => table().getRowModel().rows} by={(r) => r.id}>
  {(row) => <tr>...</tr>}
</For>`,
      mistakes: [
        'Passing options as a plain object instead of a function — signal reads are not tracked and the table never updates when data changes',
        'Reading `table` without calling it — `table` is a Computed, you must call `table()` to get the Table instance',
        'Forgetting getCoreRowModel() — TanStack Table requires at least getCoreRowModel in options or it throws',
        'Using `.map()` on rows instead of `<For>` — loses Pyreon\'s keyed reconciliation and fine-grained DOM updates',
      ],
      seeAlso: ['flexRender'],
    },
    {
      name: 'flexRender',
      kind: 'function',
      signature: '<TData extends RowData, TValue>(component: Renderable<TValue>, props: TValue) => unknown',
      summary:
        'Render a TanStack Table column definition template (header, cell, or footer). Handles strings, numbers, functions (component functions or render functions), and VNodes. Returns the rendered output or null for undefined/null inputs. Use in JSX to render column definitions provided by TanStack Table.',
      example: `// Header:
flexRender(header.column.columnDef.header, header.getContext())
// Cell:
flexRender(cell.column.columnDef.cell, cell.getContext())`,
      mistakes: [
        'Wrapping flexRender output in an extra function accessor — the result is already renderable JSX content',
        'Passing the column def directly instead of calling getContext() — TanStack Table requires the context object',
      ],
      seeAlso: ['useTable'],
    },
  ],
  gotchas: [
    'Options must be a FUNCTION `() => TableOptions<T>`, not a plain object. Signal reads inside the function are tracked reactively — changing any tracked signal re-syncs the table automatically.',
    {
      label: 'Re-exports',
      note: 'All TanStack Table core utilities (getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, etc.) and types are re-exported from `@pyreon/table` — no need to import from `@tanstack/table-core` separately.',
    },
    {
      label: 'Computed return',
      note: 'useTable returns Computed<Table<T>>, not Table<T>. Always call `table()` to get the instance. Reading it inside `<For each={() => table().getRowModel().rows}>` makes the list reactive.',
    },
  ],
})
