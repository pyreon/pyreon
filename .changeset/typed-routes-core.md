---
"@pyreon/zero": minor
---

Typed route paths (foundation) — `RegisteredRoutes` / `RoutePath` / `RouteHref` + `generateRouteTypes`

Closes the "`<Link href>` is just `string`" DX gap with the standard
module-augmentation-of-a-registry-interface pattern (TanStack Router / Next typed
routes):

- `RegisteredRoutes` (empty by default; a generated `.d.ts` augments it per route),
  `RoutePath` (the path union, or `string` until routes are generated — so a fresh
  project is never broken), `RouteParams<P>` (a route's params shape), and
  `RouteHref = RoutePath | (string & {})` — which **autocompletes** registered routes
  while still accepting any string (dynamic / runtime-constructed paths never break).
- `LinkProps.href` is now `RouteHref` (non-breaking — it's `string` until codegen runs).
- `generateRouteTypes(routePaths)` + `extractRouteParams(path)` — the pure codegen that
  emits the augmenting `.d.ts` from the fs-router's `urlPath`s (`/posts/:id` →
  `{ id: string }`, `/blog/:slug*` → catch-all).

This is the type foundation + codegen; the `@pyreon/vite-plugin` wiring that writes the
generated `.d.ts` (so autocomplete lights up in a real app) is the next increment.
