---
'@pyreon/zero': patch
---

Three request-handling security fixes.

**Server-action CSRF: compare ORIGINS, not prefixes.** `createActionMiddleware`
matched the `Origin` / `Referer` header with `startsWith`, so any origin merely
beginning with the request's own passed — `https://app.example.com.evil.net`,
`https://app.example.comevil.net`, `https://app.example.com@evil.net`. The
`corsOrigins` allowlist had the same defect. The header is now parsed and its
origin compared by equality (a `Referer` reduced to its origin first); an
unparseable header is rejected. `corsOrigins` entries are matched exactly — the
JSDoc no longer says STARTS-WITH.

**Rate limiting: `X-Forwarded-For` is only read when a proxy is declared.** The
default key took the header's first entry, which is the caller's own claim: a
rotating header bypassed the limit entirely, and a prepended victim address
exhausted the victim's bucket. New `trustProxy?: boolean | number` option —
`false` (default) reads no forwarded header at all, `true` takes the last entry,
`n` the n-th from the right. Without it the limiter uses
`ctx.locals.remoteAddress` when a host adapter supplies it, else one shared
bucket plus a once-per-process warning naming the option.

**Server actions no longer return a handler's error message to the client in
production.** A throw returned `err.message` verbatim (connection strings,
credentials, internal hostnames). Production now returns a generic message;
the real error is still logged, and the detail is kept outside production.
