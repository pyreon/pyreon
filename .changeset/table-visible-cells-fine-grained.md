---
'@pyreon/table': minor
---

Fine-grained cells-list accessor `visibleCells(table, rowId)` + value-gated atom propagation (TanStack Store reference parity).

Two changes that together make a single-cell edit genuinely fine-grained end-to-end:

- **`visibleCells(table, rowId)`** (new export) — the cells-LIST companion to `flexRenderCell`, for the inner `<For>` of a keyed table body. The previously documented `each={() => row.getVisibleCells()}` leaves a TRACKED table-core read in every row's scope (its memo deps read `table.options`, which changes on every options sync — data edits included), so a single-cell edit re-ran every row's cells-list accessor: measured 1000 re-runs at N=1000 where 1 is correct, making the edit ~3× slower than a memoized react-table. `visibleCells` subscribes to the row's own signal plus the column-geometry state slices (visibility, order, pinning, grouping) and looks the cells up untracked from the CURRENT row model. Re-measured: update-1cell is now ~1.3× FASTER than a hand-memoized react-table at N=100 and N=1000 (10-25× vs naive).
- **Atom bindings default `compare` to `Object.is`** — TanStack Store's reference `createAtom` does not propagate an equal update; Pyreon's bare `computed` notifies unconditionally on dependency change. Core creates its per-slice `table.atoms[key]` with no compare while their fn reads `table.options`, so every data edit re-notified every state-slice subscriber with an unchanged value. Value-gating restores reference-binding parity.
- The structural column signature now includes `groupedColumnMode` (it changes the leaf-column list without touching `columns` or row ids), so that change correctly bumps the per-row signals.

The sort-toggle contract is unchanged and deliberate: a structure/order change still re-runs all cells (coarse-but-correct for state-reading cells — the case `React.memo` on `original` identity silently freezes).
