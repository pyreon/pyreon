---
'@pyreon/zero': patch
---

`faviconPlugin`: (1) fail the production build loudly when `sharp` is missing instead of silently shipping zero favicons; (2) cache-bust injected favicon `<link>` hrefs with a content-hash `?v=` query so a changed icon is actually re-downloaded by returning visitors.

Previously, if a `source` was configured but `sharp` wasn't installed, the plugin emitted a single swallow-able `console.warn` and generated nothing — `vite build` "succeeded" and the deployed site had **no favicons at all**, with no signal. That's the footgun.

Now: **dev** keeps the soft one-time warning (favicons just don't appear locally — iteration isn't blocked). A **production `vite build`** with a configured `source` and `sharp` missing is a **hard, actionable error** (`this.error` in `generateBundle`) — the build aborts with the install command, the source path, and the opt-out. To intentionally build without favicons, remove `faviconPlugin()`.

Bisect-proven via real `vite build`:
- `sharp` missing → build aborts with the actionable message, **no `dist`** (won't silently ship faviconless).
- `sharp` installed → build succeeds; all 8 assets (`favicon.ico/.svg`, 16/32 png, apple-touch-icon, icon-192/512, `site.webmanifest`) emitted **and** every `<head>` tag injected (`icon` svg+png, `apple-touch-icon`, `manifest`, `theme-color`).

**Cache-busting (same PR):** browsers cache favicons extremely aggressively, so a changed icon was never re-fetched by returning visitors (stable URLs, no hash). The injected `<link>` hrefs now carry a `?v=<hash>` derived from the source file content (FNV-1a) — same bytes → identical query (no cache churn), changed bytes → new query → browser re-downloads. The dev middleware strips the query before name-matching (dev serves fresh anyway). Theme-reactive favicons are unaffected — the light/dark swap toggles the `media` attribute, not `href`, so it's orthogonal. Documented caveat: the bare `/favicon.ico` convention request (no `<link>`) and the `site.webmanifest`'s internal icon entries keep stable URLs (host cache headers / re-resolved on PWA reinstall). Proven: real 3-build stable→change→revert; bisect-verified (stamp removed → 0 stamped links); pure unit test `favicon-version.test.ts` locks the hash contract.

Docs: new **Favicons** section in `docs/docs/zero.md` (one-source → full set + auto-injected head tags; `sharp` requirement + the dev-warn vs build-fail contract; cache-busting + caveats). No API change.
