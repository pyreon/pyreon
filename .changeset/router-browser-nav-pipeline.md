---
'@pyreon/router': minor
---

Router excellence pass — browser-navigation correctness + in-place revalidation:

- **Browser Back/Forward now runs the FULL navigation pipeline.** Pre-fix, popstate/hashchange did a bare path write — so loaders never re-ran (`useLoaderData()` was `undefined` after pressing Back, since loader data is pruned on leave), guards/blockers/middleware were bypassed, `afterEach` never fired (the a11y route announcer was silent on Back/Forward), and scroll positions + `meta.title` were not maintained. A traversal cancelled by a guard/blocker now restores the URL and history position (`history.go` via a per-entry `history.state.__pyreonIdx` stamp, `replaceState` fallback for entries the router didn't create).
- **`push()`/`replace()` resolve with a `NavigationResult`** (`'committed' | 'cancelled' | 'superseded'`) instead of `void` — Vue-Router-style navigation-failure detection in value form (`if (await router.push('/x') !== 'committed') …`). Existing `await router.push(...)` call sites keep compiling and behaving identically.
- **New `router.revalidate()`** — re-runs the CURRENT route's loaders in place and re-renders affected components (the mutation-then-refresh primitive; closes the "`invalidateLoader` only takes effect on next navigation" limitation). A revalidating loader that throws `redirect()` navigates.
- **`useMiddlewareData()` fixed** — it returned `{}` since inception (data was attached to an in-flight route object that never becomes `currentRoute()`). Middleware data is now published at commit time and read reactively; it resets per navigation.
- **`<RouterLink>` prefetch dedup** — hover/viewport prefetch now routes through the loader cache + in-flight dedup, so a prefetch and the click that follows share ONE loader run (was a guaranteed double-fetch).
- Behavioral notes: browser-traversal route updates are now asynchronous (they run the pipeline); when an explicit `scrollBehavior` is configured the router sets `history.scrollRestoration = 'manual'` for its lifetime (restored on `destroy()`) — without one, native scroll restoration keeps owning Back/Forward scroll exactly as before.
