---
"@pyreon/zero": patch
---

fix(zero/isr): bound the in-memory ISR cache with LRU eviction

`createISRHandler` kept an unbounded `Map<pathname, CacheEntry>` — on
parametrised routes like `/user/:id` where `:id` is free-form, the
cache grew without limit over the server's lifetime. Long-running
deployments accumulated one entry per distinct URL forever.

Fix: added `ISRConfig.maxEntries` (default: `1000`) with LRU eviction.
Every cache read `.delete()` + `.set()`s the entry to bump it to newest
(preserving insertion-order LRU). Writes evict the oldest entries
until size is under the cap.
