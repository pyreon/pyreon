---
"@pyreon/runtime-dom": patch
---

fix(runtime-dom): `<For>` new key added into a slot vacated by a removal now lands at its logical position

In `mountFor`'s general (LIS) reconciler path, a new key inserted into a slot freed by a removal was stranded at the physical tail instead of its logical position — e.g. `[1,2,3,4] → [1,5,3]` rendered `[1,3,5]`. Root cause: `mountNewForEntries` mounts new entries before `tailMarker` (at the tail) but recorded their `pos` as the NEW logical index. `forLisReorder` reads `pos` as each entry's CURRENT DOM position to decide which rows stay vs. move, so a new row whose index straddled two survivors' stale positions looked "already in order" and was never moved off the tail. The small-k reorder path (unchanged list length) was unaffected — it places via survivor anchors, not `pos`.

Fix: new tail-mounted entries record `pos = currentKeys.length + added`, placing them strictly after every survivor so the LIS moves each new row to its logical slot (before its next-surviving sibling). Also teaches `pyreon doctor diagnose` / MCP `diagnose` the behavioral symptom (a `<For>` list rendering in the wrong order after add+remove).
