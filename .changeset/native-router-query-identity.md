---
'@pyreon/native-router-swift': minor
'@pyreon/native-router-kotlin': minor
---

A navigation that changes only the query keeps the screen. On iOS, every `useUrlState` write (`setQueryParam`) and every same-route `replace('/search?q=…')` rewrote the visible `NavigationStack` path element. SwiftUI treated that as a new destination, rebuilt the screen and dropped its `@State`. On both targets, route loaders and `useLoaderData()` were keyed by the full URL, so the same write hid a loader-bearing route's content and re-ran its loader.

- **Same stack shape on both platforms.** Each `router.path` and `tabPaths` element is now the route WITHOUT its query or fragment (`/search`, not `/search?q=cat#top`). Each entry's tail (`?query#fragment`) is kept beside it, and back, forward, tab switches and SwiftUI's swipe-back keep it in sync. A direct write to `path` / `tabPaths` whose element carries a query or fragment is normalised the same way. `currentPath` still returns the full URL, fragment included. The new `routePath` returns the route alone.
- **Query-only changes leave the stack element alone.** `setQueryParam` and a same-route `replace` change only the entry's query; the fragment is kept. On the root view the query is now reflected in `currentPath`, and a same-route `replace` there no longer pushes a second copy of the root.
- **Loader key.** `loaderData` is keyed by the route with the query dropped (`PyreonRouter.loaderKey(url)`), matching the web's default loader key.
- **Swift only.** The single-stack `NavigationStack` binds through the new `stackBinding()`, so a swipe-back re-resolves `params` / `query`. On both targets, `reset()` now re-resolves them too.

Migration:

- Code that read `router.path` / `tabPaths` (Swift and Kotlin) expecting the query or fragment inside an element should read `router.currentPath` / `router.query` (or Kotlin's `tabTop(name)`) instead.
- Code that read `loaderData[fullUrl]` directly should use `loaderData[PyreonRouter.loaderKey(fullUrl)]` (Swift also has `loaderData(for:)`).
