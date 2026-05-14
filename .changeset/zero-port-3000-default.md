---
'@pyreon/zero': patch
---

`@pyreon/zero` Vite plugin now defaults to port 3000 — matching `zero dev` / `zero preview` (already 3000), the runtime adapter (already 3000), and Next.js / Remix / Astro convention.

Precedence (verified end-to-end against a running example):

1. **Vite CLI `--port N` flag** — the plugin's `config()` hook detects `--port` / `--port=N` / `-p N` / `-p=N` in `process.argv` and omits its `server.port` entirely so Vite's CLI parsing wins (proven empirically: `vite --port 5174 --strictPort` binds 5174, not 3000).
2. **User `vite.config.ts` `server: { port: N }`** — user config beats plugin in Vite's merge order.
3. **`zero({ port: N })`** — resolved into `config.port` and applied unconditionally (even when CLI has `--port` — explicit user intent in vite.config.ts wins over the argv detection).
4. **Default 3000** — applied when no other source set a port (proven empirically: bare `vite` against `zero({})` binds 3000).

The argv-detection layer is load-bearing — PR #579 closed because returning `server.port: 3000` from `config()` unconditionally clobbered `vite --port 517N --strictPort` in the e2e webServer (Vite's CLI flag does NOT override a plugin `config()` hook's `server.port` return — counterintuitive but empirically confirmed). The new approach uses `argvHasPortFlag(process.argv)` at the hook's firing point to decide whether to apply the default.

Bisect-verified across 7 unit tests + 6 helper-fn tests + 2 real-Vite end-to-end runs (no flag → 3000, `--port 5174` → 5174).
