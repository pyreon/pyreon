---
"@pyreon/reactivity": patch
"@pyreon/zero": patch
---

fix: Cloudflare (workerd) SSR deploy — guard singleton sentinel against undefined import.meta.url + inline the built SSR template

Cloudflare Pages SSR (`mode: "ssr"` / `"isr"` with `adapter: "cloudflare"`) ran in workerd, where two assumptions of the SSR path broke (verified in the real runtime via `wrangler pages dev` — a Node-side test can't catch either):

- **`@pyreon/reactivity`** — `normalizeLocation` no longer crashes when a runtime passes `undefined`/empty `import.meta.url` (workerd does). A bare `url.indexOf('?')` threw `Cannot read properties of undefined (reading 'indexOf')` at module init, taking down every `@pyreon`-based Cloudflare Worker at startup. The guard returns `"<unknown>"`; duplicate detection keys on the package name + location, so a single re-registering instance is idempotent (same-location early-return) and the only degraded case (two genuinely-distinct `<unknown>` instances → missed duplicate) is the documented safe failure mode and structurally unreachable in workerd's single bundle.
- **`@pyreon/zero`** — the cloudflare adapter inlines the built `index.html` (with the hashed client entry) into `globalThis.__PYREON_SSR_TEMPLATE__` in `_worker.js` and dynamic-imports the handler, so the global is set before `createServer → readBuiltTemplate` evaluates. workerd has no filesystem, so the prior `readFileSync` template path couldn't reach the staged sibling → SSR rendered but shipped the dev `entry-client.ts` and never hydrated. `readBuiltTemplate` now reads the global first, falling back to `readFileSync` for Node runtimes (node/bun/vercel/netlify). Requires the `nodejs_compat` flag (the create-zero cloudflare scaffold sets it).

Both `patch` — bug fixes, no public API change.
