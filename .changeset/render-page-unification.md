---
'@pyreon/server': minor
'@pyreon/runtime-server': patch
'@pyreon/zero': patch
---

Unified string-mode render pipeline + a shipped `useRequestLocals` fix.

**New `renderPage()` in `@pyreon/server`** — the one per-page render sequence (preload with `redirect()` catching → render with head collection → CSS-in-JS collect → loader-data script → HTTP status via the `notFoundComponent` chain), now shared by the production handler, zero's SSG prerender entry, and zero's dev SSR middleware. Pre-unification each consumer hand-copied the sequence and the copies drifted (styler tag missing from SSG, dual noindex call sites, serializer divergence). Template composition and streaming stay caller-specific by design.

**Fixed: request-level `provide()` never reached rendered components.** `renderToString` / `renderToStream` always opened a FRESH ALS context stack, silently discarding every request-level provide — so `provideRequestLocals(ctx.locals)` in the handler never made `useRequestLocals()` resolve anything but the default inside a component, despite the documented contract. Both renderers now INHERIT an active `runWithRequestContext` scope (bare calls keep their fresh isolated stack). Bisect-verified regression specs at both the runtime-server and renderPage layers.

Dev-SSR behavior change (zero): a loader-thrown `redirect()` in `vite dev` now produces a redirect page (meta-refresh + status) matching production's 302/307 semantics, instead of escaping to the Vite error overlay.
