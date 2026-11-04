---
'@pyreon/router': minor
---

The INITIAL navigation now runs the guard pipeline. A deep link, a reload, or the URL an SSR request asked for used to be committed with no guard ever running, so `beforeEnter` and `beforeEach` (option or `router.beforeEach()`) blocked `push('/admin')` but let `https://app/admin` straight in. Route-level `redirect:` and route `middleware` were skipped the same way.

Now the first URL goes through route `redirect`, `middleware`, `beforeEnter` and global guards, with `from` = a START route that has no matched records (Vue Router's model):

- A redirect replaces the deep link on the client. On the server, `router.preload(url)` throws the same `redirect()` a loader does, so `@pyreon/server`'s handler answers with a 307 and zero's SSG writes it to `_redirects`.
- While the guards are pending, and after they cancel, `<RouterView>` renders nothing. A guarded route's loaders never run and its chunk is never preloaded.
- On the server, a guard that THROWS (one reading `window`/`localStorage`) is treated as undecidable: the server renders and the client's initial navigation enforces it. A guard that returns `false` or a path on the server gates the SSR HTML.
- `isReady()` now resolves after the initial guards (and any redirect) settle.

Behaviour change to check: an app whose guards reject a deep link will now see that rejection on first load (that is the fix). If you hydrate by hand with guards, `await router.isReady()` before `hydrateRoot` so the first client render matches the server; `@pyreon/zero` already awaits it. Apps with no guards are unaffected.
