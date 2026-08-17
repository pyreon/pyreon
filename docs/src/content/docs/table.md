---
title: Table
description: Reactive TanStack Table adapter with fine-grained signal integration.
---

`@pyreon/table` is the Pyreon adapter for [TanStack Table](https://tanstack.com/table) v9. It wraps TanStack Table's core with a reactive `useTable` hook whose state lives in Pyreon signals, and provides `flexRender` / `flexRenderCell` for rendering column definitions in Pyreon templates.

<PackageBadge name="@pyreon/table" href="/docs/table" />

## Installation

:::code-group

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

TanStack Table core is included as a dependency — the author surface (all 16 features, every row model, every built-in filter / sort / aggregation function, plus every type) is re-exported, so you import everything from `@pyreon/table`.

<Example file="./examples/table/sortable-table" title="Sortable Table" />

## Registering features

This is the one concept everything else in this guide builds on.

TanStack Table v9 exposes an API **only when its feature is registered**. There is no
implicit "everything is on" surface: if `rowSortingFeature` is not in your feature set,
`column.toggleSorting` does not exist — at runtime *and* in the types. That is what makes a
v9 table tree-shakeable down to what you actually use.

Build the set once with `tableFeatures({ ... })`:

```ts
// @check
import {
  tableFeatures,
  rowSortingFeature,
  createSortedRowModel,
  sortFn_alphanumeric,
  columnVisibilityFeature,
} from '@pyreon/table'

// Define it ONCE, at module scope — it is a compile-time type parameter,
// not runtime configuration.
export const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  columnVisibilityFeature,
})
```

A `tableFeatures` object carries three kinds of entry:

| Entry kind | Examples | What it does |
| --- | --- | --- |
| **Feature modules** | `rowSortingFeature`, `columnFilteringFeature` | Add the feature's options, state slice, and methods |
| **Row-model slots** | `sortedRowModel: createSortedRowModel()` | Supply the pipeline stage that feature needs |
| **Function registries** | `sortFns`, `filterFns`, `aggregationFns` | Their keys become the valid string names for `sortFn` / `filterFn` / `aggregationFn` |

The **core row model is automatic** — there is no `coreRowModel` to register (supply the slot
only if you have a deliberate custom core model).

### The 16 features

| Capability | Feature | Row-model / registry slots |
| --- | --- | --- |
| Sorting | `rowSortingFeature` | `sortedRowModel`, `sortFns` |
| Column filtering | `columnFilteringFeature` | `filteredRowModel`, `filterFns` |
| Global filtering | `globalFilteringFeature` | — (uses the filtered row model) |
| Pagination | `rowPaginationFeature` | `paginatedRowModel` |
| Row expansion | `rowExpandingFeature` | `expandedRowModel` |
| Grouping | `columnGroupingFeature` | `groupedRowModel` |
| Aggregation | `rowAggregationFeature` | `aggregationFns` |
| Column faceting | `columnFacetingFeature` | `facetedRowModel`, `facetedUniqueValues`, `facetedMinMaxValues` |
| Row selection | `rowSelectionFeature` | — |
| Column visibility | `columnVisibilityFeature` | — |
| Column ordering | `columnOrderingFeature` | — |
| Column pinning | `columnPinningFeature` | — |
| Row pinning | `rowPinningFeature` | — |
| Column sizing | `columnSizingFeature` | — |
| Interactive resizing | `columnResizingFeature` | — |
| Cell selection | `cellSelectionFeature` | — |
| Cell spanning | `cellSpanningFeature` | — |

### Prerequisites

Some entries require another feature in the **same** `tableFeatures` call. `tableFeatures`
type-checks this and reports a readable error if you miss one:

- `columnResizingFeature` requires `columnSizingFeature`
- `globalFilteringFeature` requires `columnFilteringFeature`
- Every row-model / registry slot requires its own feature (`sortedRowModel` → `rowSortingFeature`, `filterFns` → `columnFilteringFeature`, `aggregationFns` → `rowAggregationFeature`, the three faceting slots → `columnFacetingFeature`, …)

:::tip[`row.getVisibleCells()` needs `columnVisibilityFeature`]
`getVisibleCells()` is part of the column-visibility feature. Without it, use the core
`row.getAllCells()`. Most examples in this guide register `columnVisibilityFeature` for
exactly that reason. (`flexRenderCell` handles both automatically.)
:::

### `stockFeatures` — the parity shortcut

`stockFeatures` spreads all 16 features at once. It is useful while migrating or in tests,
but it opts you out of tree-shaking, so prefer an explicit set in production:

```ts
// @check
import { tableFeatures, stockFeatures, createSortedRowModel } from '@pyreon/table'

// All 16 features. Row-model slots are still separate — that separation is
// exactly what keeps a real app's feature set tree-shakeable.
const features = tableFeatures({
  ...stockFeatures,
  sortedRowModel: createSortedRowModel(),
})
```

## Migrating from v8

`@pyreon/table` tracks TanStack Table **v9**. The two headline adapter changes:

```ts
// ── v8 ────────────────────────────────────────────────────────────
import { useTable, getCoreRowModel, getSortedRowModel } from '@pyreon/table'

const table = useTable(() => ({
  data: data(),
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
}))

table().getRowModel().rows            // an accessor call
table().getState().sorting            // whole-state read
```

```ts
// ── v9 ────────────────────────────────────────────────────────────
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  createSortedRowModel,
  sortFn_alphanumeric,
} from '@pyreon/table'

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})

const table = useTable(() => ({ features, data: data(), columns }))

table.getRowModel().rows              // no accessor call — `table` IS the instance
table.store.state.sorting             // state lives on the store
```

`useTable` returning the `Table` directly is the Pyreon-side change: v9 has a pluggable
reactivity seam, so the adapter binds table state to Pyreon signals and reads track
natively. The v8 `Computed<Table>` wrapper existed only because v8 had no such seam.

**What has not changed:** options are still a **function**, so signal reads inside stay
tracked; and reads still have to happen inside a reactive scope in JSX —
`{() => table.getRowModel().rows}`, never a bare `{table.getRowModel().rows}`.

### Mapping table

| v8 | v9 |
| --- | --- |
| `table()` | `table` |
| `table.getState()` | `table.store.state` |
| top-level `onStateChange` | per-slice `onSortingChange` / `onPaginationChange` / … |
| `getCoreRowModel: getCoreRowModel()` | **delete it** — the core model is automatic |
| `getSortedRowModel: getSortedRowModel()` | `rowSortingFeature` + `sortedRowModel: createSortedRowModel()` |
| `getFilteredRowModel: getFilteredRowModel()` | `columnFilteringFeature` + `filteredRowModel: createFilteredRowModel()` |
| `getPaginationRowModel: getPaginationRowModel()` | `rowPaginationFeature` + `paginatedRowModel: createPaginatedRowModel()` |
| `getExpandedRowModel: getExpandedRowModel()` | `rowExpandingFeature` + `expandedRowModel: createExpandedRowModel()` |
| `getGroupedRowModel: getGroupedRowModel()` | `columnGroupingFeature` + `groupedRowModel: createGroupedRowModel()` |
| `getFacetedRowModel()` / `getFacetedUniqueValues()` / `getFacetedMinMaxValues()` | `columnFacetingFeature` + `facetedRowModel` / `facetedUniqueValues` / `facetedMinMaxValues` slots |
| `sortingFns` registry | `sortFns` slot |
| column-def `sortingFn` | `sortFn` |
| `column.getSortingFn()` | `column.getSortFn()` |
| `SortingFn` type | `SortFn` |
| `columnPinning.left` / `.right` | `.start` / `.end` |
| `column.pin('left' \| 'right')` | `column.pin('start' \| 'end')` |
| `table.getLeft*()` / `getRight*()` | `table.getStart*()` / `getEnd*()` |
| table option `enablePinning` | `enableColumnPinning` / `enableRowPinning` |
| `columnSizingInfo` state | `columnResizing` state |
| `setColumnSizingInfo` / `onColumnSizingInfoChange` | `setColumnResizing` / `onColumnResizingChange` |
| `VisibilityState` type | `ColumnVisibilityState` |
| `ColumnDef<Person>` | `ColumnDef<typeof features, Person>` |
| `Table<Person>` / `Row<Person>` / `Cell<Person, V>` | `Table<typeof features, Person>` / `Row<…>` / `Cell<…>` |
| `createColumnHelper<Person>()` | `createColumnHelper<typeof features, Person>()` |
| `row._getAllCellsByColumnId()` | `row.getAllCellsByColumnId()` |

### Behaviour changes to re-check

- **`getIsSomeRowsSelected()` now means "at least one", including the all-selected case.** It
  no longer means "some but not all", so an indeterminate checkbox needs both predicates:
  `table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()` (and
  `getIsSomePageRowsSelected() && !getIsAllPageRowsSelected()` for a page checkbox). This is
  a **silent** change — the old code still compiles and still runs, it just shows the
  indeterminate mark when everything is selected.
- **Row, cell, column, and header methods live on shared prototypes.** Never destructure them
  or pass them as bare callbacks: `const { getValue } = row` and `rows.map(row.getVisibleCells)`
  both break. Call them on the instance — `row.getValue('name')`,
  `rows.map((row) => row.getVisibleCells())`. Table-instance methods are not affected.
- **Pinning is logical, not physical.** `start`/`end` name a region, they do not apply CSS
  direction. Use `inset-inline-start` / `inset-inline-end` for sticky columns.
- **`RowData` is `Record<string, any> | Array<any>`** (was `unknown`). A table of primitives
  must be wrapped in an object or array shape.
- **Underscore-prefixed internals are gone.** Use the public replacement; do not guess.

:::tip[Exhaustive list]
The full upstream inventory ships inside the package:
`node_modules/@tanstack/table-core/skills/migrate-v8-to-v9/SKILL.md`. It covers aggregation
redesign, per-table meta slots, external atoms, and the complete audit checklist.
:::

## Basic Usage

Use `useTable` to create a reactive table instance. Options are passed as a function so
reactive signals (data, columns, state) can be read inside and the table updates
automatically.

```tsx
// @check
import { defineComponent, For } from '@pyreon/core'
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

interface Person {
  name: string
  age: number
  email: string
}

// One feature set, module scope. `rowSortingFeature` is what gives columns
// `toggleSorting` / `getToggleSortingHandler`; `columnVisibilityFeature` is
// what gives rows `getVisibleCells`.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  columnVisibilityFeature,
})

const columnHelper = createColumnHelper<typeof features, Person>()

const columns = [
  columnHelper.accessor('name', { header: 'Name' }),
  columnHelper.accessor('age', { header: 'Age' }),
  columnHelper.accessor('email', { header: 'Email' }),
]

const PeopleTable = defineComponent(() => {
  const data = signal<Person[]>([
    { name: 'Alice', age: 30, email: 'alice@example.com' },
    { name: 'Bob', age: 25, email: 'bob@example.com' },
  ])

  const table = useTable(() => ({
    features,
    data: data(),
    columns,
  }))

  return () => (
    <table>
      <thead>
        <For each={() => table.getHeaderGroups()} by={(g) => g.id}>
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
        <For each={() => table.getRowModel().rows} by={(r) => r.id}>
          {(row) => (
            <tr>
              <For each={() => visibleCells(table, row.id)} by={(c) => c.id}>
                {/* Fine-grained: `flexRenderCell` inside an accessor so a
                    single-cell edit patches ONLY this cell — no re-render of
                    the row or table, no memoization boilerplate. */}
                {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
})
```

Two things to note:

- **`table` is the instance, not an accessor.** There is no `table()` call. But every read
  still belongs inside a reactive scope — `each={() => table.getHeaderGroups()}` is what
  subscribes. A bare `each={table.getHeaderGroups()}` reads once and freezes.
- **Use `<For>` (not `.map()`)** for the rows and cells: it keeps Pyreon's keyed
  reconciliation (DOM nodes are reused / moved, not rebuilt), and `flexRenderCell` inside an
  accessor gives fine-grained per-cell updates. A plain `.map()` rebuilds the whole
  `<tbody>` on every change — the worst-case DOM churn.

## `useTable`

```ts
function useTable<TFeatures extends TableFeatures, TData extends RowData>(
  options: () => TableOptions<TFeatures, TData>,
): Table<TFeatures, TData>
```

Creates a reactive TanStack Table instance and returns it **directly**. The instance is
stable; its state lives in Pyreon signals, so reading it inside any reactive scope — a JSX
accessor, an `effect`, a `computed` — subscribes natively.

### How It Works

Internally, `useTable`:

1. Registers Pyreon's `coreReactivityFeature` bindings (`pyreonReactivity()`) so every
   table state slice is backed by a Pyreon signal and every derived row model by a Pyreon
   `computed`. The table's reactive graph *is* Pyreon's graph.
2. Creates the table instance once via `constructTable()` with the resolved options.
3. Sets up a reactive `effect()` that re-syncs options whenever a signal read inside the
   options function changes. `table.options` is itself an atom, so an options change
   invalidates the derived row-model atoms natively.
4. Maintains **per-row version signals** so `flexRenderCell` cells subscribe to only their
   own row — an in-place data edit re-runs just the changed rows' cells (see
   [Fine-grained cell updates](#fine-grained-cell-updates)).
5. Registers an `onUnmount` callback to dispose the effects and the table's reactive
   subscriptions when the component unmounts.

There is no version counter and no whole-state structural diff — both were v8 workarounds
for the absence of a reactivity seam.

### Reactive Options

Because options are passed as a function, you can use signals for dynamic data. When any
signal read inside the options function changes, the table options are updated and the table
re-evaluates.

```ts
const data = signal<Person[]>([])
const columns = signal<ColumnDef<typeof features, Person>[]>([
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'age', header: 'Age' },
])

const table = useTable(() => ({
  features,
  data: data(),
  columns: columns(),
}))

// Table updates automatically when data or columns change:
data.set([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
])
// table.getRowModel().rows now has 2 rows

columns.set([{ accessorKey: 'name', header: 'Name' }])
// table now has 1 column
```

### Reactive Derived State

Use `computed()` to derive values from the table. Because the table's row models are
signal-backed, these derived computeds update automatically:

```ts
import { computed } from '@pyreon/reactivity'

const data = signal<Person[]>(defaultData)

const table = useTable(() => ({ features, data: data(), columns }))

const rowCount = computed(() => table.getRowModel().rows.length)
rowCount() // 3

data.set([...defaultData, { name: 'Diana', age: 28 }])
rowCount() // 4

data.set([defaultData[0]])
rowCount() // 1
```

### Reading table state

`table.getState()` is gone. v9 exposes state through the store and per-slice atoms:

| You want | Use |
| --- | --- |
| The full current snapshot | `table.store.state` |
| One current slice | `table.atoms.sorting.get()` |
| To observe every change | `table.store.subscribe(fn)` |

```ts
table.store.state.sorting            // [{ id: 'age', desc: false }]
table.store.state.pagination         // { pageIndex: 0, pageSize: 10 }
table.atoms.rowSelection.get()       // { '0': true }
```

Both reads track when performed inside a reactive scope, so a template can bind them
directly:

```tsx
<span>Page {() => table.store.state.pagination.pageIndex + 1}</span>
```

A slice only exists on the state when its feature is registered — `table.store.state.sorting`
requires `rowSortingFeature`, and TypeScript enforces it.

### Fine-grained cell updates

Render live cells with **`flexRenderCell(table, row.id, cell.column.id)`** inside an
accessor. This is the fine-grained per-cell primitive: on an in-place data edit it patches
**only** the changed rows' cells — no row re-render, no table re-render, and no memoization
boilerplate.

```tsx
<For each={() => table.getRowModel().rows} by={(r) => r.id}>
  {(row) => (
    <tr>
      <For each={() => visibleCells(table, row.id)} by={(c) => c.id}>
        {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
      </For>
    </tr>
  )}
</For>
```

Three rules make it fine-grained:

- **Use `visibleCells(table, row.id)` for the inner cells loop, not `row.getVisibleCells()`.**
  The captured `row`'s `getVisibleCells()` is a *tracked* table-core read whose memo deps read
  `table.options` — and the options atom changes on **every** options sync, data edits
  included. With it, a single-cell edit re-runs every row's cells-list accessor (measured:
  1000 re-runs at N=1000 where 1 is correct — enough to make the edit ~3× slower than a
  memoized react-table). `visibleCells` subscribes to the row's own signal plus the
  column-geometry state slices (visibility, order, pinning, grouping) and looks the cells up
  untracked from the *current* row model, so the edit reaches exactly the edited rows' loops
  while a real visibility/order/pinning change still re-reconciles every row's cell list.
- **Pass a table from `useTable`.** That table carries a per-row signal bridge, so each cell
  subscribes to only its own row's signal (the adapter tracks which rows' `original` data
  changed). A table built directly with `constructTable` has no bridge — it still renders
  correctly, but subscribes to the row-model atom instead, so every cell re-runs on any
  change.
