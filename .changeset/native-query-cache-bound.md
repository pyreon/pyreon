---
'@pyreon/query': patch
---

The native query cache (iOS and Android) is now bounded. Past `maxEntries` (default 100), the least recently used entry is evicted. A query with a runtime key, such as a route parameter or a prop, adds one cache entry per distinct value, so the cache used to grow for the life of the app. Evicting is safe: a live query keeps its own data, so an evicted key only costs a refetch on its next stale check. Raise the bound per app with `PyreonQueryCache.shared.maxEntries = 500` on iOS or `PyreonQueryCache.maxEntries = 500` on Android.
