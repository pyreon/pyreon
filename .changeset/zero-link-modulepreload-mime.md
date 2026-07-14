---
"@pyreon/zero": patch
"@pyreon/router": minor
---

fix(zero): route prefetch injected `rel="modulepreload"` at the route path → strict-MIME error on every hovered link

`<Link>` / `useLink` / `createLink` / `prefetchRoute`'s hover + viewport prefetch (`doPrefetch`) injected `<link rel="modulepreload" href={routePath}>`. The href is the navigation PATH, which an SSR server returns as `text/html`, so the browser fetched it as a module script and logged `Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"` on **every** hovered link — plus a wasted HTML round-trip. Navigation still worked (the real chunk loads via the router's lazy loader on nav), so it was cosmetic-but-noisy, in dev and any SSR deployment.

The chunk is now warmed correctly through the router's own lazy loader: `router.preload(path, undefined, { skipLoaders: true })` imports the real Vite-resolved chunk into the component cache (code only — no loader/data side effects on hover), always the correct chunk URL. Only the valid `rel="prefetch" as="document"` document hint is injected. `@pyreon/router` now exports `getActiveRouter` / `setActiveRouter` (the standalone `prefetchRoute` resolves the active router the same way the hooks do).
