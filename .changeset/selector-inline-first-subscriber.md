---
'@pyreon/reactivity': patch
---

`createSelector` per-key subscriber storage uses an inline-first-subscriber slot (the signal `_d1` trick): the first `selector.subscribe(key, fn)` per key stores the bare function; a `Set` is allocated only when a second subscriber arrives for the same key. The dominant `<For>` + per-row `isSelected.subscribe(row.id, …)` shape has exactly one subscriber per key, so a 10k-row create previously allocated 10k single-entry Sets (measured at 14% of JS allocations in the bench profile). Measured: −1.0ms create-10k, −300µs create-1k (CI-clean) on the fair benchmark. Disposing a sole inline subscriber now deletes the key entry, also fixing unbounded Map growth across create/clear cycles with fresh keys.
