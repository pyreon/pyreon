---
"@pyreon/router": patch
"@pyreon/compiler": patch
---

RouterLink/anchor link-DX fixes (PZ-07 + PZ-06).

**PZ-07 — `<RouterLink>` without a provider was broken three ways.** `RouterLink` now resolves its router exactly like every router hook does (`useContext(RouterContext) ?? activeRouter` via `getActiveRouter()`), so `setActiveRouter(router)` without a `<RouterProvider>` component renders correct hrefs and client-navigates. With NO router resolvable at all, the link degrades to a **plain anchor**: the `href` is the plain path and clicks are no longer intercepted, so the browser performs a full-load navigation. A dev-only (client-only) warning fires once per `to`: `[Pyreon] <RouterLink to="…"> rendered without a RouterProvider — falling back to a plain anchor…`.

**BREAKING (pre-1.0, deliberate):** the no-router fallback behavior changed — previously the `href` fell back to a hash URL (`#/path`) and `handleClick` called `preventDefault()` before bailing, leaving a dead link that swallowed clicks. If you relied on the hash-fallback `href` from provider-less links, pass a real router (provider or `setActiveRouter`).

**PZ-06 — dev-mode warning for full-reload internal anchors.** In dev (client only), `createRouter()` registers ONE document-level click listener that warns when a plain internal `<a href="/x">` is about to trigger a full page reload, with the `<RouterLink to="/x">` replacement in the message. `RouterLink`/framework links never warn (they `preventDefault()` the internal clicks they handle — the discriminator). External/`mailto:`/`#hash` hrefs, modifier/middle clicks, and anchors with `target`/`download` are skipped; deliberate full-load links can also opt out with a `data-allow-reload` attribute. Applies in both history and hash mode; the listener is removed by `router.destroy()` and is dev-only (tree-shaken from production bundles).

`@pyreon/compiler`: new `diagnoseError` catalog entry teaching the RouterLink-without-provider shape (the dev warning text + the old hash-fallback/dead-click symptoms) with the `<RouterProvider>` fix.