- **Wrap it in an explicit accessor `{() => …}`.** Inside a keyed `<For>`, the `row` / `cell`
  objects are captured once (the reconciler reuses the DOM node and never re-runs the cell
  body). Plain `flexRender(cell.column.columnDef.cell, cell.getContext())` therefore *freezes*
  when a cell value changes in place. `flexRenderCell` re-navigates to the live cell each
  read.

A table-**state** change (sort, filter, selection, column visibility) re-runs all cells
(coarse — correct by default for cells that render state, e.g. a selection checkbox). An
in-place **data** edit is the fine-grained path.

:::caution Reorder-on-data-edit limitation
A data edit that changes the **sort order** (editing the very column you're sorted by)
updates every cell to the correct value but does **not** re-position the keyed rows until
the next structure/state change. This is a pre-existing base-adapter limitation of the
sorted-row-model + `<For>` interaction (it affects plain `flexRender` cells too — not
just `flexRenderCell`). Re-ordering via the sort controls (`toggleSorting` / `setSorting`)
works normally. Workaround: re-apply sorting after such an edit, or sort by a column you
don't edit in place.
:::

### Binding per-cell values that change (column width, sort indicators)

When a table value changes on a **state-only** update — a column resize (`getSize()`), a sort
direction indicator, a visibility flag — bind it **reactively at the point of use**, not as a
static prop.

The table *does* re-notify on these changes (its state slices are signals). But a keyed
`<For>` reuses each cell by key and does **not** re-run the cell's body on a state change —
that's how keyed reconciliation stays fast. So a value captured once at first mount (a static
prop or a static style) freezes:

