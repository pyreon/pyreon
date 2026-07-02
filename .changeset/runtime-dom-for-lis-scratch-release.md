---
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
---

`<For>`: release the LIS reorder scratch after each pass — removed rows are now GC-eligible immediately.

`forLisReorder` filled the per-`<For>` scratch array with `ForEntry` references (each pinning its row's DOM subtree + cleanup closure) and never cleared them. A large reorder followed by a shrink (e.g. 10k rows filtered down to 50) left the stale tail pinning every removed row's DOM for as long as the `<For>` stayed mounted — later reorders only overwrite the head of the scratch, so the tail never self-healed. GC-observable regression test (bisect-verified: 60/62 removed rows stayed pinned pre-fix) now runs in CI under `--expose-gc`.
