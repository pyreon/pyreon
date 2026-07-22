---
'@pyreon/dnd': patch
---

Bench: new `row-enter fanout (N=1000 row bindings)` cell in the wrapper-tax bench — measures the sortable row-binding idiom at scale: ~26µs/row-enter with the naive `overId() === key` equality idiom (O(N) notifies) vs ~1.5µs with the `isOverKey(key)` selector idiom (~18× faster, O(2) notifies) — the wall-clock proof of the selector API's claim (the count itself is browser-spec-locked). No runtime changes.
