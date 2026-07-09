---
"@pyreon/zero": minor
---

Two `@pyreon/zero` fixes:

- **Server-only stubs re-exported from the client main entry are now a COMPILE error at the call site, not just a runtime throw.** `createServer` / `faviconPlugin` / `seoPlugin` / `defineConfig` / `validateEnv` / `ogImagePlugin` / `aiPlugin` were typed `(..._: unknown[]) => never`, so `createServer(cfg)` from `@pyreon/zero` typechecked cleanly and only crashed the built server at boot — a green-through-`tsc`/`zero dev`/e2e path that shipped a prod-crashing deployable. Each stub now takes a message-typed parameter, so calling it from the client entry FAILS `tsc` with an actionable "import from `@pyreon/zero/<subpath>`" message. The runtime throw is kept as belt-and-suspenders for non-typechecked callers (plain JS, `as any`). **Note:** code that (incorrectly) imported and CALLED one of these from `@pyreon/zero` will now fail typecheck — that is the fix; switch the import to the `@pyreon/zero/server` (or `/config`, `/env`, …) subpath.

- **`zero build` no longer logs a misleading "Skipping SSR build … index.html not found" during its dedicated server build.** The CLI runs a client build (→ `dist/client`) and then a `vite build --ssr` server build (→ `dist/server`); the SSR post-step plugin fired during the server build too, probed `dist/server/index.html` (which a server-only build never produces), and printed a scary warning followed by a green "Build completed" — a success-with-a-hole. The plugin now silently no-ops on a server-target build (`build.ssr` set), which has no client assets to post-process. The client-build pass (and raw `vite build` SSR) is unaffected.
