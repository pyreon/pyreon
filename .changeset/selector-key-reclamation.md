---
'@pyreon/reactivity': patch
---

`createSelector` now RECLAIMS per-key state, so a selector over a list whose ids never repeat no longer grows without bound.

The selector keeps a per-key subscriber bucket so a selection change can notify only the two affected keys instead of every subscriber. That bucket was created on first access and never removed: disposing the subscriber emptied the bucket's `Set` but left the key, the empty `Set` and the host object in the internal maps for the selector's lifetime. For a bounded key space (tabs, a radio group) this is invisible. For UNBOUNDED-cardinality churn — infinite scroll, a chat log, a paginated table whose row ids never repeat — it accumulated one bucket per row ever rendered, and with OBJECT keys it pinned the user's own objects too. Measured on V8: **257.9 bytes retained per unique key** (24.6 MB after 100,000 keys had been queried and every subscriber disposed).

Two changes, both invisible to callers:

- The `subs` (value → Set) and `hosts` (value → `{_s}`) maps are merged into one. They always stored the same relationship, so every key paid two Map entries to record one fact. The bucket's `Set` is now allocated lazily by `trackSubscriber`, so a read outside any tracking scope allocates nothing at all.
- A key whose bucket has no subscribers left is dropped by an amortized sweep on the next key insertion. A bucket with no subscribers holds no state — the current selection lives outside the map — so a swept key that is queried again simply gets a fresh bucket, which makes the sweep semantically invisible. Steady-state memory is now proportional to the keys currently SUBSCRIBED rather than to every key the selector has ever been asked about: the same 100,000-key workload retains **3.1 bytes per key** (0.29 MB), an 84× reduction.

The sweep can never drop a live subscription: it deletes only buckets that are empty, and it never runs while a selection change is being delivered. `dispose()` still releases everything at once and is still worth calling when a selector outlives its list.
