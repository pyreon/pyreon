---
'@pyreon/router': patch
---

perf(router): reuse the cached FlattenedRoute meta on dynamic-route navigations

`resolveRoute` pre-computes each route's merged `meta` once at flatten time (cached in the WeakMap-keyed route index). The static and wildcard fast paths already reuse it, but the two dynamic-route paths re-ran `mergeMeta(matched)` — a fresh object allocation plus a per-record `Object.assign` loop — on every navigation to a dynamic route (the most common case: `/posts/:id`, `/user/:id`).

`MatchResult` now carries the cached `f.meta`, so the dynamic paths reuse it like the others. Behavior-preserving (the value is byte-identical — it's the same merge). Bisect-verified: two navigations to the same dynamic route now return the SAME `meta` object identity (`tests/meta-cache.test.ts`); pre-fix each allocated a fresh `mergeMeta` result. 522/522 existing router tests pass.
