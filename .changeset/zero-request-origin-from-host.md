---
'@pyreon/zero': patch
'@pyreon/vite-plugin': patch
---

The request URL's origin now comes only from the transport and `Host`; the request-target contributes only a path and query. The node runner and the dev servers resolved the target as a URL relative to the origin, so a target such as `//host/x` or an absolute-form target chose the URL's origin, which the server-action same-origin check compares against. A `Host` that would re-shape the URL is answered with 400.

The node, bun and deno runners no longer serve hidden paths (any `.`-prefixed segment except `/.well-known/`) as static files, adapter staging never copies `.vite/` into the client dir, and the SSG plugin removes the internal `.vite/manifest.json` on every exit, including SSR/ISR builds with no static route.

`og:image` on SSR/ISR pages uses `routeOg.siteUrl` when set and is injected per response outside the ISR cache, so a request's `Host` is never stored in a cached page.
