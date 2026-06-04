---
"@pyreon/zero": patch
"@pyreon/server": patch
---

fix(zero): SSR/ISR deploy artifact builds, runs, and hydrates (Bug A + C)

`mode: 'ssr'` / `'isr'` were unrunnable end-to-end. Three latent bugs, fixed
across the deploy adapters + the SSR build + the request handler:

**Bug A — copy-into-self EINVAL in every deploy adapter.** The SSR plugin
invokes each adapter with `clientOutDir === outDir === dist` and the server
bundle already at `dist/server`. Every adapter then did
`cp(clientOutDir, outDir/<subdir>)` — a copy of a directory into its own
subtree → Node `fs.cp` throws `ERR_FS_CP_EINVAL`. The node/bun server copy
(`cp(dist/server, dist/server)`) is an even more direct self-copy. The throw
was caught by the plugin and NOT rethrown, so the deploy artifact was never
staged: `node dist/index.js` (the runnable server) never existed. New
`materialize()` helper (`adapters/stage.ts`) handles same-dir (no-op),
dest-inside-src (per-entry copy — preserves the flat outDir for `vite preview`,
no copy-into-self), and disjoint (copy) — wired into
all six adapters (node, bun, static, vercel, netlify, cloudflare). The
pre-existing adapter tests used a client dir DISTINCT from outDir and so never
exercised the real shape; a same-dir regression block now covers all six.

**Bug C — `/` shipped the empty template shell + no HTTP wrapper.** Once
staging works, the node/bun server static-served the SSR template `index.html`
at `/`, shipping the unfilled `<!--pyreon-app-->` shell instead of
server-rendering the home route. Now `/` and any `.html` path fall through to
the SSR handler; only real assets (js/css/images/fonts) are static-served.

**Production hydration — SSR shipped the DEV client entry.** `createHandler`
defaulted `clientEntry` to `/src/entry-client.ts` (a dev path that 404s in
production), so the page server-rendered but never hydrated. The SSR build now
copies the built client `index.html` → `dist/server/template.html` (it carries
the hashed `<script>` + CSS `<link>`); `createServer` reads that sibling as the
production template and suppresses the dev client-entry injection via the new
`clientEntry: false` handler option. Every adapter copies the whole server
dir, so the template travels to node/bun/vercel/netlify/cloudflare alike.

Also fixes the `createServer` JSDoc example to import from `@pyreon/zero/server`
(the bare `@pyreon/zero` import throws the server-only guard).

Proven end-to-end: a new `ssr-node` real-Chromium gate builds ssr-showcase in
`mode: 'ssr'` and runs the emitted `node dist/index.js`, asserting `/` is
server-rendered (not the shell), static assets serve, and the page hydrates +
client-navigates. verify-modes asserts the staged `dist/{client,server,index.js}`
layout + the production template; unit tests cover the staging helper, all six
adapters' same-dir staging, the `clientEntry: false` suppression, and the
adapters' spawn-and-curl runtime contract.
