---
"@pyreon/runtime-dom": patch
---

perf(runtime-dom): faster `<For>` reorder — resolve cache entry once + skip stale-scan on pure reorders

Two measured wins on the keyed `<For>` update path (real Chromium,
drift-controlled tight-alternating A/B, 5000-row full-reverse ×60):

1. **Resolve each cache entry once (3× → 1× `Map.get`).** The reorder hashed
   every key three times per update (`computeForLis`, `applyForMoves`, the
   pos-refresh). It now resolves entries once into a reused `LisState.entries`
   buffer. Plus `collectNewKeys`'s per-update duplicate-key `Set` is gated to
   dev (it never skips in production). **1.40ms → 1.20ms (~14%).**

2. **Skip the stale-scan on pure reorders.** A swap / reverse / sort keeps the
   SAME key set in a new order, so nothing is added or removed — yet every
   update still rebuilt an O(n) newKey `Set` and ran an O(m) stale scan. The
   update now mounts new entries FIRST and counts them; when nothing was added
   and the cache still holds exactly `n` entries, it's provably a pure reorder
   and both the Set rebuild and the stale scan are skipped. **1.20ms → 1.00ms
   (~17%).**

Combined, a 5000-row full-reverse drops **1.40ms → 1.00ms (~29%)**. The win
scales with reorder size; the synthetic 2-row-swap-in-1000 op is floor-bound
(~700µs, CI95-tied with Vanilla) and won't show it, but real apps that
sort / drag-reorder / reverse large lists benefit. Mount-before-remove is
order-independent for correctness (new and stale keys are disjoint; the stale
scan skips any cache key present in the newKey set). 699 runtime-dom tests pass,
coverage 95.12%, zero behaviour change.
