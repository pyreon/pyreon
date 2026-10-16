---
'@pyreon/table': patch
---

Fix: a cell that reads `row.subRows` now shows the sorted order when a sort reorders only a row's sub-rows. `flexRenderCell` and `visibleCells` looked rows up through `getRowModel().rowsById`, which table-core's sorted model takes from the pre-sort model, so they got the unsorted row. They now use the row object from the current model, and `useTable` refreshes a row whose sub-rows changed order.
