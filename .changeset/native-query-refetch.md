---
'@pyreon/query': patch
'@pyreon/native-compiler': patch
---

`q.refetch()` on a `useQuery` compiled to iOS or Android now re-runs the request. Before, it did nothing.

The compiled harness fetched inline and never gave the native query its request, so `refetch()` had nothing to run. The harness now hands the request to the query (`q.run { … }` on Swift, `q.run(launch = …) { … }` on Kotlin). The query fetches it when the cache is stale and keeps it, so `refetch()` re-runs it, ignoring staleness, like the web. `isFetching` is true while the refetch is in flight. Success replaces `data`, and failure sets `error` and keeps the last good `data`. Each fetch carries a generation number, so a slow, superseded response, or one for a key that has since changed, no longer overwrites newer data or the cache. A request cancelled because the view left no longer shows up as an `error`.

Runtime API: `PyreonQuery.load(fetcher)` (synchronous) is replaced by the async `run`. A plugin's Compose `lifecycle.kotlin` now receives a `KotlinEmitContext`, so a harness can ask for the composable's coroutine scope; that scope is declared above any harness that reads it.

The compile gate no longer caches swiftc's `input file '…' was modified during the build` as a rejection. That message describes no single version of the source. Once cached, it was served for that source forever, and an entry already stored that way now reads as a miss.
