---
"@pyreon/zero": minor
---

Auto-build the SSR/ISR server handler bundle when `mode: "ssr"` or `mode: "isr"` is set. Previously `vite build` produced only the client bundle and no `dist/server/entry-server.js`, leaving SSR/ISR apps unable to deploy without a manual `vite build --ssr` flag or a hand-written build script. `Adapter.build({ kind: 'ssr', … })` was implemented for all 6 adapters (vercel/cloudflare/netlify/node/bun/static) but never invoked from any production code path.

The new `ssrPlugin()` (auto-wired into `zeroPlugin()` when `mode === 'ssr' | 'isr'`) closes that gap, mirroring the SSG plugin precedent exactly: `apply: 'build'`, `enforce: 'post'`, per-mode env-flag gate (`PYREON_ZERO_SSR_INNER_BUILD`, distinct from SSG's `PYREON_ZERO_SSG_INNER_BUILD`). When `src/entry-server.ts` exists, that file is the bundle entry (preserves user-authored middleware / mode overrides / actions config). When absent, the plugin synthesizes the canonical `createServer({ routes, routeMiddleware, apiRoutes })` shape and cleans it up after the build. `adapter.build({ kind: 'ssr', … })` is invoked after the bundle lands; adapter throws are logged but not rethrown so the SSR bundle stays usable for hand-deploys.

Shared infrastructure between SSG and SSR/ISR (env-flag set/clear, atomic-write helpers, mkdir-cache, synthetic-entry materialization) lives in `ssr-build-shared.ts` so the two plugins can never independently drift their cleanup contracts.

`zeroPlugin()` now returns `[mainPlugin, ssrPlugin]` for SSR/ISR (same shape it already used for SSG). Consumer code `plugins: [pyreon(), zero()]` is unchanged — Vite's plugins array natively accepts nested arrays.
