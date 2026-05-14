---
'@pyreon/zero': patch
---

`@pyreon/zero` Vite plugin now defaults to port 3000 — matching `zero dev` / `zero preview` (already 3000) and the runtime adapter (already 3000). Previously `zero({})` left port-handling to Vite's 5173 default; the zero-canonical surface is now 3000 across all entry points.

Precedence order preserved:
1. CLI `--port N` flag (highest — Vite inline config)
2. User `vite.config.ts` `server: { port: N }` (user config beats plugin)
3. `zero({ port: N })` in `vite.config.ts` (plugin-resolved)
4. Default `3000`

Note: `vite.config.ts server.port` and `--port` still win — the plugin's `config()` hook is the lowest-precedence layer in Vite's merge order, so this is a default not an override. Apps that need a different port (multi-example workspaces, etc.) continue to work without changes.

Bisect-verified: reverted the unconditional emission in `vite-plugin.ts:config()` → `vite-plugin-config.test.ts > port defaults > defaults to 3000` fails with `Cannot read properties of undefined (reading 'port')` (config.server is undefined when guard is in place); restored → all 11 plugin-config tests pass.
