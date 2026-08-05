# @pyreon/table

Pyreon adapter for TanStack Table v9 — reactive `useTable` + `flexRender`.

`@pyreon/table` wraps `@tanstack/table-core` so a Pyreon app gets all the headless table machinery (sorting, filtering, pagination, grouping, expanding, faceting) with signal-driven options. `useTable(() => opts)` returns the `Table` instance **directly**: v9 exposes a pluggable reactivity seam, so the adapter binds every table state slice to a Pyreon signal and reads track natively inside templates and effects — no accessor wrapper, no version counter. `flexRender` handles the four column-def shapes TanStack supports (string, number, function, VNode). `flexRenderCell` gives **fine-grained per-cell updates**: an in-place data edit patches only the changed rows' cells (via per-row signals), matching a hand-memoized `@tanstack/react-table` row with no `React.memo` boilerplate. The TanStack Table author surface is re-exported, so consumers import everything from `@pyreon/table`.

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
  tableFeatures,
  rowSortingFeature,
  createSortedRowModel,
  sortFn_alphanumeric,
  sortFn_basic,
  columnVisibilityFeature,
} from '@pyreon/table'

type Person = { name: string; age: number }

// v9 registers capabilities EXPLICITLY. Define the set ONCE at module scope
// with only what this table uses — that is what keeps the bundle small.
//   rowSortingFeature      → column.toggleSorting / getToggleSortingHandler
//   columnVisibilityFeature → row.getVisibleCells
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  columnVisibilityFeature,
})

const columnHelper = createColumnHelper<typeof features, Person>()
const columns = [
  columnHelper.accessor('name', { header: 'Name' }),
  columnHelper.accessor('age', { header: 'Age', sortFn: 'basic' }),
]

