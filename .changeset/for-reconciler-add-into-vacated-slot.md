---
"@pyreon/runtime-dom": patch
---

fix(runtime-dom): `<For>` new key added into a slot vacated by a removal now lands at its logical position

In `mountFor`'s general (LIS) reconciler path, a new key inserted into a slot freed by a removal was stranded at the physical tail instead of its logical position — e.g. `[1,2,3,4] → [1,5,3]` rendered `[1,3,5]`. Root cause: `mountNewForEntries` mounts new entries before `tailMarker` (at the tail) but recorded their `pos` as the NEW logical index. `forLisReorder` reads `pos` as each entry's CURRENT DOM position to decide which rows stay vs. move, so a new row whose index straddled two survivors' stale positions looked "already in order" and was never moved off the tail. The small-k reorder path (unchanged list length) was unaffected — it places via survivor anchors, not `pos`.

Fix: a new entry that has a SURVIVOR after it in `newKeys` (prepend / middle insert) gets a sentinel `pos` that `computeForLis` skips, so it is never an LIS "stay" member and always falls to `applyForMoves`, which threads it in before its logical successor. A new entry in the TRAILING all-new run (append) keeps a strictly-increasing `pos` above every survivor so the LIS extends it as a stay — append does zero moves. This preserves the prepend + append zero-probe fast paths (locked by `@pyreon/perf-harness`'s `big-list` counters) and leaves pure shuffles/reversals byte-identical (no new keys → no sentinels). Also teaches `pyreon doctor diagnose` / MCP `diagnose` the behavioral symptom (a `<For>` list rendering in the wrong order after add+remove).
