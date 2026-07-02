---
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
---

`<For>`: release the LIS reorder scratch after each pass — removed rows are now GC-eligible immediately.

`forLisReorder` filled the per-`<For>` scratch array with `ForEntry` references (each pinning its row's DOM subtree + cleanup closure) and never cleared them. A large reorder followed by a shrink (e.g. 10k rows filtered down to 50) left the stale tail pinning every removed row's DOM for as long as the `<For>` stayed mounted — later reorders only overwrite the head of the scratch, so the tail never self-healed. GC-observable regression test (bisect-verified: 60/62 removed rows stayed pinned pre-fix) now runs in CI under `--expose-gc`.

Also fixes a fuzz-found ordering bug in the same reconciler: `moveEntryBefore`'s multi-node walk did not stop at the `tailMarker` (the doc contract said it did), so moving the DOM-last row during an LIS reorder dragged the marker along with it. A misplaced marker silently corrupted every subsequent operation — appended rows landed at the marker's stranded position ("sort a table, then add a row → it lands in the middle"), `clearBetween` missed rows outside the marker pair, and the swap fast paths stopped applying. Found by a new property-based reconciler fuzz gate (5 oracle properties over random op sequences), which now runs in CI; post-fix campaign: 1,000 seeds × 40 ops, zero failures.
