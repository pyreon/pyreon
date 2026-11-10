---
'@pyreon/zero': patch
'@pyreon/server': patch
---

Route and app middleware now gate every path that serves a page or its data. The single-fetch data endpoint and its route-middleware gate read the target page through one normaliser (doubled slashes collapsed; `\`, control characters and `.`/`..` segments refused with a 400), so the gated page is always the served page. ISR runs the app and route middleware before the cache lookup, so a cached page is never served to a request the middleware would refuse; middleware still runs once per request, its headers apply to cached responses, and background revalidation re-runs it as the original requester (socket address included). The OG image endpoint `/_zero/og/<page>.png` is gated by `<page>`'s route middleware and answers `private, no-store` when the page has route middleware or the request carried credentials. Per-route SPA shells run the middleware too. Server-island fragments are documented as public endpoints (not bound to the declaring page's route middleware).
