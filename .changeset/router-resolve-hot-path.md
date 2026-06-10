---
'@pyreon/router': patch
---

`resolveRoute` hot-path overhaul — Pyreon is now the fastest router at realistic route-table sizes on the cross-framework matching benchmark (`bench:router`, vs find-my-way / Hono / radix3 / react-router / TanStack / vue-router / path-to-regexp): 1.00× (leader) at 50 and 200 routes, ahead of radix3 at every table size; only Hono's mega-regex leads the 10-route toy table (an approach that measures 4.5× SLOWER than Pyreon at 50+ routes). Average throughput improved 13–29% per table size vs the previous implementation.

What changed (semantics preserved — 599 router specs + zero/server suites pass):

- **One index probe per resolve.** `buildRouteIndex` self-compiles on miss; a same-`routes`-reference identity memo (the dominant single-router case) replaces even the WeakMap probe.
- **`validateSearch` precomputed at flatten time.** Each flattened route stores its chain's effective validator (leaf→root, most-specific wins) — resolves no longer walk the matched chain per navigation.
- **Null-prototype dictionary indexes.** `staticMap` / `segmentMap` switched from `Map` to null-proto objects (~3× faster hit path; hostile keys like `__proto__` are plain own properties).
- **Offset-walking fast lane.** Plain paths (no `%`, no `//`, no trailing slash — the overwhelmingly common shape) match by walking the URL with offsets: static pattern segments compare in place via `startsWith`, only param values are sliced, no parts array. A single-pass shape scan routes encoded / empty-segment / trailing-slash URLs to the previous split-based matcher, so every edge shape behaves exactly as before by construction.
- **Per-bucket segment-count dispatch.** All-fixed-count buckets index candidates by count, structurally eliminating count-mismatch rejects; buckets containing splat/optional candidates keep the ordered flat scan so definition-order priority (first match wins) is preserved — locked by a bisect-verified spec.
- **Frozen empty singletons** for no-params / no-query / no-search results (the `meta` freeze precedent): three fewer allocations per navigation; mutation of an EMPTY `params`/`query`/`search` now throws in strict mode instead of silently polluting a shared object. Non-empty values are still fresh per resolve.

Also fixed along the way: **URL hash/query split order now follows the WHATWG URL spec.** `resolveRoute('/user/42?tab=posts#bio')` previously leaked the fragment into the query (`{ tab: 'posts#bio' }`) because `?` was split before `#`; a `?` inside a fragment was misread as a query separator. The fragment is now everything after `#`, with the query between `?` and `#`.
