---
'@pyreon/server': minor
'@pyreon/zero': patch
---

Apps deployed under a `base` path now work in production.

- `@pyreon/server`: `createHandler` accepts `base`. The per-request router now routes the base-stripped path and renders base-prefixed links. Before this, every page of a subpath deploy answered 404 while the unprefixed URL rendered.
- `@pyreon/zero`: `createServer` passes `base` to the handler. Under `base`, API routes, the data endpoint, server islands and actions answer at their base-prefixed URLs. The data endpoint at `<base>/_pyreon/data` now runs the target page's route middleware; it used to skip it. The node and bun adapter servers strip `base` before serving static files, so `<base>/assets/*` returns JavaScript instead of a page.

Upgrade: none