```tsx
// ❌ Frozen on resize — width is captured once when the cell first mounts,
//    and the keyed <For> never re-runs this cell body.
<For each={() => table.getHeaderGroups()[0].headers} by={(h) => h.id}>
  {(header) => <th style={{ width: header.getSize() + 'px' }}>…</th>}
</For>
```

```tsx
// ✅ Tracks the resize — the width is read inside a reactive style closure,
//    so it re-subscribes and updates when column sizing changes.
<For each={() => table.getHeaderGroups()[0].headers} by={(h) => h.id}>
  {(header) => (
    <th style={() => ({ width: `${table.getColumn(header.column.id)!.getSize()}px` })}>
      …
    </th>
  )}
</For>
```

This is fundamental fine-grained reactivity (the same as Solid's `<For>`): read reactive
values **inside** a reactive scope at the point they're used. A value passed as a static prop
through a keyed list is captured once. The same applies to any per-cell value that changes
without the row identity changing.

### State Change Callbacks

v9 removed the top-level `onStateChange` option. State is controlled **per slice**, with
`on<Slice>Change` callbacks.

**Supplying a per-slice callback puts that slice into controlled mode.** Each feature
installs a default `on<Slice>Change` that writes the slice's internal atom; your callback
*replaces* it, so the table stops self-updating that slice. You own the round trip: write
your signal, read it back through `state`.

```ts
const sorting = signal<SortingState>([])

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  // `sorting` is now CONTROLLED — core no longer writes it internally.
  state: { sorting: sorting() },
  onSortingChange: (updater) => {
    sorting.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
}))
```

The loop closes because the options function reads `sorting()`: the callback writes the
signal, `options()` re-runs, and `useTable`'s effect pushes the new `state` back into the
table.

:::caution A callback without `state` is a dead end
If you supply `onSortingChange` but never feed `state.sorting` back, sorting will appear to
do nothing — the table asked you to update the state and you never did. Either supply both,
or supply neither and let the table own the slice internally.
:::

Omit both and the slice is fully internal — the common case:

```ts
// Uncontrolled: the table owns `sorting` itself.
const table = useTable(() => ({ features, data: data(), columns }))

table.getColumn('age')!.toggleSorting(false)
table.store.state.sorting // [{ id: 'age', desc: false }]
```

### Handling Updaters

State change callbacks receive an `Updater<T>` which can be either a function or a direct
value. Always handle both cases:

```ts
onSortingChange: (updater) => {
  sorting.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
}
```

This pattern applies to every `on*Change` callback: `onSortingChange`, `onPaginationChange`,
`onColumnFiltersChange`, `onGlobalFilterChange`, `onRowSelectionChange`,
`onColumnVisibilityChange`, `onColumnOrderChange`, `onColumnPinningChange`,
`onColumnSizingChange`, `onColumnResizingChange`, `onExpandedChange`, `onGroupingChange`.

### Cleanup

`useTable` registers an `onUnmount` callback that disposes its internal effects and the
table's reactive subscriptions. No manual cleanup is needed.

## `flexRender`

```ts
function flexRender<TValue>(
  component: ((props: TValue) => unknown) | string | number | null | undefined,
  props: TValue,
): unknown
```

Renders a TanStack Table column definition template (header, cell, or footer). Handles:

- **Strings and numbers** — returned as-is (e.g., `"Name"` or `42`)
- **Functions** — called with the provided props (render functions or components)
- **VNodes** — passed through to the renderer (detected by checking for `type`, `props`, and `children` properties)
- **null/undefined** — returns `null`
- **Other types** (booleans, plain objects) — returns `null`

```tsx
// Header
flexRender(header.column.columnDef.header, header.getContext())

// Cell
flexRender(cell.column.columnDef.cell, cell.getContext())

// Footer
flexRender(footer.column.columnDef.footer, footer.getContext())
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
  columnHelper.display({
    id: 'actions',
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

## `flexRenderCell`

```ts
function flexRenderCell<TFeatures extends TableFeatures, TData extends RowData>(
  table: Table<TFeatures, TData>,
  rowId: string,
  columnId: string,
): unknown
```

The fine-grained per-cell renderer. Where `flexRender` renders a cell from a captured
`cell` object (which freezes inside a keyed `<For>` when the value changes), `flexRenderCell`
re-navigates to the **live** cell from the current row model on every read. Place it inside
an accessor:

```tsx
<For each={() => visibleCells(table, row.id)} by={(c) => c.id}>
  {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
</For>
```

- A table from **`useTable`** carries a per-row signal bridge, so each cell subscribes to only
  its own row's signal — an in-place data edit re-runs just the changed rows' cells, matching
  a hand-memoized `@tanstack/react-table` row with no `React.memo` boilerplate.
- A table built directly with `constructTable` has no bridge; it still renders correctly but
  subscribes coarsely (every cell re-runs on any change).
- Works with or without `columnVisibilityFeature` — it uses `row.getVisibleCells()` when the
  feature is registered and falls back to the core `row.getAllCells()` otherwise.
- Returns `null` when the row is not in the current (filtered / paginated) row model.

See [Fine-grained cell updates](#fine-grained-cell-updates) for the full pattern and the
reorder-on-data-edit caveat.

## Column Definitions

TanStack Table offers several column types, all re-exported from `@pyreon/table`. Every
column-definition type takes the feature set as its **first** generic parameter.

### Using `createColumnHelper`

The type-safe way to define columns:

```tsx
import { createColumnHelper, tableFeatures, columnVisibilityFeature } from '@pyreon/table'

interface Person {
  name: string
  age: number
  email: string
  department: { name: string; id: number }
}

const features = tableFeatures({ columnVisibilityFeature })

// The helper takes <TFeatures, TData> — pass `typeof features` first.
const columnHelper = createColumnHelper<typeof features, Person>()

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

:::tip[Preserve per-column value types]
Wrap the array with `columnHelper.columns([...])` when you want each column's individual
`TValue` preserved instead of widened:

```ts
const columns = columnHelper.columns([
  columnHelper.accessor('name', { header: 'Name' }),
  columnHelper.accessor('age', { header: 'Age' }),
])
```
:::

### Using Plain Column Definitions

You can also define columns as plain objects:

```ts
import type { ColumnDef } from '@pyreon/table'

const columns: ColumnDef<typeof features, Person>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'age',
    header: 'Age',
  },
  {
    id: 'fullInfo',
    accessorFn: (row) => `${row.name} (${row.age})`,
    header: 'Summary',
  },
]
```

### Column Groups

Group related columns under a shared header:

```ts
const columns = [
  columnHelper.group({
    id: 'personal',
    header: 'Personal Info',
    columns: columnHelper.columns([
      columnHelper.accessor('name', { header: 'Name' }),
      columnHelper.accessor('age', { header: 'Age' }),
    ]),
  }),
  columnHelper.group({
    id: 'contact',
    header: 'Contact',
    columns: columnHelper.columns([
      columnHelper.accessor('email', { header: 'Email' }),
      columnHelper.accessor((row) => row.department.name, {
        id: 'departmentName',
        header: 'Department',
      }),
    ]),
  }),
]
```

## Sorting

### Basic Sorting

Register `rowSortingFeature` plus the `sortedRowModel` slot:

```tsx
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  createSortedRowModel,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
} from '@pyreon/table'

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  // The registry's KEYS are the valid string names for `sortFn` in a column
  // def. Import only the built-ins you actually name.
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
  },
})

const table = useTable(() => ({ features, data: data(), columns }))
```

With no controlled state, the table owns the sorting slice. Toggle sorting on a column:

```ts
// Toggle sorting on the "age" column
table.getColumn('age')!.toggleSorting(false) // ascending
table.getColumn('age')!.toggleSorting(true) // descending

// Check current sort state
table.store.state.sorting
// [{ id: 'age', desc: false }]
```

### Controlled Sorting

For full control over sort state, manage it with a signal. Supplying `onSortingChange`
takes ownership of the slice, so you must also feed `state.sorting` back:

```tsx
import type { SortingState } from '@pyreon/table'

const sorting = signal<SortingState>([])

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  state: { sorting: sorting() },
  onSortingChange: (updater) => {
    sorting.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
}))
```

### Multi-Column Sorting

Enable multi-column sorting so users can sort by multiple columns:

```ts
const table = useTable(() => ({
  features,
  data: data(),
  columns,
  enableMultiSort: true,
}))
```

### Sortable Header Component

```tsx
function SortableHeader({ column, label }) {
  const sorted = column.getIsSorted()
  return (
    <button
      onClick={() => column.toggleSorting()}
      style={{ cursor: 'pointer', fontWeight: 'bold' }}
    >
      {label}
      {sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ''}
    </button>
  )
}

const columns = [
  columnHelper.accessor('name', {
    header: ({ column }) => <SortableHeader column={column} label="Name" />,
  }),
  columnHelper.accessor('age', {
    header: ({ column }) => <SortableHeader column={column} label="Age" />,
    // `sortFn` (v8: `sortingFn`). The string must be a key of the `sortFns`
    // registry in this table's feature set.
    sortFn: 'basic', // numeric sorting
  }),
]
```

### Custom Sort Functions

A column's `sortFn` can be an inline function, or a custom entry in the `sortFns` registry:

```ts
// Inline on the column definition
columnHelper.accessor('priority', {
  header: 'Priority',
  sortFn: (rowA, rowB, columnId) => {
    const order = { high: 3, medium: 2, low: 1 }
    const a = order[rowA.getValue(columnId)] ?? 0
    const b = order[rowB.getValue(columnId)] ?? 0
    return a - b
  },
})
```

```ts
// Or register it once and name it by string
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    priority: (rowA, rowB, columnId) => {
      const order = { high: 3, medium: 2, low: 1 }
      return (order[rowA.getValue(columnId)] ?? 0) - (order[rowB.getValue(columnId)] ?? 0)
    },
  },
})

columnHelper.accessor('priority', { header: 'Priority', sortFn: 'priority' })
```

Read a column's resolved sort function with `column.getSortFn()` (v8: `getSortingFn()`).

## Filtering

### Column Filters

Filter individual columns with `columnFilteringFeature` + the `filteredRowModel` slot:

```tsx
import {
  useTable,
  tableFeatures,
  columnFilteringFeature,
  createFilteredRowModel,
  filterFn_includesString,
  filterFn_inNumberRange,
} from '@pyreon/table'
import type { ColumnFiltersState } from '@pyreon/table'

const features = tableFeatures({
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    inNumberRange: filterFn_inNumberRange,
  },
})

const columnFilters = signal<ColumnFiltersState>([])

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  state: { columnFilters: columnFilters() },
  onColumnFiltersChange: (updater) => {
    columnFilters.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
}))
```

Set a filter value on a column:

```ts
table.getColumn('name')!.setFilterValue('Ali')
// Only rows where "name" includes "Ali" are shown
```

### Automatic Filtering

Without controlled state, the table manages filter state internally:

```ts
const table = useTable(() => ({ features, data: data(), columns }))

// Set a filter directly on the column
table.getColumn('name')!.setFilterValue('Ali')
const filtered = table.getRowModel().rows
// filtered has 1 row: Alice
```

### Global Filter

Apply a single search query across all columns. `globalFilteringFeature` **requires**
`columnFilteringFeature` — the global filter is applied by the filtered row model, not by a
model of its own:

```tsx
const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
})

const globalFilter = signal('')

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  globalFilterFn: 'includesString',
  state: { globalFilter: globalFilter() },
  onGlobalFilterChange: (updater) => {
    globalFilter.update((prev) =>
      typeof updater === 'function' ? updater(prev) : updater
    )
  },
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

`filterFn` keeps its v8 name (only *sorting* was renamed):

```ts
columnHelper.accessor('age', {
  header: 'Age',
  filterFn: (row, columnId, filterValue) => {
    const age = row.getValue<number>(columnId)
    const [min, max] = filterValue as [number, number]
    return age >= min && age <= max
  },
})

// Usage: filter ages between 20 and 35
table.getColumn('age')!.setFilterValue([20, 35])
```

### Filter Input Component

```tsx
function ColumnFilter({ column }) {
  return (
    <input
      type="text"
      value={(column.getFilterValue() ?? '') as string}
      onInput={(e) => column.setFilterValue(e.target.value)}
      placeholder={`Filter ${column.id}...`}
      style={{ width: '100%', padding: '4px' }}
    />
  )
}

// In the header:
<For each={() => table.getHeaderGroups()} by={(g) => g.id}>
  {(headerGroup) => (
    <tr>
      <For each={() => headerGroup.headers} by={(h) => h.id}>
        {(header) => (
          <th>
            {flexRender(header.column.columnDef.header, header.getContext())}
            {header.column.getCanFilter() && <ColumnFilter column={header.column} />}
          </th>
        )}
      </For>
    </tr>
  )}
</For>
```

### Faceted Filters

Faceting powers filter UIs that need the available values or the numeric range of a column.
Register `columnFacetingFeature` plus the slots you use:

```ts
import {
  tableFeatures,
  columnFilteringFeature,
  columnFacetingFeature,
  createFilteredRowModel,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFacetedMinMaxValues,
  filterFn_includesString,
} from '@pyreon/table'

const features = tableFeatures({
  columnFilteringFeature,
  columnFacetingFeature,
  filteredRowModel: createFilteredRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  filterFns: { includesString: filterFn_includesString },
})

// Build a select from the distinct values in a column:
const options = [...table.getColumn('department')!.getFacetedUniqueValues().keys()]

// Build a range slider from a numeric column:
const [min, max] = table.getColumn('salary')!.getFacetedMinMaxValues() ?? [0, 0]
```

## Pagination

### Client-Side Pagination

```tsx
import {
  useTable,
  tableFeatures,
  rowPaginationFeature,
  createPaginatedRowModel,
} from '@pyreon/table'
import type { PaginationState } from '@pyreon/table'

const features = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 10 })

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  state: { pagination: pagination() },
  onPaginationChange: (updater) => {
    pagination.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
}))
```

### Automatic Pagination

Without controlled state, pagination is managed internally with a default page size of 10:

```ts
const bigData = Array.from({ length: 25 }, (_, i) => ({
  name: `Person ${i}`,
  age: 20 + i,
}))

