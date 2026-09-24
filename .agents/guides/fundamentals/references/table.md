# @pyreon/table

TanStack Table v9 adapter.

## API

- `useTable(() => opts)` returns the `Table` instance directly. Options are a function so signal reads track.
- `pyreonReactivity()` backs v9's reactivity seam (`coreReactivityFeature`) with Pyreon signals, so reading `table.getRowModel()` in any reactive scope subscribes natively.
- v9 needs explicit feature registration. Build one `tableFeatures({ … })` object at module scope (it is a type parameter) with only what you use. The core row model is automatic; the rest are slots:
  - `rowSortingFeature` + `sortedRowModel: createSortedRowModel()`
  - `columnFilteringFeature` + `filteredRowModel`
  - `rowPaginationFeature` + `paginatedRowModel: createPaginatedRowModel()`
  - `columnVisibilityFeature` (required for `row.getVisibleCells()`)
  - `rowSelectionFeature`; `globalFilteringFeature` (needs column filtering)
  - `stockFeatures` is all 16 features but not the row models.
- Core types take a leading `TFeatures`: `ColumnDef<typeof features, T>`, `Table<TFeatures, T>`.
- v9 changes from v8: `table.getState()` and top-level `onStateChange` are gone — use `table.store.state` / `table.atoms.<slice>` and per-slice `on<Slice>Change`. Supplying one puts that slice in controlled mode. Pinning is `start`/`end`; `sortingFn` → `sortFn`; `columnSizingInfo` → `columnResizing`; `getIsSomeRowsSelected()` is true when at least one row (including all) is selected.
- The runtime re-export list is curated, not `export *`; `src/tests/public-surface.test.ts` snapshots it.

## Fine-grained cells

- Use `flexRender` for column-def templates. Inside a keyed `<For>`, plain `flexRender(cell…, cell.getContext())` freezes on an in-place value change (the reconciler reuses the row and never re-runs its body). Read cells with `<td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>`.
- Drive the inner cell loop with `visibleCells(table, row.id)`, never a captured `row.getVisibleCells()`: the tracked form's memo deps read `table.options`, which every options sync changes, so a single-cell edit re-runs every row's cell list. `visibleCells` subscribes to the row signal plus the column-geometry slices (visibility/order/pinning/grouping) and looks cells up untracked from the current model; a table without the reactivity bridge falls back to the tracked, coarse form.
- The adapter keeps per-row version signals. A cell subscribes to its row only, and the whole cell lookup runs untracked; any tracked v9 step (`getRowModel`, `getVisibleCells`, `getContext` are all derived-atom reads) would re-subscribe the cell to table-wide state.
- Atom bindings default `compare` to `Object.is` (TanStack Store parity). Without it, every data edit re-notifies every slice subscriber with an unchanged value.
- A structure or columns change bumps all rows. Columns are compared by structural signature (including `groupedColumnMode`), not array identity, because an inline `columns: [...]` literal changes reference on every sync.
- `.map()` over rows is an anti-pattern (full `<tbody>` rebuild).

## Standings and limits

Benches `bench:table` (re-run counts) and `bench:table:wall` compare against `@tanstack/react-table` on the same table-core:

- Single-cell edit: 6 cell units and 1 DOM write, independent of N, matching a hand-memoized react-table without `React.memo`; wall-clock about 1.3× faster than memoized react-table.
- Mount is about 1.7–1.9× slower (N×M fine-grained bindings allocated up front); replace about 1.1–1.3× slower.
- A sort re-runs every cell on the keyed path (react-memo-row does 0). This is deliberate and test-locked: a state-reading cell under `React.memo` freezes, ours stays correct.
- Known limitation: a data edit that changes sort order updates values but does not re-position keyed rows until the next structure/state change. `toggleSorting`/`setSorting` reorder normally.
