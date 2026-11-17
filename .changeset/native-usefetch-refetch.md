---
'@pyreon/hooks': patch
'@pyreon/native-compiler': patch
---

Native `useFetch(...).refetch()` now re-runs the request on iOS and Android. The emitted harness fetched inline (`begin()` … `resolve(…)`) and never handed the request to the runtime, so `PyreonFetch.refetch()` had nothing to re-run and a compiled refresh button silently did nothing — the same shape as `useQuery`'s #4504. The harness now registers the request through the new `PyreonFetch.run` (Swift `await f.run { … }`, Kotlin `f.run(launch = …) { … }`), which keeps it for `refetch()`; a slow first response can no longer overwrite a newer refetch's result.