function UserTable() {
  const data = signal<Person[]>([
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
  ])

  const table = useTable(() => ({
    features,
    data: data(),
    columns,
  }))

  // Use <For> (keyed reconciliation) for rows + cells — never `.map()` (which
  // rebuilds the whole <tbody> on every change). `flexRenderCell(table, …)`
  // inside an accessor gives fine-grained per-cell updates.
  return () => (
    <table>
      <thead>
        <For each={() => table.getHeaderGroups()} by={(g) => g.id}>
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
        <For each={() => table.getRowModel().rows} by={(r) => r.id}>
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

## Registering features

TanStack Table v9 exposes an API **only when its feature is registered** — if
`rowSortingFeature` is not in the set, `column.toggleSorting` does not exist, at runtime and
in the types. A `tableFeatures({ ... })` object carries three kinds of entry:

- **Feature modules** — `rowSortingFeature`, `columnFilteringFeature`, `rowPaginationFeature`, … (16 in total, or `...stockFeatures` for all of them)
- **Row-model slots** — `sortedRowModel: createSortedRowModel()`, `filteredRowModel: createFilteredRowModel()`, `paginatedRowModel: createPaginatedRowModel()`, `expandedRowModel`, `groupedRowModel`, `facetedRowModel`, `facetedUniqueValues`, `facetedMinMaxValues`
- **Function registries** — `sortFns`, `filterFns`, `aggregationFns`; their keys are the valid string names for a column's `sortFn` / `filterFn` / `aggregationFn`

The **core row model is automatic** — there is nothing to register for it.

Some entries require another in the same call (`tableFeatures` type-checks this):
`columnResizingFeature` requires `columnSizingFeature`; `globalFilteringFeature` requires
`columnFilteringFeature`; every row-model / registry slot requires its own feature.

Define the set **once, at module scope** — it is a compile-time type parameter
(`Table<TFeatures, TData>`), not runtime configuration.

## `useTable(() => options)`

Create a reactive table instance. **Options are a function** — read signals (data, columns,
state) inside and the table updates automatically.

| Parameter | Type                                       | Description                                    |
| --------- | ------------------------------------------ | ---------------------------------------------- |
| `options` | `() => TableOptions<TFeatures, TData>`     | Function returning TanStack `TableOptions`      |

Returns `Table<TFeatures, TData>` — the **instance**, not a `Computed`. Read it inside a
reactive scope to subscribe: `<For each={() => table.getRowModel().rows}>`.

The adapter installs Pyreon's `coreReactivityFeature` bindings, so every state slice is a
Pyreon signal and every derived row model a Pyreon `computed`. An options change (new `data`,
new `columns`) invalidates the derived row-model atoms natively.

### Reading state

`table.getState()` is gone in v9:

```ts
table.store.state.sorting        // full snapshot, one slice
table.atoms.sorting.get()        // a single slice's atom
table.store.subscribe(fn)        // observe every change
```

Both reads track inside a reactive scope, so a template can bind them directly:
`{() => table.store.state.pagination.pageIndex + 1}`.

### Controlled state

State is controlled **per slice** — the top-level `onStateChange` option is gone. Supplying
an `on<Slice>Change` callback **replaces** the feature's own state updater, so the table stops
self-updating that slice and you own the round trip: feed the value back through `state`.

```ts
import { signal } from '@pyreon/reactivity'
import type { SortingState, PaginationState } from '@pyreon/table'

const sorting = signal<SortingState>([])
const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 10 })

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  state: {
    sorting: sorting(),
    pagination: pagination(),
  },
  onSortingChange: (u) => sorting.set(typeof u === 'function' ? u(sorting.peek()) : u),
  onPaginationChange: (u) =>
    pagination.set(typeof u === 'function' ? u(pagination.peek()) : u),
}))
```

Supplying a callback **without** feeding `state` back makes the slice appear frozen — the
table asked you to update it and nothing did. Omit both to let the table own the slice.

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
`flexRenderCell` re-navigates to the live cell each read — place it in an accessor:

```tsx
<For each={() => row.getVisibleCells()} by={(c) => c.id}>
  {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
</For>
```

A table from `useTable` carries a per-row signal bridge, so each cell subscribes to only its
own row's signal, and an in-place data edit re-runs **just the changed rows' cells** — a
benchmark-verified match for a hand-`React.memo`'d react-table row, with zero memoization
boilerplate. A table built directly with `constructTable` has no bridge; it renders correctly
but subscribes coarsely (every cell re-runs on any change). A table-state change
(sort/filter/selection/visibility) also re-runs all cells — coarse, and correct-by-default for
state-reading cells. Returns `null` when the row isn't in the current (filtered / paginated)
row model.

Works with or without `columnVisibilityFeature`: it uses `row.getVisibleCells()` when the
feature is registered and falls back to the core `row.getAllCells()` otherwise.

**Reorder-on-data-edit caveat:** a data edit that changes the *sort order* (editing the column
you're sorted by) updates every cell's value but doesn't re-position the keyed rows until the
next structure/state change — a pre-existing base-adapter limitation of the sorted-row-model +
`<For>` interaction (affects plain `flexRender` cells too). Sorting via `toggleSorting` /
`setSorting` works normally.

## Migrating from v8

| v8 | v9 |
| --- | --- |
| `table()` | `table` |
| `table.getState()` | `table.store.state` |
| top-level `onStateChange` | per-slice `on<Slice>Change` |
| `getCoreRowModel: getCoreRowModel()` | delete it — the core model is automatic |
| `getSortedRowModel()` / `getFilteredRowModel()` / `getPaginationRowModel()` / … | the matching feature + `create*RowModel()` slot |
| `sortingFns` / column-def `sortingFn` / `SortingFn` | `sortFns` / `sortFn` / `SortFn` |
| pinning `'left'` / `'right'`, `getLeft*` / `getRight*` | `'start'` / `'end'`, `getStart*` / `getEnd*` |
| table option `enablePinning` | `enableColumnPinning` / `enableRowPinning` |
| `columnSizingInfo` state | `columnResizing` state |
| `VisibilityState` | `ColumnVisibilityState` |
| `ColumnDef<T>` / `Table<T>` / `createColumnHelper<T>()` | `ColumnDef<typeof features, T>` / `Table<typeof features, T>` / `createColumnHelper<typeof features, T>()` |

Two behaviour changes worth re-checking by hand:

- **`getIsSomeRowsSelected()` now means "at least one", including all-selected.** An indeterminate checkbox needs `getIsSomeRowsSelected() && !getIsAllRowsSelected()`. The v8 code still compiles — it just shows the indeterminate mark when everything is selected.
- **Row / cell / column / header methods live on shared prototypes.** Never destructure them or pass them as bare callbacks (`const { getValue } = row`, `rows.map(row.getVisibleCells)` both break).

The exhaustive upstream inventory ships in the package:
`node_modules/@tanstack/table-core/skills/migrate-v8-to-v9/SKILL.md`.

## Re-exports from `@tanstack/table-core`

The TanStack Table **author** surface is re-exported — all 16 features
(`rowSortingFeature`, `columnFilteringFeature`, …), every row model
(`createSortedRowModel`, `createFilteredRowModel`, `createPaginatedRowModel`, …), every
built-in filter / sort / aggregation function, plus `tableFeatures`, `stockFeatures`,
`createColumnHelper`, and every type (`Table`, `ColumnDef`, `SortingState`,
`PaginationState`, `RowData`, `RowSelectionState`, `ColumnFiltersState`, `GroupingState`,
`ExpandedState`, `ColumnVisibilityState`, …).

The runtime list is **explicit and curated**, not `export *`: an upstream major is then our
migration rather than yours, and adapter-construction internals (`constructTable`, `memo`,
`assignTableAPIs`, the `core*Feature` objects) never leak into the public API. Types are
re-exported wholesale — they carry no runtime weight.

A drift snapshot test in `src/tests/public-surface.test.ts` locks the re-export set — when TanStack adds, renames, or removes an export in a minor bump, the snapshot fails and the diff becomes the deliberate decision moment (run `bunx vitest run --update public-surface` to accept).

## Gotchas

- **`useTable` returns the `Table` instance** — there is no `table()` call. But reads still belong inside a reactive scope: `each={() => table.getRowModel().rows}` subscribes; a bare `each={table.getRowModel().rows}` reads once and freezes.
- **Options must be a function** `() => opts`, not a plain object. Signals read inside the function auto-track and the table reconfigures on change.
- **Register every feature you use.** A missing `table.nextPage` or `column.toggleSorting` means the feature isn't in `tableFeatures({...})` — add it (plus its row-model slot). Do not cast the table to a broader type.
- **Build the `features` object once at module scope** — it is a compile-time type parameter, not runtime configuration.
- **`row.getVisibleCells()` needs `columnVisibilityFeature`**; the core equivalent is `row.getAllCells()`.
- **A per-slice `on*Change` callback takes ownership of that slice** — supply `state.<slice>` too, or the slice will look frozen.
- **Same instance across updates** — the table reference is stable; its state slices are the signals. Don't compare table references for change detection.
- **Sync effect disposes on unmount** via `onUnmount`, along with the table's reactive subscriptions. The table instance itself has no `dispose` — its lifecycle is the component's.
- **Use `<For>`, not `.map()`** — `.map()` inside a reactive scope rebuilds the whole `<tbody>` on every change (worst-case DOM churn). Keyed `<For>` reuses/moves DOM nodes.
- **Cells that change in place need `flexRenderCell` in an accessor** — a keyed `<For>` reuses the cell and never re-runs its body, so `flexRender(cell…, cell.getContext())` freezes on an in-place value change. `flexRenderCell(table, row.id, cell.column.id)` re-navigates to the live cell.

## Documentation

Full docs: [pyreon.dev/docs/table](https://pyreon.dev/docs/table) (or `docs/src/content/docs/table.md` in this repo).

## License

MIT