const table = useTable(() => ({ features, data: bigData, columns }))

table.getRowModel().rows.length // 10 (first page)
table.getCanNextPage() // true
table.getCanPreviousPage() // false

table.nextPage()
table.getRowModel().rows.length // 10 (second page)
table.getRowModel().rows[0].original.name // "Person 10"

table.nextPage()
table.getRowModel().rows.length // 5 (last page, only 5 remaining)
table.getCanNextPage() // false
```

### Pagination Controls

```tsx
function PaginationControls({ table }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
      <button onClick={() => table.firstPage()} disabled={() => !table.getCanPreviousPage()}>
        {'<<'}
      </button>
      <button onClick={() => table.previousPage()} disabled={() => !table.getCanPreviousPage()}>
        {'<'}
      </button>
      <span>
        Page {() => table.store.state.pagination.pageIndex + 1} of {() => table.getPageCount()}
      </span>
      <button onClick={() => table.nextPage()} disabled={() => !table.getCanNextPage()}>
        {'>'}
      </button>
      <button onClick={() => table.lastPage()} disabled={() => !table.getCanNextPage()}>
        {'>>'}
      </button>
      <select
        value={() => table.store.state.pagination.pageSize}
        onChange={(e) => table.setPageSize(Number(e.target.value))}
      >
        <For each={() => [10, 20, 50, 100]} by={(size) => size}>
          {(size) => <option value={size}>Show {size}</option>}
        </For>
      </select>
    </div>
  )
}
```

Note the accessors on `disabled` and on the page text: those values change on a state-only
update, so they have to be read inside a reactive scope (see
[Binding per-cell values that change](#binding-per-cell-values-that-change-column-width-sort-indicators)).

### Page Size Selector

```ts
// Change page size programmatically
table.setPageSize(25)

