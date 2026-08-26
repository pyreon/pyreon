---
'@pyreon/zero': minor
---

Security fix: ISR's default cache key is now fail-safe for credentialed requests.

`createISRHandler`'s cacheability check previously keyed only on RESPONSE
signals (`Set-Cookie` / `Cache-Control: private|no-store|no-cache` /
`Authorization` response header / `Vary: Cookie|Authorization`). A loader that
READS the request's `Cookie` / `Authorization` and renders per-user HTML but
returns a plain `200 text/html` (no `Set-Cookie`, no `Vary`) was judged
cacheable and stored under the URL-only default key — so one user's
personalized page could be served to the next visitor, including anonymous
ones. The same shape also let a credentialed background revalidation overwrite
(poison) a public/anon cache entry.

The default key is now request-credential-aware: when NO `cacheKey` is
configured, a request that arrived with a `Cookie` or `Authorization` header is
NOT cached unless the response explicitly opts in with `Cache-Control: public`.
The request is threaded into the cacheability decision on both the miss path
and the background-revalidation path, so the amplifier is closed too.

**Behavior change (some previously-cached pages now correctly bypass).** A page
that (a) receives a credentialed request AND (b) renders a plain `200 text/html`
with no `Cache-Control: public` AND (c) has no custom `cacheKey` will now render
per request instead of being cached. This is the confidentiality fix — such a
render was never safe to share.

**Migration.** If a page is genuinely public even for credentialed visitors, mark
its response `Cache-Control: public` to keep it cached. If it is personalized,
supply a `cacheKey: (req) => ...` that varies on the user identity to cache it
per user. A truly-public page with no request credentials caches unchanged. The
runtime now also emits a one-per-handler warning — in dev AND production — the
first time it refuses a credentialed request, so the misconfiguration is visible
where a CMS/webhook runs.
