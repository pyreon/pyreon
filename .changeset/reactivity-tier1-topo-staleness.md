---
"@pyreon/reactivity": patch
---

fix(reactivity): `{ equals }` computeds settle regardless of subscription order — dirty-at-notify + clear-flag-before-run tier-1 drain (topo-staleness fix)

Fixes a pre-existing (0.45.0-identical) staleness bug: an `{ equals }` computed re-evaluated only inside its queued recompute and never set `_dirty` on notification. Tier-1 drains in SUBSCRIPTION order, not topological order — so `outer = computed(() => s() + inner(), { equals })` that subscribed to `s` before `inner` drained first, pull-read `inner()`'s stale cache, and `inner`'s later re-notify was dropped by the drain's dedup (already visited) → `outer()` was PERMANENTLY stale until the next write, falsifying the "computeds settle before effects" contract (a torn stale-pull that threw also dispatched a phantom error through the effect error handler).

The fix: every computed — `{ equals }` included — is now dirty-marked at NOTIFY time (so a tier-1 visitor pull-reads dirty deps fresh and visit order stops mattering), the `{ equals }` refresh is unified into the read's dirty branch (one evaluation per drain, pull or push), and the tier-1 drain clears each entry's membership flag BEFORE running it so a genuine post-visit re-dirty (through a lazy intermediate) re-runs instead of being dedup-dropped. Tier-1 storage is now the same array + intrusive-flag design as the tier-2 effect queue.

Perf: the five headline bench metrics hold exactly (wide fan-out ~1.0×/flipped, batch-50 ~1.15× ahead, effect propagation ~1.35× ahead, diamond ~1.27× behind, deep chain ~1.51× behind vs Preact); the `{ equals }` unbatched write now costs the same as the default lazy variant's (the prior inline-eval speed was the bug), and multi-write batches over `{ equals }` computeds got ~30% faster. Heap-neutral. `{ equals }` direct (`_bindText`/`_bindDirect`) subscribers now dispatch in the drain with settled values, consistent with the lazy variant.
