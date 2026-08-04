---
'@pyreon/runtime-dom': patch
---

Pure contiguous-insertion fast path for both keyed reconcilers — the mirror of the contiguous-removal fast path. When a keyed list update is exactly the old keys with one contiguous run of new keys inserted (append, prepend, or middle-insert — no removals, no survivor reorder), `mountFor` and `mountKeyedList` now mount just the run via a single fragment `insertBefore` and skip the per-key `cache.has` pre-pass, the newKey-Set build + full-cache stale scan, and the LIS walk entirely. Isolated reconcile A/B on a 10k-row list: append-1k ~1.8× faster, prepend-1k ~11× (the general path mounted new rows at the tail then moved each to its slot; the fast path does zero moves). Emits the `runtime.mountFor.insertFast` dev counter. Non-contiguous inserts, insert-plus-remove, and reorders fall through to the general reconciler unchanged.
