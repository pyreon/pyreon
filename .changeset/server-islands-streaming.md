---
'@pyreon/server': minor
'@pyreon/zero': minor
'@pyreon/runtime-dom': patch
---

Server islands + streaming by default (Phase 4 of the render-modes plan).

**`serverIsland(loader, { name, fallback?, cache? })`** — the inverse of client islands: a cacheable page with per-request server-rendered holes. Every render emits only a `<pyreon-server-island>` marker (codec-encoded props); the marker self-activates on mount and fetches `GET /_pyreon/fragment/<name>` — auto-mounted by zero's `createServer` — which renders the registered component per request with full request context (`useRequestLocals()` works inside fragments). Name-allowlisted endpoint, `no-store` by default with an opt-in `cache` option, fallback-degrading failures, and cold-start registry warming for lazy routes. Registry is `globalThis`-keyed so bundle-split module duplication can't split it.

**`mode: 'ssr'` now streams by default** — shell flushes immediately, Suspense boundaries resolve out-of-order with inline style flushes. Opt out with `ssr: { mode: 'string' }`. ISR stays buffered (the SWR cache stores complete bodies), including per-route `renderMode = 'isr'` declarations inside streaming apps (they get a buffered render automatically).

**Fixed (`@pyreon/runtime-dom`)**: `data-*`/`aria-*` props on CUSTOM ELEMENTS now land as real attributes instead of JS properties — `getAttribute`/`dataset`/CSS attribute selectors/SSR output all agree again. (This was how the server-island marker lost its `data-name` on client mounts; bisect-locked.)
