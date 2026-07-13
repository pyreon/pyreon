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
            {/* flexRenderCell(table, …) inside an accessor = fine-grained:
                a single-cell edit patches ONLY this cell. Plain
                flexRender(cell…, cell.getContext()) FREEZES on a value change
                because the keyed <For> reuses the cell and never re-runs it. */}
            {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
          </For>
        </tr>
      )}
    </For>
  </tbody>
</table>`,
  features: [
    'useTable(optionsFn) with reactive signal-driven options',
    'flexRender for column def templates (strings, functions, VNodes)',
    'flexRenderCell — fine-grained per-cell updates: an in-place data edit patches only the changed rows cells, no memo boilerplate',
    'Full TanStack Table core re-exported — single import source',
    'Computed<Table<T>> return type; per-row signals under the hood',
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
        'Using `.map()` on rows instead of `<For>` — loses Pyreon\'s keyed reconciliation, rebuilds the whole tbody on every change (worst-case DOM churn)',
        'Binding a value that CHANGES (a cell value, column width from `getSize()`, a sort indicator) as a STATIC prop/attr/child through a keyed `<For>` — the keyed cell is reused on a state change and its body never re-runs, so the value freezes. Read it inside a reactive closure at the point of use: cell content via `<td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>`, an attribute via `style={() => ({ width: table().getColumn(id).getSize() + "px" })}`',
      ],
      seeAlso: ['flexRender', 'flexRenderCell'],
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
        'Using plain `flexRender(cell…, cell.getContext())` for a cell inside a keyed `<For>` when the cell VALUE can change in place — the captured `cell` is stale and the reused row never re-runs it, so it freezes. Use `flexRenderCell(table, row.id, cell.column.id)` for live cells.',
      ],
      seeAlso: ['useTable', 'flexRenderCell'],
    },
    {
      name: 'flexRenderCell',
      kind: 'function',
      signature:
        '<TData extends RowData>(table: Table<TData> | Computed<Table<TData>>, rowId: string, columnId: string) => unknown',
      summary:
        'Fine-grained per-cell renderer for live cell values. Inside a keyed `<For>`, the `row`/`cell` objects are captured ONCE (the reconciler reuses the DOM node and never re-runs its body), so plain `flexRender(cell…, cell.getContext())` FREEZES when a value changes in place. `flexRenderCell` re-navigates to the live cell from the current row model each read — place it in an explicit accessor `<td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>`. Pass the Computed<Table> ACCESSOR (`table`, not `table()`) for fine-grained updates: the cell then subscribes to only its own row\'s signal, so an in-place data edit patches ONLY the changed rows\' cells — matching a hand-memoized react-table row without any React.memo boilerplate. Returns null when the row is not in the current (filtered/paginated) row model.',
      example: `// Place inside an accessor child, passing the \`table\` ACCESSOR (not \`table()\`):
//   <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>
// so a single-cell edit patches ONLY that cell.
flexRenderCell(table, row.id, columnId)`,
      mistakes: [
        'Passing the resolved instance `table()` instead of the accessor `table` — still correct, but subscribes coarsely (every cell re-runs on any change) instead of fine-grained per-row',
        'Forgetting the explicit accessor wrapper `{() => …}` — without it the cell is captured once and freezes on the next change',
      ],
      seeAlso: ['useTable', 'flexRender'],
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
    {
      label: 'Fine-grained cells',
      note: 'For live/editable tables, render cells with `flexRenderCell(table, row.id, cell.column.id)` inside an accessor. An in-place data edit then re-runs ONLY the changed rows\' cell bindings (per-row signals) and patches ONE cell — no memo boilerplate, matching a hand-optimized react-table. A table-STATE change (sort/filter/selection/column visibility) re-runs all cells (coarse, correct-by-default for state-reading cells).',
    },
    {
      label: 'reorder-on-data-edit limitation',
      note: 'A DATA edit that changes the SORT ORDER (editing the column you are sorted BY) updates every cell to the correct value but does NOT re-position the keyed rows until the next structure/state change — a pre-existing base-adapter limitation of the sorted-row-model + <For> interaction (it affects plain `flexRender` cells too, not just `flexRenderCell`). Re-ordering via the sort controls (`toggleSorting`/`setSorting`) works normally. Workaround: re-apply sorting after such an edit, or sort by a column you do not edit in place.',
    },
  ],
})
