---
'@pyreon/create-zero': patch
'@pyreon/zero': patch
---

fix(create-zero): scaffolded deploy configs now match the adapters' actual output paths (shared contract + drift-proof test)

The scaffolder's deploy configs hardcoded paths no `@pyreon/zero` adapter has ever emitted — every scaffolded node/bun/netlify deploy was broken from inception:

- **node/bun Dockerfiles** ran `dist/server.js`; the adapters emit `dist/index.js` (node) / `dist/index.ts` (bun). Fixed (`CMD ["node", "dist/index.js"]` / `CMD ["bun", "dist/index.ts"]`), and the runtime stage no longer copies `node_modules` + root `package.json` — the adapter's `dist/` tree is self-contained (SSR bundle externals are `node:*` builtins only).
- **`netlify.toml`** published `dist` with functions at `dist/.netlify/functions` and a redirect to a function named `server`; the netlify adapter stages the client into `dist/publish`, the function into `dist/netlify/functions`, and names it `ssr`. The file is now **generated per render mode**: SSR/ISR → `publish = "dist/publish"` + `[functions] directory = "dist/netlify/functions"` + redirect to `/.netlify/functions/ssr`; SSG → `publish = "dist"` (the prerendered root); SPA → `publish = "dist"` + the standard SPA fallback rewrite.
- **cloudflare**: the scaffolded root `_routes.json` is removed — Cloudflare Pages reads `_routes.json` from the deploy output dir (`pages_build_output_dir = "dist"`), where the adapter writes the authoritative one; the root copy was dead weight with misleading content (`exclude: ["/build/*"]`). `wrangler.toml` verified correct and locked.
- **vercel**: `vercel.json` (`outputDirectory: "dist"`) verified + locked. Known limitation (disclosed, tracked): the adapter stages the Build Output API tree INSIDE `dist/.vercel/output`, but Vercel only auto-detects it at the project root — so the scaffolded config deploys `dist` statically and the SSR function isn't reachable without a manual copy; fixing that requires the adapter to learn the project root.

`@pyreon/zero` now exports the adapter **output-path contract** (`NODE_ADAPTER_OUTPUT` / `BUN_ADAPTER_OUTPUT` / `NETLIFY_ADAPTER_OUTPUT` / `CLOUDFLARE_ADAPTER_OUTPUT` / `VERCEL_ADAPTER_OUTPUT` from `@pyreon/zero/server`); the adapters build their staging paths from it, and `create-zero`'s new `adapter-contract.test.ts` runs every scaffolder `apply()` and asserts the written configs against the same constants — drift on either side fails the test. Also fixed: the netlify adapter's emitted `dist/netlify.toml` no longer carries a `conditions = {Role = [...]}` clause on its SSR redirect (a role-gated rewrite would have gated SSR behind Netlify JWT roles), and the blog template README's stale `dist/client/` output path is now `dist/`.

Note: the values encode the plugin-owned `zero build` layout (adapter artifacts staged into the one `dist/` tree).
