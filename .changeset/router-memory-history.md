---
'@pyreon/router': minor
'@pyreon/url-state': patch
'@pyreon/native-compiler': patch
---

`createRouter({ mode: 'memory' })`: an in-memory history, for a router embedded in a page that already has one (a live demo, a widget, a test harness) and for hosts with no `window`.

The location lives in an entry stack inside the router. `push`, `replace`, `back`, `forward` and `go` run the full navigation pipeline against it (blockers, middleware, guards, loaders, redirects, `afterEach`); a traversal that a guard cancels leaves the position where it was, and a step past either end does nothing. Nothing is read from or written to `window.history` or `location`, no window listener is attached, and a memory router never takes over the page router's restore of a cancelled Back, so it can share a page with a hash- or history-mode router. Start it with `initialEntries` (default `[url ?? '/']`) and `initialIndex` (default: the last entry). `<RouterLink>` renders the plain route path as `href`. A memory router leaves `document.title`, View Transitions and (unless `scrollBehavior` is set) scrolling to the page, and resolves an external `redirect('https://…')` as `'cancelled'`.

`Router['mode']` now includes `'memory'`. `@pyreon/url-state` reads and writes a memory router's own query instead of `location.search`. The native compiler names `initialEntries` / `initialIndex` as ignored on iOS/Android (the native routers are in-memory stacks already and open on their root route).
