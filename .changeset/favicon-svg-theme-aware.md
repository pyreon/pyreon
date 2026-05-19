---
'@pyreon/zero': patch
---

fix(favicon): SVG favicon now follows the theme toggle (was silently dead)

`faviconPlugin({ source: 'x.svg', darkSource: 'x-dark.svg' })` emitted a single static `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` with no `data-favicon-theme`/`media`. The theme-swap script + `initTheme()` only toggle `[data-favicon-theme]` links, and browsers prefer an SVG favicon over PNG when both are present — so the carefully theme-toggled PNG variants were never displayed and the favicon never changed with the app theme, in dev or prod, in every modern browser. The `darkSource` JSDoc also documented a `prefers-color-scheme` mechanism that was unimplemented (and would only track the OS, not a manual in-app toggle).

Fix — the SVG favicon now participates in the same `data-favicon-theme` contract as the PNG dual-variant, across every surface:

- `transformIndexHtml` + `faviconLinks` (SSR): when `darkSource` is set, emit two theme-aware SVG links — `/favicon-light.svg` (`data-favicon-theme="light"`) and `/favicon-dark.svg` (`data-favicon-theme="dark"`, `media="not all"`) — instead of one static link. The existing swap script / `initTheme()` already toggle them; the `?v=` cache-bust loop already stamps them.
- Build (`generateFaviconSet`) emits `favicon-light.svg` (source) + `favicon-dark.svg` (darkSource) alongside the existing wrapped `favicon.svg` (kept as the no-JS / direct-`/favicon.svg`-reference OS-`prefers-color-scheme` fallback only).
- Dev (`configureServer`) serves `/favicon-light.svg` → source and `/favicon-dark.svg` → darkSource (locale-aware; dev-badge / `devSource` applies to the light/active variant, matching the `/favicon.svg` handler).
- `darkSource` JSDoc rewritten to describe the actual app-toggle behaviour.

No-dark and PNG sources are unchanged (single `/favicon.svg`, no `data-favicon-theme`). Bisect-verified regression tests added (`favicon-plugin-hooks.test.ts` transform path + `favicon.test.ts` SSR `faviconLinks`).
