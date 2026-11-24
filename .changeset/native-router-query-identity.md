---
'@pyreon/native-router-swift': minor
'@pyreon/native-router-kotlin': minor
---

A navigation that changes only the query keeps the screen. On iOS every `useUrlState` write (`setQueryParam`) and a same-route `replace('/search?q=…')` rewrote the visible `NavigationStack` path element, so SwiftUI treated it as a new destination, rebuilt the screen and dropped its `@State`. Route loaders and `useLoaderData()` were keyed by the full URL on both targets, so the same write hid a loader-bearing route's content and re-ran its loader.

- Swift: each `router.path` element is now the route WITHOUT its query (`/search`, not `/search?q=cat`); each entry's query is kept beside it (back, forward, tab switches and SwiftUI's swipe-back keep them in sync). `currentPath` still returns the full URL; the new `routePath` returns the route alone. `setQueryParam` and a same-route `replace` change only the query, and on the root view the query is now reflected in `currentPath` (a same-route `replace` there no longer pushes a second copy of the root). The single-stack `NavigationStack` binds through the new `stackBinding()`, so a swipe-back re-resolves `params` / `query`; `reset()` now also re-resolves them.
- Swift and Kotlin: `loaderData` is keyed by the route with the query dropped (`PyreonRouter.loaderKey(url)`), matching the web's default loader key. Kotlin's `setQueryParam` on the root view now updates `currentPath` too.

Migration: code that read `router.path` (Swift) or `tabPaths` expecting the query inside an element should read `router.currentPath` / `router.query` instead. Code that read `loaderData[fullUrl]` directly should use `loaderData[PyreonRouter.loaderKey(fullUrl)]` (Swift also has `loaderData(for:)`).
