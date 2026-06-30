---
'@pyreon/store': patch
---

`patch()` no-subscriber fast path — turns the bulk-patch op from a loss into a
win vs Zustand. The `patchInProgress` flag + `patchEvents` buffer exist only to
feed store-`subscribe()` callbacks (written by `notifyDirect`, which runs only
via the per-signal change-detection subscribers — themselves active only while
≥1 subscriber is attached). So a patch on a store with no subscriber (the common
case) now skips two `patchEvents = []` allocations + the flag dance, and the
object-form path uses `Object.keys` + index instead of `Object.entries` (no
per-entry `[k,v]` tuple arrays).

Measured (`bench:stores`, Apple M3, NODE_ENV=production, per-op isolated): `patch
2 fields` **106ns → 49ns — now ~1.3× faster than Zustand (66ns), previously ~1.8×
slower**. The with-subscriber notify path is unchanged (locked by the existing
`type: 'patch'` notification tests); 142 store tests pass.
