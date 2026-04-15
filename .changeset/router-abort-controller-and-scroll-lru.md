---
"@pyreon/router": patch
---

fix(router): don't clobber nav `_abortController` from prefetch/preload; bound scroll-position cache

Two router issues found during QA:

1. **Prefetch/preload destroyed navigation abort capability.**
   `prefetchLoaderData` (called from `<Link>` hover) and `router.preload()`
   both assigned `router._abortController = new AbortController()`,
   overwriting the controller owned by an in-flight navigation. The
   navigation's `signal` became orphaned — subsequent calls to
   `router._abortController?.abort()` cancelled the prefetch instead of
   the actual navigation. Fixed: both operations now use a LOCAL
   `AbortController`; only real navigations touch the shared field.

2. **`ScrollManager._positions` was unbounded.** Saved scroll position
   per distinct URL path, so SPAs with parametrised routes
   (`/user/:id`) or query-string variations accumulated entries
   forever. Added a 100-entry LRU cap — covers typical back-navigation
   depth; beyond that, scroll restoration is a nice-to-have not a
   correctness requirement.
