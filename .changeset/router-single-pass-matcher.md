---
'@pyreon/router': minor
'@pyreon/compiler': patch
---

Faster route matching. `resolveRoute` now scans a URL once: the same pass finds where the path ends (`?` / `#`), checks that the path is plain, and records every segment boundary. Matching then compares static segments in place with no further searching. A static route with no query, hash or `validateSearch` returns one cached frozen `ResolvedRoute`, so resolving it allocates nothing.

Behaviour changes:

- A static resolve returns the SAME frozen object each time. Treat a `ResolvedRoute` as read-only; copy it (`{ ...route }`) to annotate it. The router's own navigation pipeline already works on a copy.
- Paths with `%`-escapes, `//` or a trailing slash now go through the same matcher as plain paths. Their results now use the shared frozen empty `params` (catch-all) and `search` (no `validateSearch`) objects that plain paths already returned.
- A path without a leading `/` (for example `about`) now never matches a route; it resolves to the catch-all or not-found result. Before, such paths were matched with their first character dropped, so `xabout` could resolve to `/about`.

`@pyreon/compiler`'s `diagnose` catalog gains an entry for `Cannot add property X, object is not extensible`, the error that code writing onto a static route's shared frozen `ResolvedRoute` now raises.
