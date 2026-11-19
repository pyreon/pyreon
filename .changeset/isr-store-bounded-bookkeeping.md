---
'@pyreon/zero': patch
---

ISR bookkeeping is now bounded by what is cached or in flight:

- The memory store's tag index drops a key when it is deleted, evicted or cleared, so it no longer grows forever under a capped cache. `setTags` now replaces a key's tags, and `keysByTag` no longer refreshes LRU order.
- `createFsStore` removes a deleted key from `_tags.json` and rewrites that file only when the index changes, not on every cache miss.
- The handler keeps an invalidation epoch only while a render for that key is in flight, instead of one entry per key ever passed to `revalidateNow`.
- `revalidateAll()` now also stops a cold-miss render already in flight from storing its pre-purge result.
