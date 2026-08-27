---
"@pyreon/table": patch
---

perf(table): O(1) cell lookup in `renderCell` instead of an O(C²)-per-row scan

`flexRenderCell` → `renderCell` resolved a cell by doing `getVisibleCells().find(c => c.column.id === columnId)` — an O(C) linear scan by column id. It runs once per cell per render (the documented `{() => flexRenderCell(table, row.id, cell.column.id)}` shape), so a row with C columns did C scans of C cells → **O(C²) per row**, **O(N·C²)** on any full re-render (mount / sort / filter / pagination).

It now uses table-core v9's own memoized `row.getVisibleCellsByColumnId()` — a by-column-id map with the SAME visible-column filter and the SAME memo deps (`[row.getAllCells(), columnVisibility]`) as `getVisibleCells`, so it returns the identical cell in O(1). Falls back to the O(C) scan only when a table is built from a minimal feature set without column visibility. Per row: **O(C²) → O(C)**.

This does not change the adapter's compare/laziness semantics — `renderCell` already runs `untrack`ed and already read the same visibility atoms.

Bisect-verified: a stub row whose `getVisibleCells`/`getAllCells` throw but whose `getVisibleCellsByColumnId` returns the cell renders correctly through the O(1) path; reverting to the `.find` scan throws (`should not scan getVisibleCells`).
