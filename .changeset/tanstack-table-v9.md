---
"@pyreon/table": minor
"@pyreon/feature": minor
"@pyreon/meta": minor
"@pyreon/create-zero": patch
---

Migrate to TanStack Table v9.

**`useTable` now returns the `Table` instance directly** instead of `Computed<Table>` — there is no `table()` call. v9 exposes a pluggable reactivity seam (`coreReactivityFeature`) and the adapter backs its atoms with Pyreon signals, so reading the table inside any reactive scope subscribes natively. The v8 version counter, the whole-`TableState` structural diff, and the `onStateChange` interception all existed only because v8 had no such seam; they are gone.

**Features must now be registered explicitly.** v9 exposes an API only when its feature is present, and row models are feature slots rather than options: `getCoreRowModel()` is automatic (delete it), and the rest become `tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), … })`. Define the set once at module scope — it is a compile-time type parameter. Note `row.getVisibleCells()` requires `columnVisibilityFeature`.

**Core types take a leading `TFeatures` generic** (`ColumnDef<typeof features, User>`), `table.getState()` → `table.store.state`, top-level `onStateChange` → per-slice `on<Slice>Change` (supplying one puts that slice in controlled mode), column pinning is logical (`start`/`end`, not `left`/`right`), `sortingFn` → `sortFn`, and `getIsSomeRowsSelected()` now means "at least one" including all-selected.

**The runtime re-export surface is now an explicit curated list rather than `export *`.** Under the wildcard, table-core's public surface was literally ours — an upstream major retired 40 of 51 runtime exports and leaked internals (`noop`, `getMemoOptions`, `_getVisibleLeafColumns`). The curated list covers the full author surface (all 16 features, every row model and built-in fn) while keeping adapter-construction plumbing out; types are still re-exported wholesale. A future upstream major is now our migration rather than yours.

`@pyreon/feature`'s `useTable` gains a fix along the way: `pageSize` was typed-but-unimplemented under v8 — it was read only as a boolean and its value discarded, so `pageSize: 25` silently paged by 10. It now sets the initial page size, and an unpaginated table is unpaginated (rather than truncated to v9's default of 10).

Fine-grained per-cell updates are preserved and verified: a single-cell edit still re-runs only the changed row's cells (6 cell units, 1 DOM write at both N=100 and N=1000 — matching hand-memoized react-table with no memo boilerplate). See the migration section in the table docs for a before/after.

`flexRender` and `flexRenderCell` now return a resolved-child type instead of `unknown`/`VNodeChild`. `VNodeChild` includes the accessor arm, so returning it made Pyreon's own documented `<td>{() => flexRenderCell(…)}</td>` pattern a nested accessor that the type system rejected; both functions always return already-resolved content, and the narrower type says so. `{flexRender(…)}` now typechecks directly in JSX.
