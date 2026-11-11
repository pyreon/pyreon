---
'@pyreon/zero': minor
---

Route middleware now gates two paths that skipped it.

- A server action runs only after the route middleware of the page that declares it (its layouts' and its own), on `/_zero/actions/<id>` and when posted to any page with `?_action=<id>` (that page's middleware runs too). Before, both ran an action declared on a guarded page without that page's middleware. In an app with route middleware, an action defined outside a page module (for example a shared `src/actions.ts`) is now refused with `403` instead of running without a gate: move it into the page (or the page's `.server.ts` sibling) whose middleware should guard it.
- A `_layout` middleware now also runs for a URL under its folder that matches no page. Such a URL renders the folder's not-found page inside the layout, running the layout's loader; before, its data reached the 404 HTML and `/_pyreon/data` without the layout's middleware.

`RouteMiddlewareEntry` gains an optional `gate` field (generated for `_layout` entries).

Upgrade: manual — in an app with route middleware, move each action defined outside a page module (e.g. a shared `src/actions.ts`) into the page, or its `.server.ts` sibling, whose middleware should guard it; until then it answers 403.
