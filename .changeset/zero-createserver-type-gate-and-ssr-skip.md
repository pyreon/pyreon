---
"@pyreon/zero": minor
---

Two `@pyreon/zero` fixes:

- **Server-only APIs are no longer re-exported (as throwing stubs) from the client-safe `@pyreon/zero` entry — import them from their subpaths.** `createServer`, `faviconPlugin`, `seoPlugin`, `defineConfig`, `validateEnv`, `ogImagePlugin`, and `aiPlugin` were re-exported from the main barrel as `(..._: unknown[]) => never` stubs that threw only at RUNTIME — so `import { createServer } from '@pyreon/zero'; createServer(cfg)` typechecked cleanly through `tsc`/`zero dev`/e2e and only crashed the built server at boot (a prod-crashing deployable shipped with every check green). The stubs are now DELETED: each symbol lives only on its subpath (`@pyreon/zero/server`, `/favicon`, `/seo`, `/config`, `/env`, `/og-image`, `/ai`). Importing one from the main entry is now a structural compile error (`TS2305: '@pyreon/zero' has no exported member '<name>'`) instead of a runtime throw, and no server-stub code reaches the client bundle. **Breaking (intentional):** code that imported one of these from `@pyreon/zero` must switch to the subpath.

- **`zero build` no longer logs a misleading "Skipping SSR build … index.html not found" during its dedicated server build.** The CLI runs a client build (→ `dist/client`) and then a `vite build --ssr` server build (→ `dist/server`); the SSR post-step plugin fired during the server build too, probed `dist/server/index.html` (which a server-only build never produces), and printed a scary warning followed by a green "Build completed" — a success-with-a-hole. The plugin now silently no-ops on a server-target build (`build.ssr` set), which has no client assets to post-process. The client-build pass (and raw `vite build` SSR) is unaffected.
