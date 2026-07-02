---
'@pyreon/zero': minor
'@pyreon/zero-cli': patch
---

Render-mode DX, Tier 1 — "zero decides, you override, everything is visible":

- **Per-route mode table on every build** — `○ ssg · λ ssr · ⟳ isr · ⚡ spa` with `(declared)` marking per-route overrides (apps >40 routes collapse to the counts line). New public helpers on `@pyreon/zero/server`: `collectFileRouteModes` (file-level mode resolution with layout cascade) + `formatRouteModeTable`.
- **`zero dev` banner mode line** — shows the app mode plus hybrid overrides (`Mode  ssr (hybrid: 2 ssg, 1 isr)`), and the route summary/table now shows TRUTHFUL resolved per-route modes (previously every route was stamped with the default).
- **Adapter auto-detection** — `adapter` unset + building on Vercel / Netlify / Cloudflare Pages (`VERCEL` / `NETLIFY` / `CF_PAGES` env) picks that platform's adapter automatically; explicit `adapter` always wins; local builds keep `node`.
- **No more silent missing SSG pages** — a dynamic route with no `getStaticPaths` under SSG now produces a loud build warning naming the file and the three fixes (previously the page was silently absent from `dist/`). Routes declaring a non-static `renderMode` and API routes are exempt.
