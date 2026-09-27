---
'@pyreon/zero': minor
'@pyreon/server': patch
'@pyreon/create-zero': patch
---

Security and production-correctness fixes for zero's server runtime.

- **Route middleware can no longer be bypassed.** It is matched on the pathname (a query string used to skip it), with `base` and the i18n locale prefix removed, and the `/_pyreon/data` endpoint now runs the middleware of the page whose data it returns (it used to run none, so client-side navigation exposed server-loader data behind an auth middleware). `_layout.tsx` middleware is now applied to the pages under that layout; it was silently ignored.
- **Middleware runs before the framework endpoints.** App-wide and route middleware now run before API routes, server actions, the data endpoint and island fragments, so auth, rate limits, CORS and security headers apply to them.
- **`zero({...})` settings reach the production server.** The serializable config (`mode`, `base`, `ssr`, `isr`, `routeRules`, `i18n`) is injected into the server build and merged under the entry's own `config`. ISR, `base` and route rules previously had no effect in production. Code-valued options (`middleware`, custom ISR store or `cacheKey` function) print a build warning when there is no `src/entry-server.ts` to carry them. `ssr.mode` defaults to `'string'`; streaming is opt-in with `ssr: { mode: 'stream' }`.
- **ISR caches page renders only.** Non-HTML responses (API JSON), responses with a per-response CSP nonce, and responses that vary on headers outside the cache key are no longer cached; cached entries keep their own content type (JSON was replayed as `text/html`). API routes and framework endpoints bypass ISR entirely. Concurrent cold misses for the same key render once (never for credentialed requests), a cold render no longer repopulates an entry invalidated while it ran, and revalidation failures are logged.
- **Node adapter server:** request bodies are forwarded (POSTs arrived empty), the request origin comes from `Host` (server actions failed their same-origin check), a throwing handler returns 500 instead of exiting the process, and the client address is passed to `ctx.locals.remoteAddress` so rate limiting keys per client. The Bun runner also passes the client address and no longer runs `Bun.serve` in development mode.
- The server bundle is built with `NODE_ENV=production`, and the scaffolded Dockerfiles set it and run as a non-root user; `wrangler.toml` sets it too.
- `@pyreon/server`: a throwing middleware returns 500 instead of rejecting, server errors are always logged, and adapters can supply the client address via `Symbol.for('pyreon.remoteAddress')`.
- `cacheMiddleware` no longer marks a page `public` for a request carrying a Cookie or Authorization header. API routes answer `HEAD` with their `GET` handler, and actions/rate-limit/logger match on the pathname.

Upgrade: manual — app and route middleware now run before API routes, actions and the data endpoint, and `_layout.tsx` middleware now applies to its pages, so review middleware that assumed it never saw those requests; streaming SSR is opt-in via `ssr: { mode: 'stream' }`.