// Go to a specific page
table.setPageIndex(2) // third page (zero-indexed)
```

### Server-Side Pagination

For server-side pagination, manage the data fetching externally and set `manualPagination`.
The pagination feature stays registered (that is what provides `nextPage`, `getPageCount`,
…); `manualPagination` just tells the row model that the rows arrive already paginated:

```tsx
import { signal } from '@pyreon/reactivity'

const data = signal<Person[]>([])
const totalRows = signal(0)
const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 20 })

async function fetchPage(pageIndex: number, pageSize: number) {
  const response = await fetch(`/api/people?page=${pageIndex}&size=${pageSize}`)
  const result = await response.json()
  data.set(result.items)
  totalRows.set(result.total)
}

// Initial fetch
fetchPage(0, 20)

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  // Supply `rowCount` and the table derives `pageCount` for you.
  rowCount: totalRows(),
  state: { pagination: pagination() },
  onPaginationChange: (updater) => {
    const newPagination = typeof updater === 'function' ? updater(pagination.peek()) : updater
    pagination.set(newPagination)
    fetchPage(newPagination.pageIndex, newPagination.pageSize)
  },
  manualPagination: true,
}))
```

## Row Selection

### Enabling Row Selection

```tsx
import { useTable, tableFeatures, rowSelectionFeature } from '@pyreon/table'
import type { RowSelectionState } from '@pyreon/table'

const features = tableFeatures({ rowSelectionFeature })

// NOTE: in v9 `RowSelectionState` is `Record<string, true>` — an unselected
// row is absent from the record, not present with `false`.
const rowSelection = signal<RowSelectionState>({})

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  state: { rowSelection: rowSelection() },
  onRowSelectionChange: (updater) => {
    rowSelection.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
  enableRowSelection: true,
}))
```

### Automatic Row Selection

Without controlled state, selection works out of the box:

```ts
const table = useTable(() => ({
  features,
  data: data(),
  columns,
  enableRowSelection: true,
}))

table.getSelectedRowModel().rows // []

table.getRowModel().rows[0].toggleSelected(true)
table.getSelectedRowModel().rows // [first row]

table.getRowModel().rows[0].toggleSelected(false)
table.getSelectedRowModel().rows // []
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
        // v9: getIsSomeRowsSelected() means "at least one", INCLUDING all —
        // so the all-selected case must be excluded explicitly.
        indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
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

:::caution `getIsSomeRowsSelected()` changed meaning in v9
In v8 it meant "some but not all". In v9 it means **at least one**, including the
all-selected case. Code written for v8 still compiles and still runs — it just shows the
indeterminate mark when everything is selected. Pair it with `!getIsAllRowsSelected()` (or
`getIsSomePageRowsSelected() && !getIsAllPageRowsSelected()` for a page-level checkbox).
:::

### Getting Selected Rows

```ts
// Get selected row models
const selectedRows = table.getSelectedRowModel().rows

// Get selected row data
const selectedData = selectedRows.map((row) => row.original)

// Check how many are selected
const selectedCount = Object.keys(table.store.state.rowSelection).length
```

### Conditional Row Selection

```ts
const table = useTable(() => ({
  features,
  data: data(),
  columns,
  enableRowSelection: (row) => row.original.status !== 'locked',
}))
```

## Column Visibility

Toggle columns on and off. This feature also provides `row.getVisibleCells()`:

```tsx
import { useTable, tableFeatures, columnVisibilityFeature } from '@pyreon/table'
import type { ColumnVisibilityState } from '@pyreon/table'

const features = tableFeatures({ columnVisibilityFeature })

// v8's `VisibilityState` is now `ColumnVisibilityState`.
const columnVisibility = signal<ColumnVisibilityState>({})

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  state: { columnVisibility: columnVisibility() },
  onColumnVisibilityChange: (updater) => {
    columnVisibility.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
}))
```

### Automatic Column Visibility

```ts
const table = useTable(() => ({ features, data: data(), columns }))

table.getVisibleFlatColumns().length // 2

table.getColumn('age')!.toggleVisibility(false)
table.getVisibleFlatColumns().length // 1
table.getVisibleFlatColumns()[0].id // "name"

table.getColumn('age')!.toggleVisibility(true)
table.getVisibleFlatColumns().length // 2
```

