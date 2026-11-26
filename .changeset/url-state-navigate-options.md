---
'@pyreon/url-state': patch
---

With `setUrlRouter(router)`, every url-state write now passes `{ scroll: false, viewTransition: false }` to the router's `replace` / `push` (#4814). A param write edits the page it is on, so `@pyreon/router` neither scrolls to the top nor runs a view transition, for a push as much as a replace. `UrlRouter.replace` / `push` take that optional second argument (`UrlNavigateOptions`). A router that takes one argument ignores it.
