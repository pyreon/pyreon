---
'@pyreon/router': minor
'@pyreon/zero': patch
'@pyreon/server': patch
---

`notFound()` thrown from a route `loader` or `serverLoader` now renders the not-found page instead of failing. The route enters the router's not-found state: `currentRoute()` resolves to the same `notFoundComponent` / `_404.tsx` chain an unmatched URL gets (inside its layouts, `isNotFound: true`, URL, params and query kept). SSR answers HTTP 404 in string and stream mode, where it used to answer 500 ("SSR render failed … Error: Not Found"). The loader-data blob carries a `__pyreonNotFound` marker, so the hydrating client resolves the same chain. The `/_pyreon/data` endpoint answers `{ "notFound": true }` instead of HTTP 500. A client navigation, `prefetchLoaderData` and `revalidate()` land on the same page. `router.runServerLoaders` can now return `{ kind: 'notFound' }`. Behaviour change: a loader's `notFound()` no longer calls `onError` and no longer leaves the page rendering with `undefined` loader data; like `redirect()`, it is treated as flow control. The next navigation leaves the not-found state.
