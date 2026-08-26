---
'@pyreon/http': patch
---

Update the benchmark's `ky` comparison arm from 1.x to 2.0.2 (devDependency
only — `ky` is a head-to-head competitor in `bench/http-bench.ts`, not a runtime
dependency of `@pyreon/http`).

v2 renames `prefixUrl` → `prefix` and unifies every hook around a single state
object, so the bench's `afterResponse` moves from `(request, options, response)`
to `({ response })`.
