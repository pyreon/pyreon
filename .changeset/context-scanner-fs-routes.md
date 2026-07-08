---
"@pyreon/compiler": minor
---

Project scanner (`generateContext`, powering `pyreon`/`zero context` and MCP `get_routes`) now detects **file-based routes** and **auto-named islands** — the dominant `@pyreon/zero` shapes it previously missed entirely.

- **Routes**: scans `src/routes/` (or `app/routes/` / `routes/`) and derives each URL from the file path using the zero fs-router convention (`index` → `/`, `[param]` → `:param`, `[...param]` → `:param*`, `(group)` segments URL-invisible, `_layout`/`_error`/`_loading`/`_404` skipped). API routes (`.ts`/`.js` under `api/`, or method-handler files) are marked `isApi: true` and keep their `/api/` prefix. `hasLoader`/`hasGuard`/`params` are detected per file. The existing manual-`createRouter([...])` array detection is kept for non-zero apps; when both exist, fs-routes win on path conflicts. Previously a zero app (file-based routing, no manual array) produced `routes: []`.
- **Islands**: `island(() => import(...), { hydrate: 'visible' })` bound to a `const <Name> = …` (zero's auto-naming, no explicit `name:`) is now detected via the TS AST, deriving the name from the binding identifier. Explicit `name:` still wins; the loader-argument shape is no longer over-constrained. Previously only islands with an explicit `name:` were found, so modern islands produced `islands: []`.
