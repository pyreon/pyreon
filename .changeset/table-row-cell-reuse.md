---
'@pyreon/table': patch
---

`flexRenderCell` reuses the cells its row's `visibleCells` call just looked up, instead of walking the row model and the column map again for every cell. The reuse is tagged with the row's version signal, so any data, column or structural change (a sort included) forces a fresh lookup. Measured against @tanstack/react-table with memoized rows (happy-dom, 1,000 rows): mount 47.8 → 43.2ms, replace 9.5 → 7.9ms (now a tie), sort 8.6 → 7.3ms, single-cell update now 1.2× faster.
