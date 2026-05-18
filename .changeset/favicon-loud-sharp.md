---
'@pyreon/zero': patch
---

`faviconPlugin`: fail the production build loudly when `sharp` is missing instead of silently shipping zero favicons.

Previously, if a `source` was configured but `sharp` wasn't installed, the plugin emitted a single swallow-able `console.warn` and generated nothing — `vite build` "succeeded" and the deployed site had **no favicons at all**, with no signal. That's the footgun.

Now: **dev** keeps the soft one-time warning (favicons just don't appear locally — iteration isn't blocked). A **production `vite build`** with a configured `source` and `sharp` missing is a **hard, actionable error** (`this.error` in `generateBundle`) — the build aborts with the install command, the source path, and the opt-out. To intentionally build without favicons, remove `faviconPlugin()`.

Bisect-proven via real `vite build`:
- `sharp` missing → build aborts with the actionable message, **no `dist`** (won't silently ship faviconless).
- `sharp` installed → build succeeds; all 8 assets (`favicon.ico/.svg`, 16/32 png, apple-touch-icon, icon-192/512, `site.webmanifest`) emitted **and** every `<head>` tag injected (`icon` svg+png, `apple-touch-icon`, `manifest`, `theme-color`).

Docs: new **Favicons** section in `docs/docs/zero.md` (one-source → full set + auto-injected head tags; `sharp` requirement + the dev-warn vs build-fail contract). No API change.