### Column Visibility Toggle UI

```tsx
function ColumnToggle({ table }) {
  return (
    <div style={{ padding: '8px' }}>
      <label>
        <input
          type="checkbox"
          checked={() => table.getIsAllColumnsVisible()}
          onChange={table.getToggleAllColumnsVisibilityHandler()}
        />
        Toggle All
      </label>
      <For each={() => table.getAllLeafColumns()} by={(c) => c.id}>
        {(column) => (
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={() => column.getIsVisible()}
              onChange={column.getToggleVisibilityHandler()}
            />
            {column.id}
          </label>
        )}
      </For>
    </div>
  )
}
```

## Column Ordering

Reorder columns programmatically:

```tsx
import { useTable, tableFeatures, columnOrderingFeature } from '@pyreon/table'
import type { ColumnOrderState } from '@pyreon/table'

const features = tableFeatures({ columnOrderingFeature })

const columnOrder = signal<ColumnOrderState>([])

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  state: { columnOrder: columnOrder() },
  onColumnOrderChange: (updater) => {
    columnOrder.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
}))

// Reorder columns
columnOrder.set(['email', 'name', 'age'])
```

## Column Pinning

v9 pinning is **logical**: the regions are `start` and `end`, not `left` and `right`. In an
LTR layout `start` is on the left; in RTL it is on the right.

```tsx
import { useTable, tableFeatures, columnPinningFeature } from '@pyreon/table'
import type { ColumnPinningState } from '@pyreon/table'

const features = tableFeatures({ columnPinningFeature })

const columnPinning = signal<ColumnPinningState>({ start: [], end: [] })

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  // v8's table-level `enablePinning` split into two options. The
  // COLUMN-level `enablePinning` in a column def is unchanged.
  enableColumnPinning: true,
  state: { columnPinning: columnPinning() },
  onColumnPinningChange: (updater) => {
    columnPinning.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
}))

table.getColumn('name')!.pin('start')
table.getColumn('actions')!.pin('end')
table.getColumn('name')!.getIsPinned() // 'start'
table.getColumn('name')!.pin(false) // unpin
```

The whole `getLeft*` / `getRight*` method family is now `getStart*` / `getEnd*` —
`table.getStartHeaderGroups()`, `table.getEndLeafColumns()`, `row.getStartVisibleCells()`,
and so on.

:::caution Logical naming does not apply CSS
`start` / `end` name a region; they do not set direction. Use logical CSS properties for
sticky columns so the layout follows the writing direction:

```tsx
<th
  style={() => ({
    position: 'sticky',
    insetInlineStart: `${header.column.getStart('start')}px`,
  })}
>
```
:::

## Column Sizing and Resizing

v8's combined sizing feature is two tree-shakeable features in v9:

- `columnSizingFeature` — sizes, offsets, and total-size APIs (`getSize`, `getStart`, `getTotalSize`)
- `columnResizingFeature` — interactive drag handles and the transient resize state. It **requires** `columnSizingFeature`.

```tsx
import {
  useTable,
  tableFeatures,
  columnSizingFeature,
  columnResizingFeature,
} from '@pyreon/table'

const features = tableFeatures({
  columnSizingFeature,
  columnResizingFeature, // requires columnSizingFeature
})

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  columnResizeMode: 'onChange',
}))
```

Render a drag handle from the header:

```tsx
<For each={() => table.getHeaderGroups()[0].headers} by={(h) => h.id}>
  {(header) => (
    <th style={() => ({ width: `${table.getColumn(header.column.id)!.getSize()}px` })}>
      {flexRender(header.column.columnDef.header, header.getContext())}
      <div
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        class="resizer"
      />
    </th>
  )}
</For>
```

The transient resize state was renamed: v8's `columnSizingInfo` is v9's `columnResizing`,
with `setColumnResizing` and `onColumnResizingChange`. The persisted sizes are still
`columnSizing` / `setColumnSizing` / `onColumnSizingChange`.

```ts
table.store.state.columnSizing   // { name: 220 }  — persisted widths
table.store.state.columnResizing // transient drag state
```

## Expanding and Grouping Rows

### Row Expanding

For hierarchical data with sub-rows:

```tsx
import {
  useTable,
  tableFeatures,
  rowExpandingFeature,
  createExpandedRowModel,
} from '@pyreon/table'
import type { ExpandedState } from '@pyreon/table'

const features = tableFeatures({
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
})

const expanded = signal<ExpandedState>({})

const table = useTable(() => ({
  features,
  data: treeData(),
  columns,
  state: { expanded: expanded() },
  onExpandedChange: (updater) => {
    expanded.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
  getSubRows: (row) => row.children,
}))
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

Group rows by column values. Grouping needs the expanded row model too, so grouped rows can
be opened:

```tsx
import {
  useTable,
  tableFeatures,
  columnGroupingFeature,
  rowExpandingFeature,
  rowAggregationFeature,
  createGroupedRowModel,
  createExpandedRowModel,
  aggregationFn_sum,
} from '@pyreon/table'
import type { GroupingState } from '@pyreon/table'

const features = tableFeatures({
  columnGroupingFeature,
  rowExpandingFeature,
  // Aggregation is INDEPENDENT of grouping in v9 — register it separately
  // if your columns use `aggregationFn` / `aggregatedCell`.
  rowAggregationFeature,
  groupedRowModel: createGroupedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  aggregationFns: { sum: aggregationFn_sum },
})

const grouping = signal<GroupingState>([])

