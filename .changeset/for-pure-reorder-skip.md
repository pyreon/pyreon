---
"@pyreon/runtime-dom": patch
---

perf(runtime-dom): skip the stale-scan on pure reorders (both `<For>` reconcilers)

A swap / reverse / sort keeps the SAME key set in a new order — nothing is added
or removed — yet every keyed-list update still rebuilt an O(n) key `Set` and ran
an O(m) stale scan. Both reconcilers now mount new entries FIRST and count them;
when nothing was added AND the cache still holds exactly the keyed count, the
update is provably a pure reorder, so the Set rebuild and stale scan are skipped.
Mount-before-remove is order-independent for correctness (new and stale keys are
disjoint; the stale scan skips any cache key already in the new key set).

- `mountFor` (the `each`/`by` source-array reconciler): **1.20ms → 1.00ms
  (~17%)** on a 5000-row full-reverse — stacking on #1280's resolve-once for
  ~29% total.
- `mountKeyedList` (the function-child keyed-array reconciler): **1.50ms →
  1.40ms (~7%)** on a 4000-row full-reverse.

All measured in real Chromium with drift-controlled tight-alternating A/B. The
win scales with reorder size; the synthetic 2-row swap is floor-bound (~700µs,
CI95-tied with Vanilla) and won't show it — real apps that sort / drag-reorder /
reverse large lists benefit. 699 runtime-dom tests pass, coverage 95.13%, zero
behaviour change.
