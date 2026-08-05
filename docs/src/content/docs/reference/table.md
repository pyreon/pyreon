---
title: "TanStack Table Adapter — API Reference"
description: "Pyreon adapter for TanStack Table — reactive options, signal-driven state, flexRender"
---

# @pyreon/table — API Reference

> **Generated** from `table`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [table](/docs/table).

Reactive TanStack Table v9 adapter for Pyreon. Options are passed as a function so signal reads inside (data, columns, state) automatically re-sync the table when any tracked signal changes. Returns the Table instance directly: its state lives in Pyreon signals through v9's pluggable reactivity seam, so reads track natively inside templates and effects. Re-exports the TanStack Table author surface — all 16 features, every row model and built-in fn — as an explicit, curated list.

## Features

- useTable(optionsFn) with reactive signal-driven options
- flexRender for column def templates (strings, functions, VNodes)
- flexRenderCell — fine-grained per-cell updates: an in-place data edit patches only the changed rows cells, no memo boilerplate
- Full TanStack Table core re-exported — single import source
- Pyreon signals ARE the table's reactive atoms (v9 coreReactivityFeature bindings) — no version counter, no accessor wrapper

## Complete example

A full, end-to-end usage of the package:

```tsx
import {
  useTable, flexRender, flexRenderCell,
  tableFeatures, rowSortingFeature, createSortedRowModel, sortFn_alphanumeric,
  type ColumnDef,
} from '@pyreon/table'
import { signal } from '@pyreon/reactivity'

interface User { name: string; email: string; age: number }

// v9 registers capabilities EXPLICITLY — define the set once, at module scope,
// with only what this table uses (that is what keeps the bundle small).
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})

const users = signal<User[]>([
  { name: 'Alice', email: 'alice@example.com', age: 30 },
  { name: 'Bob', email: 'bob@example.com', age: 25 },
])

const columns: ColumnDef<typeof features, User>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'age', header: 'Age' },
]

// Options as a FUNCTION — signal reads inside auto-track.
// Changing users() re-syncs the entire table reactively.
const table = useTable(() => ({
  features,
  data: users(),
  columns,
}))

// In JSX — read the table inside reactive scopes (no accessor call):
<table>
  <thead>
    <For each={() => table.getHeaderGroups()} by={(g) => g.id}>
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
    <For each={() => table.getRowModel().rows} by={(r) => r.id}>
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
</table>
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`useTable`](#usetable) | hook | Create a reactive TanStack Table v9 instance. |
| [`flexRender`](#flexrender) | function | Render a TanStack Table column definition template (header, cell, or footer). |
| [`flexRenderCell`](#flexrendercell) | function | Fine-grained per-cell renderer for live cell values. |

## API

### useTable `hook`

```ts
<TFeatures extends TableFeatures, TData extends RowData>(options: () => TableOptions<TFeatures, TData>) => Table<TFeatures, TData>
```

Create a reactive TanStack Table v9 instance. Options are passed as a function so reactive signals (data, columns, state) can be read inside and the table re-syncs automatically when they change. Returns the Table instance DIRECTLY — its state lives in Pyreon signals via v9's `coreReactivityFeature` seam, so reading it inside any reactive scope (a JSX accessor, an effect, a computed) subscribes natively. v9 requires every non-core capability to be registered explicitly in a `features` object built with `tableFeatures({...})`; the core row model is automatic.

**Example**

```tsx
// Define the feature set ONCE, outside the component — only what you use.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})

const table = useTable(() => ({
  features,
  data: users(),
  columns: [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
  ],
}))

// Read inside a reactive scope — no accessor call, the table IS the instance:
<For each={() => table.getRowModel().rows} by={(r) => r.id}>
  {(row) => <tr>...</tr>}
