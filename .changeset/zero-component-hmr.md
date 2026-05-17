---
'@pyreon/vite-plugin': patch
'@pyreon/router': patch
'@pyreon/zero': patch
---

Component-level HMR for zero/router apps — editing a route/page component now updates the DOM in place without a manual refresh, preserving module-scope signal state.

Previously `@pyreon/vite-plugin`'s `injectHmr` emitted a bare `import.meta.hot.accept()` (no callback): Vite re-evaluated the edited module but nothing re-rendered the mounted tree, and the self-accept suppressed Vite's full-reload fallback — so every component/JSX edit produced a silently-stale UI until a manual browser refresh.

Now the accept callback hands the fresh module to `globalThis.__pyreon_hmr_swap__` (registered by `@pyreon/router` in a dev browser, zero import coupling). The coordinator finds every active matched lazy route whose `_hmrId` matches (emitted by `@pyreon/zero`'s fs-router as `lazy(() => import(…), { hmrId })`), swaps the component, and bumps the loading signal so `RouterView` re-renders only that subtree in place — no page reload, so module-scope signals keep their values via the existing `__pyreon_hmr_registry__`. Edits outside the active route tree (nested components, unrelated routes, signal-only modules) or apps without the coordinator fall back to `import.meta.hot.invalidate()` → an automatic full reload (still no manual refresh). Production is unaffected (dev+browser gated).
