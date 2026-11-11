---
'@pyreon/router': patch
---

A path that does not start with `/` no longer matches a route. The matcher assumed the leading `/` and dropped the path's first character, so `xabout` resolved to `/about` and `xuser/42` to `/user/:id`. Such a path now resolves like any other miss: to the catch-all route if there is one, otherwise to the not-found fallback. Every well-formed path (starting with `/`) resolves exactly as before.
