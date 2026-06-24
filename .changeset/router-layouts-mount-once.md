---
"@pyreon/router": patch
---

fix(router): parent layouts persist across child navigation (restore "layouts mount once")

`RouterView`'s per-depth `depthEntry` computed dedup included `a.route === b.route`
in its `equals`. Because `router.currentRoute()` returns a fresh `ResolvedRoute`
object on every navigation, that comparison was *always* false on any nav — so the
component at **every** matched depth re-mounted on every page change, including the
**parent layout**. That defeated the documented "layouts mount once" contract: a
layout re-mount tears down its persistent chrome (sidebar/header), resetting things
like scroll position and flashing the UI on each navigation.

Now `route` only forces a re-emit at the **leaf** depth (the page that actually
consumes `params` / `query` / loader data via `renderWithLoader`). Parent layouts
re-emit only when their own `rec` / `comp` / `errored` changes, so they persist
across child navigations while the leaf still re-renders with fresh route data.
Components needing parent-level route data read it reactively (`useParams` /
`useLoaderData`), which update without a re-mount.

Verified: a new `integration.test.tsx` contract test (a parent layout's live DOM
node survives navigation between its children — bisect-verified to fail against the
old equals), the full 612-test router suite (incl. all loader tests), and the
`ssr-showcase` e2e (loaders + nested layouts + back/forward + 404 all still pass).
