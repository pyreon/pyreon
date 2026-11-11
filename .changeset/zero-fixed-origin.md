---
'@pyreon/zero': patch
'@pyreon/http': patch
---

The node, bun and deno runners read `ORIGIN` (e.g. `https://example.com`) and use it as the origin of every request, so the client's `Host` header no longer decides where server-side code that resolves against the request origin (a relative SSR fetch under `runWithRequest`, `new URL('/api', ctx.url)`, the action origin check) sends its requests. An invalid `ORIGIN` stops the server at startup. The bun and deno runners answer a `Host` they cannot build a URL from with 400 instead of 500. Without `ORIGIN` the behaviour is unchanged; the deployment guide and the `@pyreon/http` SSR docs now say to set it.
