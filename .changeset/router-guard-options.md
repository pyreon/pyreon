---
'@pyreon/router': minor
---

`createRouter` accepts `beforeEach` and `afterEach` arrays. They run before any guards or hooks added later with `router.beforeEach()` / `router.afterEach()`, with the same contract. This is the form the native targets lower, so a shared source that declares its guards with the routes now behaves the same on the web. Before, the web router ignored the option and the guarded route rendered, although the API reference already listed it.