const table = useTable(() => ({
  features,
  data: data(),
  columns,
  state: { grouping: grouping() },
  onGroupingChange: (updater) => {
    grouping.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
}))

// Group by department
grouping.set(['department'])
```

## Combining Features

### Sorting + Filtering + Pagination

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
  columnFilteringFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  sortFn_alphanumeric,
  sortFn_basic,
  filterFn_includesString,
} from '@pyreon/table'
import type { SortingState, ColumnFiltersState, PaginationState } from '@pyreon/table'

interface Product {
  id: number
  name: string
  category: string
  price: number
  stock: number
}

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  filterFns: { includesString: filterFn_includesString },
})

const columnHelper = createColumnHelper<typeof features, Product>()

const columns = [
  columnHelper.accessor('name', { header: 'Product' }),
  columnHelper.accessor('category', { header: 'Category' }),
  columnHelper.accessor('price', {
    header: 'Price',
    sortFn: 'basic',
    cell: (info) => `$${info.getValue().toFixed(2)}`,
  }),
  columnHelper.accessor('stock', {
    header: 'Stock',
    sortFn: 'basic',
    cell: (info) => {
      const stock = info.getValue()
      return (
        <span style={{ color: stock < 10 ? 'red' : stock < 50 ? 'orange' : 'green' }}>{stock}</span>
      )
    },
  }),
]

const ProductTable = defineComponent(() => {
  const data = signal<Product[]>([
    /* ... */
  ])
  const sorting = signal<SortingState>([])
  const columnFilters = signal<ColumnFiltersState>([])
  const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 20 })

  const table = useTable(() => ({
    features,
    data: data(),
    columns,
    state: {
      sorting: sorting(),
      columnFilters: columnFilters(),
      pagination: pagination(),
    },
    onSortingChange: (updater) => {
      sorting.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
    },
    onColumnFiltersChange: (updater) => {
      columnFilters.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
    },
    onPaginationChange: (updater) => {
      pagination.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
    },
  }))

  return () => (
    <div>
      <table>
        <thead>
          <For each={() => table.getHeaderGroups()} by={(g) => g.id}>
            {(headerGroup) => (
              <tr>
                <For each={() => headerGroup.headers} by={(h) => h.id}>
                  {(header) => (
                    <th>
                      {header.isPlaceholder ? null : (
                        <div>
                          <button onClick={header.column.getToggleSortingHandler()}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {() => (header.column.getIsSorted() === 'asc' ? ' ↑' : '')}
                            {() => (header.column.getIsSorted() === 'desc' ? ' ↓' : '')}
                          </button>
                          {header.column.getCanFilter() && (
                            <input
                              type="text"
                              value={() => (header.column.getFilterValue() ?? '') as string}
                              onInput={(e) => header.column.setFilterValue(e.target.value)}
                              placeholder="Filter..."
                            />
                          )}
                        </div>
                      )}
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
                <For each={() => visibleCells(table, row.id)} by={(c) => c.id}>
                  {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
        <button onClick={() => table.previousPage()} disabled={() => !table.getCanPreviousPage()}>
          Previous
        </button>
        <span>
          Page {() => table.store.state.pagination.pageIndex + 1} of {() => table.getPageCount()}
        </span>
        <button onClick={() => table.nextPage()} disabled={() => !table.getCanNextPage()}>
          Next
        </button>
      </div>
    </div>
  )
})
```

## Server-Side Data Loading with @pyreon/query

Combine `useTable` with `@pyreon/query` for server-driven tables:

```tsx
import { signal } from '@pyreon/reactivity'
import { useQuery } from '@pyreon/query'
import {
  useTable,
  createColumnHelper,
  tableFeatures,
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  createPaginatedRowModel,
  sortFn_alphanumeric,
} from '@pyreon/table'
import type { SortingState, PaginationState } from '@pyreon/table'

interface ApiResponse {
  items: Person[]
  total: number
}

// The features stay registered even though the server does the work —
// registration is what provides `nextPage` / `toggleSorting`. The `manual*`
// options tell the row models the data arrives already processed.
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})

const sorting = signal<SortingState>([])
const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 20 })

// Options as a function so the query key tracks the table state.
const { data, isLoading, error } = useQuery<ApiResponse>(() => ({
  queryKey: ['people', pagination().pageIndex, pagination().pageSize, sorting()],
  queryFn: async () => {
    const { pageIndex, pageSize } = pagination.peek()
    const sort = sorting.peek()
    const params = new URLSearchParams({
      page: String(pageIndex),
      size: String(pageSize),
      ...(sort.length > 0 && {
        sortBy: sort[0].id,
        sortDir: sort[0].desc ? 'desc' : 'asc',
      }),
    })
    const res = await fetch(`/api/people?${params}`)
    return res.json()
  },
}))

const table = useTable(() => ({
  features,
  data: data()?.items ?? [],
  columns,
  rowCount: data()?.total ?? 0,
  state: {
    sorting: sorting(),
    pagination: pagination(),
  },
  onSortingChange: (updater) => {
    sorting.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
  onPaginationChange: (updater) => {
    pagination.update((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  },
  manualPagination: true,
  manualSorting: true,
}))
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

Use column visibility with a media query check (requires `columnVisibilityFeature`):

```ts
function useResponsiveColumns(table) {
  const isSmall = signal(window.innerWidth < 768)

  window.addEventListener('resize', () => {
    isSmall.set(window.innerWidth < 768)
  })

  effect(() => {
    if (isSmall()) {
      // Hide less important columns on small screens
      table.getColumn('email')?.toggleVisibility(false)
      table.getColumn('department')?.toggleVisibility(false)
    } else {
      table.getColumn('email')?.toggleVisibility(true)
      table.getColumn('department')?.toggleVisibility(true)
    }
  })
}
```

## Full Real-World Data Table Example

A complete, production-style data table with all features combined:

```tsx
import { defineComponent, For } from '@pyreon/core'
import { signal, computed } from '@pyreon/reactivity'
import {
  useTable,
  flexRender,
  flexRenderCell,
  createColumnHelper,
  tableFeatures,
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  filterFn_includesString,
} from '@pyreon/table'
import type {
  SortingState,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
} from '@pyreon/table'

interface Employee {
  id: number
  name: string
  email: string
  department: string
  role: string
  salary: number
  startDate: string
  status: 'active' | 'inactive' | 'on-leave'
}

// Exactly the capabilities this table uses — nothing else is bundled.
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature, // requires columnFilteringFeature
  rowPaginationFeature,
  rowSelectionFeature,
  columnVisibilityFeature, // provides row.getVisibleCells()
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
  },
  filterFns: { includesString: filterFn_includesString },
})

const columnHelper = createColumnHelper<typeof features, Employee>()

const columns = [
  columnHelper.display({
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllRowsSelected()}
        indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
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
  columnHelper.accessor('name', {
    header: ({ column }) => (
      <button onClick={() => column.toggleSorting()}>
        Name {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : ''}
      </button>
    ),
    cell: (info) => <strong>{info.getValue()}</strong>,
  }),
  columnHelper.accessor('email', {
    header: 'Email',
    cell: (info) => <a href={`mailto:${info.getValue()}`}>{info.getValue()}</a>,
  }),
  columnHelper.accessor('department', {
    header: ({ column }) => (
      <button onClick={() => column.toggleSorting()}>
        Department{' '}
        {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : ''}
      </button>
    ),
  }),
  columnHelper.accessor('role', { header: 'Role' }),
  columnHelper.accessor('salary', {
    header: ({ column }) => (
      <button onClick={() => column.toggleSorting()}>
        Salary {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : ''}
      </button>
    ),
    sortFn: 'basic',
    cell: (info) => `$${info.getValue().toLocaleString()}`,
  }),
  columnHelper.accessor('startDate', {
    header: 'Start Date',
    sortFn: 'datetime',
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const status = info.getValue()
      const colors = {
        active: { bg: '#dcfce7', text: '#166534' },
        inactive: { bg: '#fee2e2', text: '#991b1b' },
        'on-leave': { bg: '#fef9c3', text: '#854d0e' },
      }
      const { bg, text } = colors[status]
      return (
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '12px',
            background: bg,
            color: text,
          }}
        >
          {status}
        </span>
      )
    },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: (info) => (
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={() => console.log('Edit', info.row.original)}>Edit</button>
        <button onClick={() => console.log('Delete', info.row.original.id)}>Delete</button>
      </div>
    ),
  }),
]

