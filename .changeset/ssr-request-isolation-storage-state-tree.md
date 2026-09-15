---
'@pyreon/runtime-server': patch
'@pyreon/state-tree': patch
'@pyreon/storage': patch
---

Isolate the `@pyreon/storage` and `@pyreon/state-tree` key-addressed registries per SSR request

Both packages kept a module-level registry keyed by a user-chosen key — correct in a browser, where one process serves one user, and a cross-request state bleed on a server, where one process serves everyone.

- `@pyreon/storage`'s registry cached the resolved SIGNAL per `backend:key`, so a second concurrent request's `useCookie('session')` was handed the signal the first request created, holding the first user's value. `setCookieSource`'s accessor form exists for exactly this case; the cache sat above it and short-circuited the read, so the accessor was consulted on the first request and never again. `useMemoryStorage`'s byte store had the same shape one layer down and is now request-scoped too.
- `@pyreon/state-tree`'s `asHook(id)` was a process-global singleton, so two concurrent requests calling `Cart.asHook('cart')()` shared one instance.

Both now mirror the `@pyreon/store` seam: a registry provider plus a `globalThis` setter that `@pyreon/runtime-server` picks up automatically inside `renderToString` / `renderToStream` / `runWithRequestContext`. No application wiring is required, and no package imports another. Client behaviour is unchanged — outside a request scope the provider answers `undefined` and the process-wide registry is used, so the storage refcount contract and the `asHook` singleton contract both hold exactly as before.
