---
"@pyreon/zero": patch
---

`zero dev` no longer answers a non-GET request to an `/api/*` path with 405 when no pipeline middleware, API route or page route claims it. A user plugin hosting its own dev backend through `configureServer` (registered after Zero's) never saw `POST /api/send`; the SSR and 404 handlers already skipped such paths, the request pipeline's method fallback did not.
