---
'@pyreon/router': patch
---

fix(router): freeze `ResolvedRoute.meta` at flatten time to prevent silent cache corruption

`resolveRoute` caches each `FlattenedRoute`'s pre-merged `meta` object once at flatten time — the static, wildcard, and dynamic fast paths all return the SAME `f.meta` object identity across every navigation that resolves through the same FlattenedRoute. This is the cache that keeps resolution O(1) (and was extended to the dynamic path in the recent `meta-cache` PR — `/posts/42` and `/posts/99` now share one meta object).

The cache identity is what makes the design fast — but it also turns any user code that does `(props as any).meta.x = …` (the natural shape for "stash some per-navigation state here") into a permanent cache-poisoning bug. The mutation silently survives every future navigation to the same route AND every sibling navigating through the same parent chain. The footgun was not surfaced anywhere — `ResolvedRoute.meta` was typed `RouteMeta` (mutable), and the JSDoc said nothing about identity stability.

**Fix**:
- `Object.freeze` the cached meta in `makeFlatEntry` so mutation throws `TypeError` in strict mode (every Pyreon module file is strict).
- Mirror the freeze in `mergeMeta` (used by the not-found-fallback path) so the contract is consistent regardless of which resolver path produced the meta.
- Type-side: tighten `ResolvedRoute.meta` to `Readonly<RouteMeta>` + JSDoc documenting the identity-stability and per-navigation-state guidance ("attach to your own store / context — never write through `route.meta`").

The framework never writes to `route.meta` — only reads — so the freeze is purely a user-mutation safety net. Verified by typechecking every downstream package (`@pyreon/zero`, `@pyreon/server`, `@pyreon/head`, `@pyreon/core`) — none broke under `Readonly<RouteMeta>`.

Surfaced by an audit of all framework commits since v0.25.1 (sequential 7-agent workflow).

Bisect-verified-with-restore: 3 new regression specs in `meta-cache.test.ts` (`meta is frozen at flatten time (cache-mutation safety)` describe block) — `Object.isFrozen(meta)`, `mutation throws TypeError`, `cache stays uncorrupted after a thrown mutation attempt`. Reverting just the two `Object.freeze` lines fails all 3 specs, and the last one (`expected 1 to be undefined`) is the load-bearing proof of real cache corruption — a write on `/posts/42`'s meta leaks onto `/posts/99`'s meta. Restoring → 555/555 green.
