# @pyreon/table

Pyreon adapter for TanStack Table — reactive `useTable` + `flexRender`.

`@pyreon/table` wraps `@tanstack/table-core` so a Pyreon app gets all the headless table machinery (sorting, filtering, pagination, grouping, expanding, faceting) with signal-driven options. `useTable(() => opts)` returns a `Computed<Table<TData>>` whose backing instance is mutated in place — a version counter forces the computed to re-notify on state changes. `flexRender` handles the four column-def shapes TanStack supports (string, number, function, VNode). `flexRenderCell` gives **fine-grained per-cell updates**: an in-place data edit patches only the changed rows' cells (via per-row signals), matching a hand-memoized `@tanstack/react-table` row with no `React.memo` boilerplate. The full `@tanstack/table-core` surface is re-exported, so consumers import everything from `@pyreon/table`.

## Install

```bash
bun add @pyreon/table @pyreon/core @pyreon/reactivity
# @tanstack/table-core is a hard dependency, installed automatically
```

## Quick start

```tsx
import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import {
  useTable,
  flexRender,
  flexRenderCell,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
} from '@pyreon/table'

type Person = { name: string; age: number }

const columnHelper = createColumnHelper<Person>()
const columns = [
  columnHelper.accessor('name', { header: 'Name' }),
  columnHelper.accessor('age', { header: 'Age' }),
]

function UserTable() {
  const data = signal<Person[]>([
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
  ])

  const table = useTable(() => ({
    data: data(),
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  }))

  // Use <For> (keyed reconciliation) for rows + cells — never `.map()` (which
  // rebuilds the whole <tbody> on every change). `flexRenderCell(table, …)`
  // inside an accessor gives fine-grained per-cell updates.
  return () => (
    <table>
      <thead>
        <For each={() => table().getHeaderGroups()} by={(g) => g.id}>
          {(hg) => (
            <tr>
              <For each={() => hg.headers} by={(h) => h.id}>
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
                {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}
```

## `useTable(() => options)`

Create a reactive table instance. **Options are a function** — read signals (data, columns, sorting state) inside and the table updates automatically.

| Parameter | Type                          | Description                                   |
| --------- | ----------------------------- | --------------------------------------------- |
| `options` | `() => TableOptions<TData>`   | Function returning TanStack `TableOptions`    |

Returns `Computed<Table<TData>>` — **call it** to get the instance: `table().getRowModel()`.

The adapter creates the table instance once (via `createTable`) and mutates it in place on option changes. State sync is wired via the adapter's own `onStateChange` (composed with the user's, if any). A version counter is bumped on every state / option change so the computed re-emits even though the table reference is stable.

### Controlled state

```ts
import { signal } from '@pyreon/reactivity'
import type { SortingState, PaginationState } from '@pyreon/table'

const sorting = signal<SortingState>([])
const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 10 })

const table = useTable(() => ({
  data: data(),
  columns,
  state: {
    sorting: sorting(),
    pagination: pagination(),
  },
  onSortingChange: (u) => sorting.set(typeof u === 'function' ? u(sorting.peek()) : u),
  onPaginationChange: (u) =>
    pagination.set(typeof u === 'function' ? u(pagination.peek()) : u),
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
}))
```

## `flexRender(component, props)`

Render any TanStack column-def template (header, cell, footer). Handles strings, numbers, functions, and VNodes; returns `null` for anything else (including `null`/`undefined`).

```tsx
// Header cell:
flexRender(header.column.columnDef.header, header.getContext())

// Data cell:
flexRender(cell.column.columnDef.cell, cell.getContext())

// Footer cell:
flexRender(footer.column.columnDef.footer, footer.getContext())
```

Custom cell renderers can be functions that return JSX:

```tsx
columnHelper.accessor('name', {
  header: 'Name',
  cell: (info) => <strong>{info.getValue()}</strong>,
})
```

## `flexRenderCell(table, rowId, columnId)`

The fine-grained per-cell renderer. Inside a keyed `<For>`, the `row`/`cell` objects are
captured once (the reconciler reuses the DOM node and never re-runs the cell body), so plain
`flexRender(cell…, cell.getContext())` **freezes** when a cell value changes in place.
`flexRenderCell` re-navigates to the live cell each read — place it in an accessor and pass
the `table` **accessor** (not `table()`):

```tsx
<For each={() => row.getVisibleCells()} by={(c) => c.id}>
  {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
</For>
```

With the accessor, each cell subscribes to only its own row's version signal (the adapter
tracks which rows' `original` data changed), so an in-place data edit re-runs **just the
changed rows' cells** — a benchmark-verified match for a hand-`React.memo`'d react-table row,
with zero memoization boilerplate. A table-state change (sort/filter/selection/visibility)
re-runs all cells (coarse, correct-by-default for state-reading cells). Returns `null` when
the row isn't in the current (filtered / paginated) row model.

**Reorder-on-data-edit caveat:** a data edit that changes the *sort order* (editing the column
you're sorted by) updates every cell's value but doesn't re-position the keyed rows until the
next structure/state change — a pre-existing base-adapter limitation of the sorted-row-model +
`<For>` interaction (affects plain `flexRender` cells too). Sorting via `toggleSorting` /
`setSorting` works normally.

## Re-exports from `@tanstack/table-core`

Everything from `@tanstack/table-core` is re-exported — `createColumnHelper`, `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`, `getPaginationRowModel`, `getGroupedRowModel`, `getExpandedRowModel`, `getFacetedRowModel`, `getFacetedMinMaxValues`, `getFacetedUniqueValues`, plus types `Table`, `ColumnDef`, `SortingState`, `PaginationState`, `RowData`, `RowSelectionState`, `ColumnFiltersState`, `GroupingState`, `ExpandedState`, etc.

A drift snapshot test in `src/tests/public-surface.test.ts` locks the re-export set — when TanStack adds, renames, or removes an export in a minor bump, the snapshot fails and the diff becomes the deliberate decision moment (run `bunx vitest run --update public-surface` to accept).

## Gotchas

- **`useTable` returns `Computed<Table<TData>>`** — call it (`table()`) to access the table. Reading without calling captures the computed reference, not the instance.
- **Options must be a function** `() => opts`, not a plain object. Signals read inside the function auto-track and the table reconfigures on change.
- **Same instance, version counter** — the table reference is stable across updates; the adapter bumps a version signal so the computed re-emits. Don't compare table references for change detection.
- **`onStateChange` composition** — the adapter wires its own handler that updates internal state, then calls your `onStateChange` after. If you override at the option-level it still runs; if you wire per-field (`onSortingChange`, etc.), only those fire.
- **Sync effect disposes on unmount** via `onUnmount`. The table instance itself has no `dispose` — its lifecycle is the component's.
- **Use `<For>`, not `.map()`** — `.map()` inside a reactive scope rebuilds the whole `<tbody>` on every change (worst-case DOM churn). Keyed `<For>` reuses/moves DOM nodes.
- **Cells that change in place need `flexRenderCell` in an accessor** — a keyed `<For>` reuses the cell and never re-runs its body, so `flexRender(cell…, cell.getContext())` freezes on an in-place value change. `flexRenderCell(table, row.id, cell.column.id)` re-navigates to the live cell.

## Documentation

Full docs: [pyreon.dev/docs/table](https://pyreon.dev/docs/table) (or `docs/src/content/docs/table.md` in this repo).

## License

MIT
