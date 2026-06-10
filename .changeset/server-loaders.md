---
'@pyreon/zero': minor
'@pyreon/router': minor
'@pyreon/server': patch
---

Server loaders (Phase 5 of the render-modes plan) — `.server.ts` siblings + single-fetch.

A route file's `.server.ts` sibling can export `serverLoader(ctx)` — it runs in-process on SSR/SSG (full `LoaderContext` incl. `request`), and on client-side navigations the router fetches the whole matched chain's data in **one** request from the auto-mounted `GET /_pyreon/data` endpoint (cookies flow; `redirect()` becomes a client navigation). The client bundle structurally excludes `.server.ts` modules — the client routes module never imports them (CI-gated by an artifact sentinel scan). A route may have `loader` OR a server-loader sibling, not both (build error names the fix).

Also fixed: route records whose data came from a server loader rendered WITHOUT the `LoaderDataProvider` (both render-gate branches checked only `record.loader`) — `useLoaderData()` read undefined even though preload had populated the data and the hydration blob carried it.
