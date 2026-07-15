---
"@pyreon/runtime-dom": patch
---

perf(runtime-dom): pure-contiguous-removal fast path in `mountFor`

Add `tryContiguousRemoval` — a Solid-`mapArray`-style common-prefix + common-suffix
diff of `currentKeys` vs `newKeys`. When a `<For>` update is exactly a single
contiguous run deleted (no adds, no survivor reorder — the krausest `remove` op),
it unmounts just the removed rows and skips the general path's per-key `cache.has`
probe, full-cache stale `Set` scan, AND the all-stay LIS entirely — replacing ~4n
Map/Set operations with an O(n) primitive `===` scan plus the O(removed) teardown
that is genuinely required.

Isolated (reflow-free happy-dom) A/B: a 1000-row middle-remove reconcile drops
~72µs → ~25µs (~2.8×). The improvement is JS-only — the real-Chromium `remove`
benchmark is browser-reflow-dominated (~6.8ms for a 1000-row table), so this
saving sits below the ~100µs timing-resolution floor there and `remove` remains a
statistical tie with Solid (Pyreon nominally leads 6.80ms vs 6.90ms both before and
after). The win matters most on slower CPUs and larger lists, where the O(n)
Map/Set work is a larger share of the total.

Gated precisely: fires only when `n < currentKeys.length` AND the prefix+suffix
cover every survivor; reorders, adds, and scattered (non-contiguous) removals fall
through to the general reconciler unchanged. Emits a new dev counter
`runtime.mountFor.removeFast`.
