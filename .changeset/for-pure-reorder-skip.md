---
"@pyreon/runtime-dom": patch
---

perf(runtime-dom): skip the stale-scan on pure `<For>` reorders (~17% on large reorders)

A swap / reverse / sort keeps the SAME key set in a new order — nothing is added
or removed — yet `handleIncrementalUpdate` still rebuilt an O(n) newKey `Set` and
ran an O(m) stale scan on every update. It now mounts new entries FIRST and
counts them; when nothing was added AND the cache still holds exactly `n`
entries, the update is provably a pure reorder, so both the Set rebuild and the
stale scan are skipped. Mount-before-remove is order-independent for correctness
(new and stale keys are disjoint; the stale scan skips any cache key already in
the newKey set).

Measured (real Chromium, drift-controlled tight-alternating A/B, 5000-row
full-reverse ×60): **1.20ms → 1.00ms (~17%)**, stacking on the resolve-once
change for ~29% total off a large reverse. Floor-bound on the synthetic 2-row
swap (~700µs, CI95-tied with Vanilla); the win scales with reorder size — real
apps that sort / drag-reorder / reverse large lists benefit. 699 runtime-dom
tests pass, coverage 95.12%, zero behaviour change.
