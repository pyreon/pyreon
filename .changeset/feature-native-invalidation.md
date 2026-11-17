---
'@pyreon/feature': minor
'@pyreon/query': minor
---

`@pyreon/feature`'s CRUD mutations now refresh the queries on iOS and Android the way they do on the web. A successful `useCreate()` / `useUpdate()` / `useDelete()` marks every query of the feature stale and refetches every mounted `useList()` / `useById()`; a failure refreshes nothing. `useUpdate().mutate({ id, data })` writes `data` into the cached `useById(id)` record before the request and rolls it back if the request fails. The optimistic write needs `data` to be an object literal of the schema's own fields; any other `data` skips only that write, with a warning naming why. The per-mutation warning that said native queries do not refresh is gone.

`@pyreon/query`'s native `PyreonQueryCache` (Swift and Kotlin) is now the query client behind this: `invalidateQueries(root)` marks every key `root` / `root:…` stale and refetches the live queries under it, `setQueryData(key, …)` writes optimistically and returns the rollback, and `settleMutation` applies both on a mutation's outcome. A query is live once it has registered its request, and leaves the registry when its view goes away: Swift holds it weakly and unregisters it in `deinit`, and Kotlin's `PyreonQuery` is a `RememberObserver` that unregisters when Compose forgets it.