</For>
```

**Common mistakes**

- Passing options as a plain object instead of a function — signal reads are not tracked and the table never updates when data changes
- Calling `table()` — under v9 `useTable` returns the Table INSTANCE, not a Computed. The v8 accessor call is gone; reads track natively
- Forgetting to register a feature — v9 exposes an API only when its feature is in `tableFeatures({...})`. If `table.nextPage` or `column.toggleSorting` is missing, add `rowPaginationFeature` / `rowSortingFeature` (plus its row-model slot); do NOT cast the table to a broader type
- Building the `features` object inside the component or inline in the options function — it is a compile-time type parameter, so define it once at module scope
- Using `.map()` on rows instead of `<For>` — loses Pyreon's keyed reconciliation, rebuilds the whole tbody on every change (worst-case DOM churn)
- Binding a value that CHANGES (a cell value, column width from `getSize()`, a sort indicator) as a STATIC prop/attr/child through a keyed `<For>` — the keyed cell is reused on a state change and its body never re-runs, so the value freezes. Read it inside a reactive closure at the point of use: cell content via `<td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>`, an attribute via `style={() => ({ width: table.getColumn(id).getSize() + "px" })}`

**See also:** `flexRender` · `flexRenderCell`

---

### flexRender `function`

```ts
<TValue>(component: Renderable<TValue>, props: TValue) => unknown
```

Render a TanStack Table column definition template (header, cell, or footer). Handles strings, numbers, functions (component functions or render functions), and VNodes. Returns the rendered output or null for undefined/null inputs. Use in JSX to render column definitions provided by TanStack Table.

**Example**

```tsx
// Header:
flexRender(header.column.columnDef.header, header.getContext())
// Cell:
flexRender(cell.column.columnDef.cell, cell.getContext())
```

**Common mistakes**

- Wrapping flexRender output in an extra function accessor — the result is already renderable JSX content
- Passing the column def directly instead of calling getContext() — TanStack Table requires the context object
- Using plain `flexRender(cell…, cell.getContext())` for a cell inside a keyed `<For>` when the cell VALUE can change in place — the captured `cell` is stale and the reused row never re-runs it, so it freezes. Use `flexRenderCell(table, row.id, cell.column.id)` for live cells.

**See also:** `useTable` · `flexRenderCell`

---

### flexRenderCell `function`

```ts
<TFeatures extends TableFeatures, TData extends RowData>(table: Table<TFeatures, TData>, rowId: string, columnId: string) => unknown
```

Fine-grained per-cell renderer for live cell values. Inside a keyed `<For>`, the `row`/`cell` objects are captured ONCE (the reconciler reuses the DOM node and never re-runs its body), so plain `flexRender(cell…, cell.getContext())` FREEZES when a value changes in place. `flexRenderCell` re-navigates to the live cell from the current row model each read — place it in an explicit accessor `<td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>`. A table from `useTable` carries a per-row signal bridge, so the cell subscribes to ONLY its own row's signal and an in-place data edit patches just the changed rows' cells — matching a hand-memoized react-table row without any React.memo boilerplate. Returns null when the row is not in the current (filtered/paginated) row model.

**Example**

```tsx
// Place inside an accessor child so a single-cell edit patches ONLY that cell:
//   <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>
flexRenderCell(table, row.id, columnId)
```

**Common mistakes**

- Forgetting the explicit accessor wrapper `{() => …}` — without it the cell is captured once and freezes on the next change
- Passing a table built directly with `constructTable` instead of one from `useTable` — it renders correctly but has no per-row bridge, so it subscribes coarsely (every cell re-runs on any change)

**See also:** `useTable` · `flexRender`

---

## Package-level notes

> **Note:** Options must be a FUNCTION `() => TableOptions<T>`, not a plain object. Signal reads inside the function are tracked reactively — changing any tracked signal re-syncs the table automatically.

> **Re-exports:** The TanStack Table author surface is re-exported from `@pyreon/table` — all 16 features (rowSortingFeature, columnFilteringFeature, …), every row model (createSortedRowModel, createFilteredRowModel, createPaginatedRowModel, …), every built-in filter/sort/aggregation fn, plus `tableFeatures`/`stockFeatures`. All types are re-exported too. Import from `@pyreon/table`, not `@tanstack/table-core`. The runtime list is explicit and curated (not `export *`) so an upstream major is OUR migration, not yours, and adapter-construction internals never leak.

> **Computed return:** useTable returns the Table INSTANCE (v9), not a Computed — there is no `table()` call. Its state lives in Pyreon signals, so reading it inside a reactive scope subscribes: `<For each={() => table.getRowModel().rows}>` makes the list reactive. The v8 accessor form was only ever a workaround for v8 having no reactivity seam.

> **Fine-grained cells:** For live/editable tables, render cells with `flexRenderCell(table, row.id, cell.column.id)` inside an accessor. An in-place data edit then re-runs ONLY the changed rows' cell bindings (per-row signals) and patches ONE cell — no memo boilerplate, matching a hand-optimized react-table. A table-STATE change (sort/filter/selection/column visibility) re-runs all cells (coarse, correct-by-default for state-reading cells).

> **reorder-on-data-edit limitation:** A DATA edit that changes the SORT ORDER (editing the column you are sorted BY) updates every cell to the correct value but does NOT re-position the keyed rows until the next structure/state change — a pre-existing base-adapter limitation of the sorted-row-model + &lt;For&gt; interaction (it affects plain `flexRender` cells too, not just `flexRenderCell`). Re-ordering via the sort controls (`toggleSorting`/`setSorting`) works normally. Workaround: re-apply sorting after such an edit, or sort by a column you do not edit in place.