const EmployeeTable = defineComponent(() => {
  const data = signal<Employee[]>([
    /* ... employee data ... */
  ])
  const sorting = signal<SortingState>([])
  const columnFilters = signal<ColumnFiltersState>([])
  const pagination = signal<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const rowSelection = signal<RowSelectionState>({})
  const globalFilter = signal('')

  const table = useTable(() => ({
    features,
    data: data(),
    columns,
    globalFilterFn: 'includesString',
    state: {
      sorting: sorting(),
      columnFilters: columnFilters(),
      pagination: pagination(),
      rowSelection: rowSelection(),
      globalFilter: globalFilter(),
    },
    onSortingChange: (u) => sorting.update((p) => (typeof u === 'function' ? u(p) : u)),
    onColumnFiltersChange: (u) => columnFilters.update((p) => (typeof u === 'function' ? u(p) : u)),
    onPaginationChange: (u) => pagination.update((p) => (typeof u === 'function' ? u(p) : u)),
    onRowSelectionChange: (u) => rowSelection.update((p) => (typeof u === 'function' ? u(p) : u)),
    onGlobalFilterChange: (u) => globalFilter.update((p) => (typeof u === 'function' ? u(p) : u)),
    enableRowSelection: true,
  }))

  const selectedCount = computed(() => Object.keys(table.store.state.rowSelection).length)

  return () => (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
        <input
          type="text"
          placeholder="Search all columns..."
          value={globalFilter()}
          onInput={(e) => globalFilter.set(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <span>
          {() => selectedCount()} of {() => table.getRowModel().rows.length} row(s) selected
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <For each={() => table.getHeaderGroups()} by={(g) => g.id}>
              {(headerGroup) => (
                <tr>
                  <For each={() => headerGroup.headers} by={(h) => h.id}>
                    {(header) => (
                      <th
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          borderBottom: '2px solid #e0e0e0',
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
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
                <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <For each={() => visibleCells(table, row.id)} by={(c) => c.id}>
                    {(cell) => (
                      <td style={{ padding: '8px 12px' }}>
                        {() => flexRenderCell(table, row.id, cell.column.id)}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 0',
        }}
      >
        <span style={{ fontSize: '14px', color: '#666' }}>
          Showing {() => table.getRowModel().rows.length} of {() => data().length} rows
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => table.firstPage()} disabled={() => !table.getCanPreviousPage()}>
            {'<<'}
          </button>
          <button onClick={() => table.previousPage()} disabled={() => !table.getCanPreviousPage()}>
            {'<'}
          </button>
          <span style={{ padding: '0 8px' }}>
            Page {() => table.store.state.pagination.pageIndex + 1} of {() => table.getPageCount()}
          </span>
          <button onClick={() => table.nextPage()} disabled={() => !table.getCanNextPage()}>
            {'>'}
          </button>
          <button onClick={() => table.lastPage()} disabled={() => !table.getCanNextPage()}>
            {'>>'}
          </button>
        </div>
      </div>
    </div>
  )
})
```

## TanStack Table Core Re-exports

The TanStack Table **author** surface is re-exported from `@pyreon/table` — import everything
from there, not from `@tanstack/table-core`.

The runtime re-export list is **explicit and curated** rather than a wildcard. That keeps an
upstream major our migration instead of yours, and keeps adapter-construction internals
(`constructTable`, `memo`, `assignTableAPIs`, the `core*Feature` objects) out of the public
API — `useTable` owns those. **Types are re-exported wholesale**: they carry no runtime
weight and you need them for annotations.

### Features (16)

`rowSortingFeature`, `columnFilteringFeature`, `globalFilteringFeature`,
`rowPaginationFeature`, `rowExpandingFeature`, `columnGroupingFeature`,
`rowAggregationFeature`, `columnFacetingFeature`, `rowSelectionFeature`,
`columnVisibilityFeature`, `columnOrderingFeature`, `columnPinningFeature`,
`rowPinningFeature`, `columnSizingFeature`, `columnResizingFeature`, `cellSelectionFeature`,
`cellSpanningFeature` — plus `stockFeatures` (all of them) and `coreFeatures`.

### Row Model Factories

- `createSortedRowModel` — client-side sorting (slot: `sortedRowModel`)
- `createFilteredRowModel` — client-side filtering (slot: `filteredRowModel`)
- `createPaginatedRowModel` — client-side pagination (slot: `paginatedRowModel`)
- `createGroupedRowModel` — row grouping (slot: `groupedRowModel`)
- `createExpandedRowModel` — row expanding, for tree data or grouping (slot: `expandedRowModel`)
- `createFacetedRowModel` — faceted row model for filter facets (slot: `facetedRowModel`)
- `createFacetedUniqueValues` — unique values for faceted filters (slot: `facetedUniqueValues`)
- `createFacetedMinMaxValues` — min/max values for range filters (slot: `facetedMinMaxValues`)
- `createCoreRowModel` — the default core model; only needed for a custom `coreRowModel` slot

### Built-in Functions

- **Sort:** `sortFn_alphanumeric`, `sortFn_alphanumericCaseSensitive`, `sortFn_basic`, `sortFn_datetime`, `sortFn_text`, `sortFn_textCaseSensitive` (and the whole `sortFns` registry)
- **Filter:** `filterFn_includesString`, `filterFn_equals`, `filterFn_startsWith`, `filterFn_endsWith`, `filterFn_between`, `filterFn_inNumberRange`, `filterFn_inDateRange`, `filterFn_arrIncludes`, … (and the whole `filterFns` registry)
- **Aggregation:** `aggregationFn_sum`, `aggregationFn_min`, `aggregationFn_max`, `aggregationFn_mean`, `aggregationFn_median`, `aggregationFn_count`, `aggregationFn_unique`, … (and the whole `aggregationFns` registry)

Importing the whole `sortFns` / `filterFns` / `aggregationFns` registry works, but bundles
every built-in. Import the individual `*_name` functions for a smaller bundle.

### Helpers

`tableFeatures`, `createColumnHelper`, `tableOptions`, `metaHelper`, `constructSortFn`,
`constructFilterFn`, `constructAggregationFn`, `functionalUpdate`, `makeStateUpdater`,
`getInitialTableState`, `reSplitAlphaNumeric`.

### Types

- `Table`, `Row`, `Cell`, `Column`, `Header`, `HeaderGroup`, `RowModel`
- `ColumnDef`, `ColumnDefTemplate`, `AccessorColumnDef`, `AccessorFnColumnDef`, `AccessorKeyColumnDef`, `DisplayColumnDef`, `GroupColumnDef`, `IdentifiedColumnDef`
- `TableFeatures`, `StockFeatures`, `TableOptions`, `TableState`, `RowData`
- `SortingState`, `ColumnFiltersState`, `PaginationState`, `RowSelectionState`, `ColumnVisibilityState`, `ColumnOrderState`, `ColumnPinningState`, `ColumnSizingState`, `columnResizingState`, `ExpandedState`, `GroupingState`
- `SortFn`, `FilterFn`, `AggregationFnDef`, `SortDirection`, `ColumnPinningPosition`
- `CellContext`, `HeaderContext`, `Updater`, `OnChangeFn`
- And many more

:::caution Renamed types
`VisibilityState` → `ColumnVisibilityState`; `SortingFn` → `SortFn`; `TableOptionsResolved`
is gone. Every core type now takes `TFeatures` as its first generic parameter.
:::

## API Reference

### `useTable(options)`

Create a reactive TanStack Table instance.

- **`options`** (`() => TableOptions<TFeatures, TData>`) — Reactive options function. Signals read inside are automatically tracked. Must include a `features` object built with `tableFeatures({ ... })`.
- **Returns** `Table<TFeatures, TData>` — the table **instance** (not a `Computed`). Read it inside a reactive scope to subscribe.

### `UseTableOptions<TFeatures, TData>`

```ts
type UseTableOptions<TFeatures extends TableFeatures, TData extends RowData> =
  () => TableOptions<TFeatures, TData>
```

A function returning TanStack Table options. Called reactively — when any signal read inside
changes, the table options are updated.

### `flexRender(component, props)`

Render a TanStack Table column definition template.

- **`component`** — The column def template (string, number, function, VNode, or null).
- **`props`** — The context props from TanStack Table (e.g., `header.getContext()`, `cell.getContext()`).
- **Returns** — The rendered output (string, number, VNode, or null).

### `flexRenderCell(table, rowId, columnId)`

Fine-grained per-cell renderer — re-navigates to the live cell each read so an in-place
data edit patches only the changed cell. Place inside an accessor: `{() => flexRenderCell(table, row.id, cell.column.id)}`.

- **`table`** — The `Table` instance from `useTable` (fine-grained per-row subscription) or one built with `constructTable` (coarse, row-model-wide subscription).
- **`rowId`** / **`columnId`** — The row id (`row.id`) and column id (`cell.column.id`).
- **Returns** — The rendered cell output, or `null` when the row is not in the current row model.

### `pyreonReactivity()`

Builds the Pyreon-backed `coreReactivityFeature` bindings that make table state live in
Pyreon signals. `useTable` installs these automatically — you only need this when
constructing a table yourself and want Pyreon reactivity:

```ts
import { pyreonReactivity } from '@pyreon/table'

const table = constructTable({
  features: { coreReactivityFeature: pyreonReactivity(), ...features },
  data,
  columns,
})
```

Such a table has no per-row signal bridge, so `flexRenderCell` subscribes coarsely. Prefer
`useTable`.
