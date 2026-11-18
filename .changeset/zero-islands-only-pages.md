---
'@pyreon/zero': minor
'@pyreon/server': minor
---

Islands-only pages. `export const hydrate = 'islands'` on a route or `_layout` (cascading like `renderMode`; `'app'` opts a page back in) ships the page as static HTML plus its `island()`s: the server still runs the loader and renders its output, but leaves out the `__PYREON_LOADER_DATA__` script and the route's modulepreloads and marks the page with `<meta name="pyreon-hydrate" content="islands">`. In the browser, `startClient` and the new `startClientLazy` (`@pyreon/zero/client-lazy`, which loads the routes and the app with dynamic imports) hydrate only the islands, from the `islands` registry you pass (`import * as islands from 'virtual:pyreon/islands-registry'`), optionally wrapped in an `islandRoot` component that provides context; no router starts. A client-side navigation to an islands-only route is a full page load. A computed `hydrate`, or an islands-only page that renders `'spa'`, is a `[Pyreon]` error when the routes module loads. A build whose routes never export `hydrate` compiles the support out of `startClient`.

`@pyreon/server`: `renderPage` and both `createHandler` modes honour `meta: { hydrate: 'islands' }` (new exports `ISLANDS_ONLY_MARKER`, `isIslandsOnlyMeta`, type `PageHydration`; `RenderPageResult` gains `hydrate`), and `hydrateIslands` / `hydrateIslandsAuto` take `{ root }`, a component loaded with the first island that wraps every island in its providers.

Upgrade: none
