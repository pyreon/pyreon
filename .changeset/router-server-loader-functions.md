---
'@pyreon/router': minor
'@pyreon/server': minor
'@pyreon/zero': patch
'@pyreon/testing': patch
'@pyreon/cli': patch
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
---

The router's server-only loader passes are free functions now, so client bundles no longer carry them (about 250–310 B gzipped off the initial JS of every routed app, measured on hn-clone, ui-showcase and collab-board). A method on the router object ships whether or not anything calls it; a free function that the client never imports is dropped.

Breaking (`@pyreon/router`):

- `router.preload(path, request?)` is now `preloadRoute(router, path, request?)`: initial guards, lazy route components, then the matched loaders. Every SSR/SSG host calls it before rendering.
- `router.preload(path, request?, { skipLoaders: true })` is now `router.preloadComponents(path)`: lazy route components only, never loaders. It resolves `false` when the initial guards refuse the route. Zero's hydrating client and `<Link>` prefetch use it.
- `router.runServerLoaders(path, request?)` is now `runServerLoaders(router, path, request?)`. Its result type is exported as `ServerLoadersResult`.

`router.preload` is gone rather than changed, so an old call fails loudly (a type error, and `router.preload is not a function` at runtime) instead of silently rendering without loader data.

Breaking (`@pyreon/server`): `renderPage`'s `RenderablePageRouter` is now the router's `Router` type rather than a structural `{ preload, currentRoute }` shape, because `preloadRoute` needs the whole router. Pass the router `createRouter` or zero's `createApp` returns. New `RenderPageOptions.onPreloaded` is called once the preload has settled and before the render; zero's dev SSR uses it instead of wrapping `router.preload` to tell a loader failure from a render failure.

Upgrade: codemod router-server-loader-functions
