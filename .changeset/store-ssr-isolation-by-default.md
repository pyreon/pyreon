---
'@pyreon/store': patch
'@pyreon/runtime-server': patch
---

**Per-request store isolation is now automatic; it used to be opt-in, and
nothing opted in.**

`@pyreon/store`'s registry is a module-level `Map`, and `@pyreon/runtime-server`
exposed `configureStoreIsolation(setter)` to swap in an AsyncLocalStorage-backed
provider. That was documented everywhere — README, manifest, generated docs all
said "call once at startup or concurrent requests share one global store
registry". Nothing called it.

The seam takes a *setter* as an argument for a reason: `@pyreon/server` and
`@pyreon/zero` own the server and neither depends on `@pyreon/store`, so neither
*can* wire it. That left the application author, reached only through a
paragraph in a package they never import. Verified on the default path — two
`runWithRequestContext` calls, which is exactly what two concurrent SSR renders
are, and the second read the first's store value.

`@pyreon/store` now publishes its setter on a `globalThis` seam when it loads on
a server, and the renderer picks it up at its render choke point — the same
shape as `__PYREON_STYLER_COLLECT__`, and for the same reason. No import in
either direction; the browser pays nothing.

`configureStoreIsolation` keeps working and still wins, but it is now the
override rather than the switch: reach for it to supply a custom provider (a
shared build-time cache across SSG pages, a test double). An app that already
calls it is unaffected.

**Behaviour change worth knowing about:** an SSG build that deliberately relied
on one registry persisting across page renders now gets a fresh one per render.
That was already a bug in the other direction — page 2 could ship page 1's state
— but if you want the old behaviour, pass your own provider.
