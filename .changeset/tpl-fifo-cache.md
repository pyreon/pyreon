---
'@pyreon/runtime-dom': patch
---

perf(runtime-dom): drop `_tpl` cache LRU touch on hit — FIFO eviction (zero Map ops on the hot path)

`_tpl(html, bind)` is compiler-emitted and called per template instantiation — once per row in a list of N rows. The cache previously did `cache.delete(html); cache.set(html, tpl)` on every cache HIT to refresh LRU recency, costing 2 Map ops per instantiation (20k Map ops on a js-framework-benchmark `create 10,000 rows`) for a correctness guarantee that no realistic app needs.

Cache HIT is now a no-op; cache MISS keeps the eviction-at-cap logic (FIFO instead of LRU). Trade-off: an app with > 1024 distinct compiled templates may pay an occasional re-parse (a few ms one-time) instead of the LRU-protected hot template surviving — but no realistic app approaches 1024 templates, so the swap is pure hot-path win in practice. 681/682 existing runtime-dom tests pass (1 pre-existing skip; no LRU semantic test); typecheck + lint clean.
